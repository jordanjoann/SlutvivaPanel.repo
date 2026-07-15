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
import { ensureGtaServerData } from "./gta/server-data";

const LAND_CLAIM_MIN_SIZE = { X: 5, Y: 5, Z: 5 };
const SERVER_ROLES_FILE_EDIT_WARNING =
  "Role definitions live here. Server runtime settings live in serverconfig.json, and Stratum feature settings live in stratum.json.";

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
  if (inst.game === "gta") {
    await ensureGtaServerData(inst);
    return;
  }

  const paths = vsPaths(inst.id);
  const file = paths.serverConfig;
  if (!existsSync(file)) {
    await writeJson(file, serverConfig(inst));
    await ensureServerRoles(paths.serverRoles, {});
    return;
  }

  const raw = await fs.readFile(file, "utf8").catch(() => "");
  const current = parseJsonObject(raw);
  await ensureServerRoles(paths.serverRoles, current);
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
  if (inst.game === "gta") {
    await ensureGtaServerData(inst, { cloneBaseResources: false });
    return;
  }

  const p = vsPaths(inst.id);

  await writeJson(p.serverConfig, serverConfig(inst, input));
  await ensureServerRoles(p.serverRoles, {});
}

function withRequiredServerConfig(config: Record<string, unknown>, inst?: Instance) {
  const rest = { ...config };
  delete rest.RoleByCode;
  delete rest.RolesByCode;
  delete rest.Roles;
  delete rest.DefaultRoleCode;

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
    ModPaths: Array.isArray(config.ModPaths) ? config.ModPaths : ["Mods", "/data/Mods"],
    WorldConfig: {
      ...worldConfig,
      WorldName: worldName,
      SaveFileLocation: saveFileLocation,
    },
  };
}

async function ensureServerRoles(
  file: string,
  legacyConfig: Record<string, unknown>,
): Promise<void> {
  const existing = parseJsonObject(await fs.readFile(file, "utf8").catch(() => ""));
  if (roleCodes(existing).length > 0) return;

  const legacyRoles = rolesFromConfig(legacyConfig);
  const roles = legacyRoles.length > 0 ? legacyRoles : DEFAULT_ROLES;
  const codes = roleCodes({ Roles: roles });
  const requestedDefault = legacyConfig.DefaultRoleCode;
  const defaultRoleCode =
    typeof requestedDefault === "string" && codes.includes(requestedDefault)
      ? requestedDefault
      : codes.includes("suplayer")
        ? "suplayer"
        : codes[0];

  await writeJson(file, {
    FileEditWarning: SERVER_ROLES_FILE_EDIT_WARNING,
    ConfigVersion: "1.0",
    DefaultRoleCode: defaultRoleCode,
    Roles: roles,
  });
}

function rolesFromConfig(config: Record<string, unknown>): unknown[] {
  if (Array.isArray(config.Roles)) return config.Roles;

  for (const key of ["RoleByCode", "RolesByCode"]) {
    const roleMap = config[key];
    if (typeof roleMap === "object" && roleMap !== null && !Array.isArray(roleMap)) {
      return Object.entries(roleMap).map(([code, role]) =>
        typeof role === "object" && role !== null && !Array.isArray(role)
          ? { Code: code, ...role }
          : role,
      );
    }
  }
  return [];
}

function roleCodes(config: Record<string, unknown>): string[] {
  return rolesFromConfig(config)
    .map((role) =>
      typeof role === "object" && role !== null && "Code" in role
        ? role.Code
        : undefined,
    )
    .filter((code): code is string => typeof code === "string" && code.length > 0);
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
