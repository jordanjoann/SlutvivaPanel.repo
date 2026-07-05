import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { Instance } from "@/lib/types";

const execFileAsync = promisify(execFile);
const CFX_SERVER_DATA_REPO = "https://github.com/citizenfx/cfx-server-data.git";
const PLACEHOLDER_LICENSE = "replace-with-cfx-license-key";
const DEFAULT_PANEL_INTERNAL_URL =
  process.env.SLUTVIVAL_PANEL_INTERNAL_URL ?? "http://slutvival-panel:3000";
const SLUTVIVAL_ADMIN_FXMANIFEST = `fx_version 'cerulean'
game 'gta5'

author 'Slutvival'
description 'Slutvival panel bridge and basic GTA moderation commands'
version '0.1.0'

server_script 'server.lua'
`;
const SLUTVIVAL_ADMIN_SERVER_LUA = `local panelUrl = GetConvar("slutvival_panel_url", "")
local serverId = GetConvar("slutvival_panel_server_id", "")
local bridgeToken = GetConvar("slutvival_bridge_token", "")

local SUPPORTED_IDENTIFIER_TYPES = {
  license = true,
  license2 = true,
  discord = true,
  steam = true,
  fivem = true,
  ip = true,
}

local function structuredIdentifier(identifier)
  local separator = string.find(identifier, ":", 1, true)
  local identifierType = "unknown"

  if separator and separator > 1 then
    identifierType = string.sub(identifier, 1, separator - 1)
  end

  if not SUPPORTED_IDENTIFIER_TYPES[identifierType] then
    identifierType = "unknown"
  end

  return {
    type = identifierType,
    value = identifier,
  }
end

local function collectIdentifiers(player)
  local identifiers = {}

  for _, identifier in ipairs(GetPlayerIdentifiers(player)) do
    identifiers[#identifiers + 1] = structuredIdentifier(identifier)
  end

  return identifiers
end

local function safeNumber(value)
  if type(value) == "number" then
    return value
  end

  return nil
end

local function collectPosition(ped)
  if not ped or ped == 0 then
    return nil
  end

  local coords = GetEntityCoords(ped)

  if not coords then
    return nil
  end

  return {
    x = safeNumber(coords.x),
    y = safeNumber(coords.y),
    z = safeNumber(coords.z),
  }
end

local function collectVehicle(ped)
  if not ped or ped == 0 then
    return nil
  end

  local vehicle = GetVehiclePedIsIn(ped, false)

  if not vehicle or vehicle == 0 then
    return {
      inVehicle = false,
    }
  end

  return {
    inVehicle = true,
    modelHash = GetEntityModel(vehicle),
    plate = GetVehicleNumberPlateText(vehicle),
  }
end

local function collectPlayer(player, playerName)
  local ped = GetPlayerPed(player)

  return {
    serverId = tonumber(player),
    name = playerName or GetPlayerName(player) or "",
    pingMs = GetPlayerPing(player),
    identifiers = collectIdentifiers(player),
    position = collectPosition(ped),
    heading = ped and ped ~= 0 and GetEntityHeading(ped) or nil,
    health = ped and ped ~= 0 and GetEntityHealth(ped) or nil,
    armour = ped and ped ~= 0 and GetPedArmour(ped) or nil,
    vehicle = collectVehicle(ped),
  }
end

local function collectPlayers()
  local players = {}

  for _, player in ipairs(GetPlayers()) do
    players[#players + 1] = collectPlayer(player)
  end

  return players
end

local function bridgeEndpoint()
  if panelUrl == "" or serverId == "" then
    return nil
  end

  return panelUrl:gsub("/+$", "") .. "/api/instances/" .. serverId .. "/gta/bridge"
end

local function sendBridgeEvent(eventName, data, callback)
  local endpoint = bridgeEndpoint()

  if not endpoint or bridgeToken == "" then
    if callback then
      callback(false, {})
    end
    return
  end

  local payload = data or {}
  payload.type = eventName
  payload.serverToken = bridgeToken

  PerformHttpRequest(endpoint, function(statusCode, body)
    local response = {}

    if body and body ~= "" then
      local ok, decoded = pcall(json.decode, body)
      if ok and decoded then
        response = decoded
      end
    end

    if callback then
      callback(type(statusCode) == "number" and statusCode >= 200 and statusCode < 300, response)
    end
  end, "POST", json.encode(payload), {
    ["Content-Type"] = "application/json",
  })
end

CreateThread(function()
  while true do
    sendBridgeEvent("heartbeat", {
      resource = GetCurrentResourceName(),
      players = collectPlayers(),
    })

    Wait(2000)
  end
end)

AddEventHandler("playerConnecting", function(playerName, setKickReason, deferrals)
  local player = source
  local identifiers = collectIdentifiers(player)
  local playerData = collectPlayer(player, playerName)

  deferrals.defer()
  Wait(0)
  deferrals.update("Checking Slutvival access...")

  sendBridgeEvent("banCheck", {
    identifiers = identifiers,
    player = playerData,
  }, function(ok, response)
    if ok and response and response.allowed == false then
      deferrals.done(response.reason or "Connection refused.")
      return
    end

    sendBridgeEvent("playerJoin", {
      player = collectPlayer(player, playerName),
    })

    deferrals.done()
  end)
end)

AddEventHandler("playerDropped", function(reason)
  local player = source

  sendBridgeEvent("playerDrop", {
    serverId = tonumber(player),
    reason = reason,
  })
end)

RegisterCommand("slutvival_kick", function(source, args)
  if source ~= 0 then
    return
  end

  local target = tonumber(args[1])
  if not target then
    return
  end

  local reason = table.concat(args, " ", 2)
  if reason == "" then
    reason = "Kicked by Slutvival admin."
  end

  DropPlayer(target, reason)
end, false)
`;

export async function ensureGtaServerData(
  inst: Instance,
  options: { cloneBaseResources?: boolean } = {},
): Promise<void> {
  await fs.mkdir(inst.dataPath, { recursive: true });
  await fs.mkdir(path.join(inst.dataPath, "resources"), { recursive: true });
  await fs.mkdir(path.join(inst.dataPath, "cache"), { recursive: true });
  await fs.mkdir(path.join(inst.dataPath, "txData"), { recursive: true });

  await fs.writeFile(path.join(inst.dataPath, "server.cfg"), gtaServerConfig(inst), "utf8");
  await writeIfMissing(path.join(inst.dataPath, "server.secret.cfg"), gtaSecretTemplate());
  await ensureGtaBridgeToken(inst);
  await writeSlutvivalAdminResource(inst);

  if (options.cloneBaseResources !== false) {
    await ensureBaseResources(inst.dataPath);
  }
}

export async function readGtaBridgeToken(inst: Instance): Promise<string | null> {
  try {
    const raw = await fs.readFile(path.join(inst.dataPath, "server.secret.cfg"), "utf8");
    const match = /^\s*set\s+slutvival_bridge_token\s+"?([a-f0-9]{48})"?\s*$/imu.exec(raw);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export async function hasUsableGtaSecret(inst: Instance): Promise<boolean> {
  try {
    const raw = await fs.readFile(path.join(inst.dataPath, "server.secret.cfg"), "utf8");
    const match = /^\s*sv_licenseKey\s+"?([^"\s]+)"?/mu.exec(raw);
    return Boolean(match?.[1] && match[1] !== PLACEHOLDER_LICENSE);
  } catch {
    return false;
  }
}

export function gtaServerConfig(inst: Instance): string {
  const description = inst.description?.trim() || "Slutvival FiveM server";
  return [
    `endpoint_add_tcp "0.0.0.0:${inst.port}"`,
    `endpoint_add_udp "0.0.0.0:${inst.port}"`,
    "",
    "ensure mapmanager",
    "ensure chat",
    "ensure spawnmanager",
    "ensure sessionmanager",
    "ensure basic-gamemode",
    "ensure hardcap",
    "ensure rconlog",
    "",
    `set slutvival_panel_url "${escapeCfg(DEFAULT_PANEL_INTERNAL_URL)}"`,
    `set slutvival_panel_server_id "${escapeCfg(inst.id)}"`,
    "",
    "sv_scriptHookAllowed 0",
    'sets tags "slutvival,default"',
    'sets locale "en-US"',
    `sv_hostname "${escapeCfg(inst.name)}"`,
    `sets sv_projectName "${escapeCfg(inst.name)}"`,
    `sets sv_projectDesc "${escapeCfg(description)}"`,
    "set onesync on",
    `sv_maxclients ${inst.maxPlayers}`,
    "exec server.secret.cfg",
    "",
    "ensure slutvival-admin",
    "",
  ].join("\n");
}

export function gtaSecretTemplate(): string {
  return [
    "# Local FiveM secrets. This file must stay out of Git.",
    `sv_licenseKey "${PLACEHOLDER_LICENSE}"`,
    'set steam_webApiKey ""',
    "",
  ].join("\n");
}

async function writeIfMissing(file: string, content: string): Promise<void> {
  if (existsSync(file)) return;
  await fs.writeFile(file, content, "utf8");
}

async function ensureGtaBridgeToken(inst: Instance): Promise<string> {
  const existing = await readGtaBridgeToken(inst);
  if (existing) return existing;

  const file = path.join(inst.dataPath, "server.secret.cfg");
  let raw = "";
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    raw = "";
  }

  const token = randomBytes(24).toString("hex");
  const prefix = raw === "" || raw.endsWith("\n") ? raw : `${raw}\n`;
  await fs.writeFile(file, `${prefix}set slutvival_bridge_token "${token}"\n`, "utf8");

  return token;
}

async function writeSlutvivalAdminResource(inst: Instance): Promise<void> {
  const resourcePath = path.join(inst.dataPath, "resources", "[slutvival]", "slutvival-admin");

  await fs.mkdir(resourcePath, { recursive: true });
  await fs.writeFile(path.join(resourcePath, "fxmanifest.lua"), SLUTVIVAL_ADMIN_FXMANIFEST, "utf8");
  await fs.writeFile(path.join(resourcePath, "server.lua"), SLUTVIVAL_ADMIN_SERVER_LUA, "utf8");
}

async function ensureBaseResources(dataPath: string): Promise<void> {
  const marker = path.join(dataPath, "resources", "[managers]", "mapmanager");
  if (existsSync(marker)) return;
  const tmp = path.join(dataPath, `.cfx-server-data-${Date.now()}`);
  await fs.rm(tmp, { recursive: true, force: true });
  try {
    await execFileAsync("git", ["clone", "--depth=1", CFX_SERVER_DATA_REPO, tmp]);
    await fs.cp(path.join(tmp, "resources"), path.join(dataPath, "resources"), {
      recursive: true,
      force: true,
    });
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

function escapeCfg(value: string): string {
  return value.replace(/["\\]/g, "");
}
