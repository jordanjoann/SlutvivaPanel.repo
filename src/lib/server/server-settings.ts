import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type {
  Instance,
  ModBlacklistEntry,
  ModSearchResult,
  ServerSettings,
} from "@/lib/types";
import { updateInstance } from "./store";
import { vsPaths } from "./config";

type JsonObject = Record<string, unknown>;

const DEFAULT_MASTER_SERVER_URL = "https://masterserver.vintagestory.at/api/";
const DEFAULT_MOD_DB_URL = "https://mods.vintagestory.at/";

export async function getServerSettings(instance: Instance): Promise<ServerSettings> {
  const raw = await readServerConfig(instance);
  return toSettings(instance, raw);
}

export async function updateServerSettings(
  instance: Instance,
  settings: ServerSettings,
): Promise<{ instance: Instance; settings: ServerSettings }> {
  const raw = await readServerConfig(instance);
  const nextConfig = applySettings(raw, settings);
  await writeServerConfig(instance.id, nextConfig);

  const nextInstance = await updateInstance(instance.id, {
    name: settings.general.serverName,
    description: settings.general.serverDescription,
    motd: settings.general.welcomeMessage,
    maxPlayers: settings.general.maxPlayers,
    passwordProtected: settings.general.password.trim().length > 0,
    publicAdvertised: settings.general.advertiseServer,
    port: settings.network.port,
  });

  const updated = nextInstance ?? {
    ...instance,
    name: settings.general.serverName,
    description: settings.general.serverDescription,
    motd: settings.general.welcomeMessage,
    maxPlayers: settings.general.maxPlayers,
    passwordProtected: settings.general.password.trim().length > 0,
    publicAdvertised: settings.general.advertiseServer,
    port: settings.network.port,
  };

  return {
    instance: updated,
    settings: toSettings(updated, nextConfig),
  };
}

export async function addBlacklistedMod(
  instance: Instance,
  mod: ModSearchResult,
): Promise<ServerSettings> {
  const raw = await readServerConfig(instance);
  const current = toSettings(instance, raw);
  const entry = toBlacklistEntry(mod);
  const next: ServerSettings = {
    ...current,
    mods: {
      ...current.mods,
      modBlacklist: [
        ...current.mods.modBlacklist.filter((item) => item.id !== entry.id),
        entry,
      ].sort((a, b) => a.name.localeCompare(b.name)),
    },
  };
  const nextConfig = applySettings(raw, next);
  await writeServerConfig(instance.id, nextConfig);
  return toSettings(instance, nextConfig);
}

export async function removeBlacklistedMod(
  instance: Instance,
  modId: string,
): Promise<ServerSettings> {
  const raw = await readServerConfig(instance);
  const current = toSettings(instance, raw);
  const next: ServerSettings = {
    ...current,
    mods: {
      ...current.mods,
      modBlacklist: current.mods.modBlacklist.filter((item) => item.id !== modId),
    },
  };
  const nextConfig = applySettings(raw, next);
  await writeServerConfig(instance.id, nextConfig);
  return toSettings(instance, nextConfig);
}

async function readServerConfig(instance: Instance): Promise<JsonObject> {
  const file = vsPaths(instance.id).serverConfig;
  if (!existsSync(file)) return {};
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function writeServerConfig(serverId: string, config: JsonObject) {
  const file = vsPaths(serverId).serverConfig;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function toSettings(instance: Instance, raw: JsonObject): ServerSettings {
  const worldConfig = objectValue(raw.WorldConfig);

  return {
    general: {
      serverName: stringValue(raw, ["ServerName"], instance.name),
      serverDescription: stringValue(raw, ["ServerDescription"], instance.description ?? ""),
      welcomeMessage: stringValue(raw, ["WelcomeMessage", "Motd"], instance.motd ?? ""),
      advertiseServer: boolValue(raw, ["AdvertiseServer"], instance.publicAdvertised),
      maxPlayers: numberValue(raw, ["MaxClients"], instance.maxPlayers),
      passTimeWhenEmpty: boolValue(raw, ["PassTimeWhenEmpty"], false),
      password: stringValue(raw, ["Password"], ""),
      whitelistMode: whitelistValue(raw),
      allowPvp: boolValue(raw, ["AllowPvP", "AllowPVP", "AllowPvp"], boolValue(worldConfig, ["AllowPvP", "AllowPVP", "AllowPvp"], true)),
      allowFireSpread: boolValue(raw, ["AllowFireSpread"], boolValue(worldConfig, ["AllowFireSpread"], true)),
      allowFallingBlocks: boolValue(raw, ["AllowFallingBlocks"], boolValue(worldConfig, ["AllowFallingBlocks"], true)),
    },
    admin: {
      entityDebugMode: boolValue(raw, ["EntityDebugMode"], false),
      masterServerUrl: stringValue(raw, ["MasterServerUrl", "MasterserverUrl"], DEFAULT_MASTER_SERVER_URL),
      modDbUrl: stringValue(raw, ["ModDbUrl", "ModDBUrl"], DEFAULT_MOD_DB_URL),
      antiAbuseLevel: numberValue(raw, ["AntiAbuse", "AntiAbuseLevel"], 0),
      maxOwnedGroupChannelsPerUser: numberValue(raw, ["MaxOwnedGroupChannelsPerUser"], 1),
      numberOfLandClaims: numberValue(raw, ["NumberOfLandClaims"], 1),
      landClaimMinSize: numberValue(raw, ["LandClaimMinSize"], 1),
      landClaimMaxSize: numberValue(raw, ["LandClaimMaxSize"], 256),
      chatRateLimitMs: numberValue(raw, ["ChatRateLimitMs"], 1000),
      dieBelowDiskSpaceMb: numberValue(raw, ["DieBelowDiskSpaceMB", "DieBelowDiskSpaceMb"], 1000),
    },
    world: {
      maxChunkRadius: numberValue(raw, ["MaxChunkRadius"], numberValue(worldConfig, ["MaxChunkRadius"], 12)),
    },
    network: {
      port: numberValue(raw, ["Port"], instance.port),
      upnp: boolValue(raw, ["Upnp", "UPNP"], false),
      compressPackets: boolValue(raw, ["CompressPackets"], true),
      clientConnectionTimeoutSeconds: numberValue(raw, ["ClientConnectionTimeout", "ClientConnectionTimeoutSeconds"], 360),
    },
    mods: {
      modPaths: stringArrayValue(raw, ["ModPaths"], []),
      modBlacklist: blacklistValue(raw),
    },
  };
}

function applySettings(raw: JsonObject, settings: ServerSettings): JsonObject {
  const worldConfig = { ...objectValue(raw.WorldConfig) };
  worldConfig.AllowPvP = settings.general.allowPvp;
  worldConfig.AllowFireSpread = settings.general.allowFireSpread;
  worldConfig.AllowFallingBlocks = settings.general.allowFallingBlocks;
  worldConfig.MaxChunkRadius = safeInteger(settings.world.maxChunkRadius, 12);

  return {
    ...raw,
    ServerName: settings.general.serverName,
    ServerDescription: settings.general.serverDescription,
    WelcomeMessage: settings.general.welcomeMessage,
    Motd: settings.general.welcomeMessage,
    AdvertiseServer: settings.general.advertiseServer,
    MaxClients: safeInteger(settings.general.maxPlayers, 16),
    PassTimeWhenEmpty: settings.general.passTimeWhenEmpty,
    Password: settings.general.password,
    OnlyWhitelisted: settings.general.whitelistMode,
    WhitelistMode: settings.general.whitelistMode ? 2 : 1,
    AllowPvP: settings.general.allowPvp,
    AllowFireSpread: settings.general.allowFireSpread,
    AllowFallingBlocks: settings.general.allowFallingBlocks,
    EntityDebugMode: settings.admin.entityDebugMode,
    MasterServerUrl: settings.admin.masterServerUrl,
    ModDbUrl: settings.admin.modDbUrl,
    AntiAbuse: safeInteger(settings.admin.antiAbuseLevel, 0),
    MaxOwnedGroupChannelsPerUser: safeInteger(settings.admin.maxOwnedGroupChannelsPerUser, 1),
    NumberOfLandClaims: safeInteger(settings.admin.numberOfLandClaims, 1),
    LandClaimMinSize: safeInteger(settings.admin.landClaimMinSize, 1),
    LandClaimMaxSize: safeInteger(settings.admin.landClaimMaxSize, 256),
    ChatRateLimitMs: safeInteger(settings.admin.chatRateLimitMs, 1000),
    DieBelowDiskSpaceMB: safeInteger(settings.admin.dieBelowDiskSpaceMb, 1000),
    MaxChunkRadius: safeInteger(settings.world.maxChunkRadius, 12),
    Port: safeInteger(settings.network.port, 42420),
    Upnp: settings.network.upnp,
    CompressPackets: settings.network.compressPackets,
    ClientConnectionTimeout: safeInteger(settings.network.clientConnectionTimeoutSeconds, 360),
    ModPaths: settings.mods.modPaths.map((value) => value.trim()).filter(Boolean),
    ModBlacklist: settings.mods.modBlacklist,
    WorldConfig: worldConfig,
  };
}

function toBlacklistEntry(mod: ModSearchResult): ModBlacklistEntry {
  return {
    id: mod.id,
    name: mod.name,
    author: mod.author,
    summary: mod.summary,
    iconUrl: mod.iconUrl,
    side: mod.side,
    latestVersion: mod.latestVersion,
  };
}

function blacklistValue(raw: JsonObject): ModBlacklistEntry[] {
  const values =
    arrayValue(raw.ModBlacklist) ??
    arrayValue(raw.ModBlackList) ??
    arrayValue(raw.ModIdBlacklist) ??
    arrayValue(raw.ModIdBlackList) ??
    [];

  return values
    .map((value): ModBlacklistEntry | null => {
      if (typeof value === "string") {
        const id = value.trim().toLowerCase();
        return id ? { id, name: value.trim() } : null;
      }
      if (!isObject(value)) return null;
      const id = stringValue(value, ["id", "modId", "ModId"], "").trim().toLowerCase();
      const name = stringValue(value, ["name", "Name"], id);
      if (!id) return null;
      return {
        id,
        name,
        author: optionalString(value, ["author", "Author"]),
        summary: optionalString(value, ["summary", "Summary"]),
        iconUrl: optionalString(value, ["iconUrl", "IconUrl"]),
        side: sideValue(value),
        latestVersion: optionalString(value, ["latestVersion", "LatestVersion"]),
      };
    })
    .filter((entry): entry is ModBlacklistEntry => entry !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function stringValue(source: JsonObject, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
  }
  return fallback;
}

function optionalString(source: JsonObject, keys: string[]): string | undefined {
  const value = stringValue(source, keys, "");
  return value || undefined;
}

function numberValue(source: JsonObject, keys: string[], fallback: number): number {
  for (const key of keys) {
    const value = source[key];
    const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function boolValue(source: JsonObject, keys: string[], fallback: boolean): boolean {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (["true", "1", "yes", "on"].includes(value.toLowerCase())) return true;
      if (["false", "0", "no", "off"].includes(value.toLowerCase())) return false;
    }
    if (typeof value === "number") return value !== 0;
  }
  return fallback;
}

function whitelistValue(source: JsonObject): boolean {
  const mode = source.WhitelistMode;
  if (typeof mode === "number") {
    if (mode === 2) return true;
    if (mode === 1) return false;
  }
  if (typeof mode === "string") {
    if (mode === "2") return true;
    if (mode === "1") return false;
  }
  return boolValue(source, ["OnlyWhitelisted"], false);
}

function stringArrayValue(source: JsonObject, keys: string[], fallback: string[]): string[] {
  for (const key of keys) {
    const value = source[key];
    const arr = arrayValue(value);
    if (arr) return arr.map((item) => String(item)).filter(Boolean);
    if (typeof value === "string" && value.trim()) return [value.trim()];
  }
  return fallback;
}

function sideValue(source: JsonObject): ModBlacklistEntry["side"] {
  const side = stringValue(source, ["side", "Side"], "");
  return side === "Client" || side === "Server" || side === "Universal" ? side : undefined;
}

function arrayValue(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function objectValue(value: unknown): JsonObject {
  return isObject(value) ? value : {};
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeInteger(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}
