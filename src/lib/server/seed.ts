import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { CreateInstanceInput, Instance } from "@/lib/types";
import {
  normalizeWorldGenerationConfig,
  playStyleMeta,
  toWorldConfigurationPayload,
} from "@/lib/vintage-story-world";
import { vsPaths } from "./config";

const LAND_CLAIM_MIN_SIZE = { X: 5, Y: 5, Z: 5 };

const DEFAULT_ROLES = [
  {
    Code: "suplayer",
    PrivilegeLevel: 0,
    Name: "Survival Player",
    Description:
      "Can use/place/break blocks in unprotected areas, create/manage player groups and chat.",
    DefaultSpawn: null,
    ForcedSpawn: null,
    Privileges: [
      "controlplayergroups",
      "manageplayergroups",
      "chat",
      "areamodify",
      "build",
      "useblock",
      "attackcreatures",
      "attackplayers",
      "selfkill",
    ],
    RuntimePrivileges: [],
    DefaultGameMode: 1,
    Color: "White",
    LandClaimAllowance: 262144,
    LandClaimMinSize: LAND_CLAIM_MIN_SIZE,
    LandClaimMaxAreas: 3,
    AutoGrant: false,
  },
  {
    Code: "admin",
    PrivilegeLevel: 99999,
    Name: "Admin",
    Description: "Has all privileges, including granting admin status.",
    DefaultSpawn: null,
    ForcedSpawn: null,
    Privileges: [
      "build",
      "useblock",
      "buildblockseverywhere",
      "useblockseverywhere",
      "attackplayers",
      "attackcreatures",
      "freemove",
      "gamemode",
      "pickingrange",
      "chat",
      "kick",
      "ban",
      "whitelist",
      "setwelcome",
      "announce",
      "readlists",
      "give",
      "areamodify",
      "setspawn",
      "controlserver",
      "tp",
      "time",
      "grantrevoke",
      "root",
      "commandplayer",
      "controlplayergroups",
      "manageplayergroups",
      "selfkill",
      "manageotherplayergroups",
    ],
    RuntimePrivileges: [],
    DefaultGameMode: 1,
    Color: "LightBlue",
    LandClaimAllowance: 2147483647,
    LandClaimMinSize: LAND_CLAIM_MIN_SIZE,
    LandClaimMaxAreas: 99999,
    AutoGrant: true,
  },
];

function serverConfig(inst: Instance, input?: Pick<CreateInstanceInput, "initialWorldConfig" | "serverPassword">) {
  const world = normalizeWorldGenerationConfig(input?.initialWorldConfig);
  const style = playStyleMeta(world.playStyle);
  const worldName = inst.worldName?.trim() || "New World";
  const worldFileName = `${safeWorldFileName(worldName)}.vcdbs`;
  const password =
    typeof input?.serverPassword === "string" && input.serverPassword.trim()
      ? input.serverPassword.trim()
      : inst.passwordProtected
        ? "********"
        : "";
  const whitelist = world.whitelistMode || inst.development;

  return withRequiredServerConfig({
    FileEditWarning: "",
    ConfigVersion: "1.10",
    ServerName: inst.name,
    ServerDescription: inst.description ?? "",
    ServerUrl: "",
    WelcomeMessage: inst.motd ?? "Welcome to the server!",
    ServerLanguage: "en",
    Upnp: false,
    CompressPackets: true,
    AdvertiseServer: inst.publicAdvertised,
    MaxClients: inst.maxPlayers,
    Port: inst.port,
    Password: password,
    PassTimeWhenEmpty: world.passTimeWhenEmpty,
    MapSizeX: world.worldWidth,
    MapSizeY: world.worldHeight,
    MapSizeZ: world.worldLength,
    MaxChunkRadius: world.maxChunkRadius,
    AllowPvP: world.allowPvp,
    AllowFireSpread: world.allowFireSpread,
    AllowFallingBlocks: world.allowFallingBlocks,
    WorldConfig: {
      Seed: inst.seed?.trim() || null,
      SaveFileLocation: `/data/Saves/${worldFileName}`,
      WorldName: worldName,
      PlayStyle: world.playStyle,
      PlayStyleLangCode: style.langCode,
      WorldType: world.worldType,
      AllowCreativeMode: world.allowCreativeMode,
      WorldConfiguration: toWorldConfigurationPayload(world),
      MapSizeY: world.worldHeight,
    },
    StartupCommands: "",
    ModPaths: ["Mods", "/data/Mods"],
    ModConfig: {},
    OnlyWhitelisted: whitelist,
    WhitelistMode: whitelist ? 2 : 1,
    Motd: inst.motd ?? "",
  }, inst);
}

async function writeJson(file: string, data: unknown) {
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

export async function ensureRunnableServerConfig(inst: Instance): Promise<void> {
  const file = vsPaths(inst.id).serverConfig;
  if (!existsSync(file)) {
    await writeJson(file, serverConfig(inst));
    return;
  }

  const raw = await fs.readFile(file, "utf8").catch(() => "");
  const current = parseJsonObject(raw);
  const next = withRequiredServerConfig(current, inst);
  if (JSON.stringify(current) !== JSON.stringify(next)) {
    await writeJson(file, next);
  }
  await removePlaceholderSave(inst, next);
}

/** Write the first-run Vintage Story config for a new instance. */
export async function seedInstanceContent(
  inst: Instance,
  input?: Pick<CreateInstanceInput, "initialWorldConfig" | "serverPassword">,
): Promise<void> {
  const p = vsPaths(inst.id);

  await writeJson(p.serverConfig, serverConfig(inst, input));
}

function withRequiredServerConfig(config: Record<string, unknown>, inst?: Instance) {
  const rest = { ...config };
  delete rest.RoleByCode;
  const roles = Array.isArray(config.Roles) ? config.Roles : [];
  const hasDefaultRole = roles.some(
    (role) =>
      typeof role === "object" &&
      role !== null &&
      "Code" in role &&
      role.Code === "suplayer",
  );

  const worldConfig: Record<string, unknown> =
    typeof config.WorldConfig === "object" &&
    config.WorldConfig !== null &&
    !Array.isArray(config.WorldConfig)
      ? { ...config.WorldConfig }
      : {};
  const worldName =
    typeof worldConfig.WorldName === "string" && worldConfig.WorldName.trim()
      ? worldConfig.WorldName
      : inst?.worldName || "default";
  const saveFileLocation =
    typeof worldConfig.SaveFileLocation === "string" &&
    worldConfig.SaveFileLocation.startsWith("/data/")
      ? worldConfig.SaveFileLocation
      : `/data/Saves/${safeWorldFileName(worldName)}.vcdbs`;

  return {
    ...rest,
    DefaultRoleCode:
      typeof config.DefaultRoleCode === "string"
        ? config.DefaultRoleCode
        : "suplayer",
    Roles: hasDefaultRole ? roles : DEFAULT_ROLES,
    ModPaths: Array.isArray(config.ModPaths) ? config.ModPaths : ["Mods", "/data/Mods"],
    WorldConfig: {
      ...worldConfig,
      WorldName: worldName,
      SaveFileLocation: saveFileLocation,
    },
  };
}

function safeWorldFileName(name: string): string {
  const safe = name.replace(/[\\/]/g, "-").trim();
  return safe || "New World";
}

async function removePlaceholderSave(
  inst: Instance,
  config: Record<string, unknown>,
): Promise<void> {
  const worldConfig =
    typeof config.WorldConfig === "object" &&
    config.WorldConfig !== null &&
    !Array.isArray(config.WorldConfig)
      ? config.WorldConfig
      : {};
  const saveFileLocation =
    "SaveFileLocation" in worldConfig && typeof worldConfig.SaveFileLocation === "string"
      ? worldConfig.SaveFileLocation
      : "";
  if (!saveFileLocation.startsWith("/data/Saves/")) return;

  const saveFile = path.join(vsPaths(inst.id).saves, path.basename(saveFileLocation));
  const content = await fs.readFile(saveFile, "utf8").catch(() => "");
  if (content.startsWith("# Placeholder save file")) {
    await fs.rm(saveFile, { force: true });
  }
}

function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}
