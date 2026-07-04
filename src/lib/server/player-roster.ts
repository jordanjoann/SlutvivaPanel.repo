import fs from "node:fs/promises";
import path from "node:path";
import type { Instance, Player } from "@/lib/types";
import { vsPaths } from "./config";

type PlayerRecord = {
  uid?: string;
  name: string;
  role?: string;
  isWhitelisted?: boolean;
  playtimeSeconds?: number;
  lastSeen?: number;
  hasPlayed?: boolean;
};

type ServerConfig = {
  RoleByCode?: Record<string, unknown>;
  Roles?: Array<{ Code?: unknown }>;
  DefaultRoleCode?: unknown;
};

type RoleConfig = {
  roles: string[];
  defaultRole: string;
};

type ServerPlayerData = {
  PlayerUID?: unknown;
  RoleCode?: unknown;
  LastKnownPlayername?: unknown;
  LastJoinDate?: unknown;
  FirstJoinDate?: unknown;
  CustomPlayerData?: Record<string, unknown>;
};

type PlayerEntry = {
  PlayerUID?: unknown;
  PlayerName?: unknown;
  UntilDate?: unknown;
};

type ResolvePlayerNameResponse = {
  playeruid?: unknown;
  valid?: unknown;
};

type ResolvePlayerUidResponse = {
  playername?: unknown;
  valid?: unknown;
};

const FALLBACK_OFFLINE_NAMES = [
  "WillowBark",
  "IronBloom",
  "ClayHollow",
  "RustyPickaxe",
  "SaltMarsh",
];

export type PlayerRoster = {
  players: Player[];
  offline: Player[];
  whitelist: Player[];
  assignedRoles: Player[];
  roles: string[];
  defaultRole: string;
};

export async function getPlayerRoster(
  instance: Instance,
  onlinePlayers: Player[],
): Promise<PlayerRoster> {
  const { roles, defaultRole } = await readRoleConfig(instance.id);
  const records = await readRosterRecords(instance.id);
  const recordsByName = new Map(
    records.map((record) => [record.name.toLowerCase(), record]),
  );
  const recordsByUid = new Map(
    records
      .filter((record) => record.uid)
      .map((record) => [record.uid!.toLowerCase(), record]),
  );
  const online = onlinePlayers.map((player) =>
    normalizeOnlinePlayer(
      player,
      defaultRole,
      recordsByName.get(player.name.toLowerCase()) ??
        recordsByUid.get(player.uid.toLowerCase()),
    ),
  );
  const onlineKeys = new Set(
    online.flatMap((player) => [
      player.name.toLowerCase(),
      player.uid.toLowerCase(),
    ]),
  );
  const source =
    records.length > 0
      ? records.filter((record) => record.hasPlayed)
      : fallbackOfflineRecords(defaultRole, roles);
  const offline = source
    .filter((record) => {
      const uid = record.uid?.toLowerCase();
      return (
        record.name &&
        !onlineKeys.has(record.name.toLowerCase()) &&
        (!uid || !onlineKeys.has(uid))
      );
    })
    .map((record, index) => recordToPlayer(record, defaultRole, index));
  const managed = records.map((record, index) => recordToPlayer(record, defaultRole, index));
  const whitelist = managed.filter((player) => player.isWhitelisted);
  const assignedRoles = managed.filter((player) => (player.role ?? defaultRole) !== defaultRole);

  return { players: online, offline, whitelist, assignedRoles, roles, defaultRole };
}

export async function updateKnownPlayer(
  serverId: string,
  name: string,
  patch: Partial<Pick<PlayerRecord, "role" | "isWhitelisted">>,
): Promise<void> {
  const { defaultRole } = await readRoleConfig(serverId);
  const records = await readPlayerRecords(serverId);
  const identity = await resolvePlayerIdentity(serverId, name);
  const related = records.filter((record) =>
    matchesAnyPlayerRecord(record, [name, identity.name, identity.uid]),
  );
  const current = related.reduce<PlayerRecord | undefined>(
    (merged, record) => (merged ? mergePanelRecord(merged, record) : record),
    undefined,
  );
  const next: PlayerRecord = {
    uid: identity.uid ?? current?.uid,
    name: identity.name ?? current?.name ?? name,
    role: patch.role ?? current?.role ?? defaultRole,
    isWhitelisted: patch.isWhitelisted ?? current?.isWhitelisted ?? true,
    playtimeSeconds: current?.playtimeSeconds ?? 0,
    lastSeen: current?.lastSeen ?? Date.now(),
  };

  await writePlayerRecords(serverId, [
    ...records.filter(
      (record) => !matchesAnyPlayerRecord(record, [name, identity.name, identity.uid]),
    ),
    next,
  ]);
}

async function readRoleConfig(serverId: string): Promise<RoleConfig> {
  try {
    const raw = await fs.readFile(vsPaths(serverId).serverConfig, "utf8");
    const parsed = JSON.parse(raw) as ServerConfig;
    const roles = roleCodesFromConfig(parsed);
    if (roles.length > 0) {
      const defaultRole = isNonEmptyString(parsed.DefaultRoleCode) &&
        roles.includes(parsed.DefaultRoleCode)
        ? parsed.DefaultRoleCode
        : preferredDefaultRole(roles);
      return { roles, defaultRole };
    }
  } catch {
    /* fall back below */
  }
  const roles = ["admin", "member"];
  return { roles, defaultRole: preferredDefaultRole(roles) };
}

function roleCodesFromConfig(config: ServerConfig): string[] {
  const roleByCode = Object.keys(config.RoleByCode ?? {}).filter(isNonEmptyString);
  const roleArray = Array.isArray(config.Roles)
    ? config.Roles.map((role) => role.Code).filter(isNonEmptyString)
    : [];
  return uniqueStrings(roleByCode.length > 0 ? roleByCode : roleArray);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

async function readRosterRecords(serverId: string): Promise<PlayerRecord[]> {
  const [panelRecords, serverRecords] = await Promise.all([
    readPlayerRecords(serverId),
    readServerPlayerRecords(serverId),
  ]);
  return mergePlayerRecords(serverRecords, panelRecords);
}

async function readPlayerRecords(serverId: string): Promise<PlayerRecord[]> {
  try {
    const raw = await fs.readFile(playerRosterPath(serverId), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPlayerRecord);
  } catch {
    return [];
  }
}

async function readServerPlayerRecords(serverId: string): Promise<PlayerRecord[]> {
  const [playerData, whitelisted] = await Promise.all([
    readJsonArray<ServerPlayerData>(
      path.join(vsPaths(serverId).data, "Playerdata", "playerdata.json"),
      isServerPlayerData,
    ),
    readJsonArray<PlayerEntry>(
      path.join(vsPaths(serverId).data, "Playerdata", "playerswhitelisted.json"),
      isPlayerEntry,
    ),
  ]);
  const whitelistKeys = new Set(
    whitelisted.flatMap((entry) =>
      [entry.PlayerUID, entry.PlayerName].filter(isNonEmptyString).map((value) =>
        value.toLowerCase(),
      ),
    ),
  );

  return playerData.map((record) => {
    const uid = String(record.PlayerUID);
    const name = isNonEmptyString(record.LastKnownPlayername)
      ? record.LastKnownPlayername
      : uid;
    return {
      uid,
      name,
      role: isNonEmptyString(record.RoleCode) ? record.RoleCode : undefined,
      hasPlayed: true,
      isWhitelisted:
        whitelistKeys.has(uid.toLowerCase()) || whitelistKeys.has(name.toLowerCase())
          ? true
          : undefined,
      lastSeen: serverPlayerLastSeen(record),
    };
  });
}

async function readJsonArray<T>(
  file: string,
  guard: (value: unknown) => value is T,
): Promise<T[]> {
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(guard);
  } catch {
    return [];
  }
}

async function writePlayerRecords(
  serverId: string,
  records: PlayerRecord[],
): Promise<void> {
  const file = playerRosterPath(serverId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(records, null, 2), "utf8");
}

function playerRosterPath(serverId: string): string {
  return path.join(vsPaths(serverId).modConfig, "panel-players.json");
}

function normalizeOnlinePlayer(
  player: Player,
  defaultRole: string,
  record?: PlayerRecord,
): Player {
  const role = player.role ?? record?.role ?? (player.isOp ? "admin" : defaultRole);

  return {
    ...player,
    uid: record?.uid ?? player.uid,
    name: record?.name ?? player.name,
    role,
    isOp: role === "admin",
    isWhitelisted: record?.isWhitelisted ?? player.isWhitelisted ?? true,
    playtimeSeconds: record?.playtimeSeconds ?? player.playtimeSeconds,
    lastSeen: record?.lastSeen ?? player.lastSeen,
  };
}

function recordToPlayer(
  record: PlayerRecord,
  defaultRole: string,
  index: number,
): Player {
  return {
    uid: record.uid ?? `known-${slugName(record.name)}`,
    name: record.name,
    online: false,
    role: record.role ?? defaultRole,
    pingMs: 0,
    playtimeSeconds: record.playtimeSeconds ?? (index + 1) * 3600,
    isOp: (record.role ?? defaultRole) === "admin",
    isWhitelisted: record.isWhitelisted ?? true,
    lastSeen: record.lastSeen ?? Date.now() - (index + 1) * 86400000,
  };
}

function fallbackOfflineRecords(defaultRole: string, roles: string[]): PlayerRecord[] {
  const adminRole = roles.includes("admin") ? "admin" : defaultRole;
  return FALLBACK_OFFLINE_NAMES.map((name, index) => ({
    name,
    role: index === 0 ? adminRole : defaultRole,
    isWhitelisted: index !== FALLBACK_OFFLINE_NAMES.length - 1,
    playtimeSeconds: (index + 2) * 5400,
    lastSeen: Date.now() - (index + 1) * 43200000,
  }));
}

function preferredDefaultRole(roles: string[]): string {
  if (roles.includes("member")) return "member";
  if (roles.includes("suplayer")) return "suplayer";
  return roles[0] ?? "member";
}

function slugName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function matchesPlayerRecord(record: PlayerRecord, query: string): boolean {
  const normalized = query.toLowerCase();
  return (
    record.name.toLowerCase() === normalized ||
    (record.uid?.toLowerCase() === normalized)
  );
}

function matchesAnyPlayerRecord(record: PlayerRecord, queries: Array<string | undefined>): boolean {
  return queries.some((query) => query && matchesPlayerRecord(record, query));
}

async function resolvePlayerIdentity(
  serverId: string,
  input: string,
): Promise<Pick<PlayerRecord, "name" | "uid">> {
  const trimmed = input.trim();
  const local = (await readRosterRecords(serverId)).find((record) =>
    matchesPlayerRecord(record, trimmed),
  );
  if (local?.uid) return { name: local.name, uid: local.uid };

  const resolvedUid = await resolvePlayerName(trimmed);
  if (resolvedUid) {
    const canonicalName = await resolvePlayerUid(resolvedUid);
    return { name: canonicalName ?? trimmed, uid: resolvedUid };
  }

  const resolvedName = await resolvePlayerUid(trimmed);
  if (resolvedName) return { name: resolvedName, uid: trimmed };

  return playerIdentity(trimmed);
}

function playerIdentity(input: string): Pick<PlayerRecord, "name" | "uid"> {
  return looksLikeUuid(input)
    ? { name: input, uid: input }
    : { name: input, uid: `known-${slugName(input)}` };
}

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function resolvePlayerName(playername: string): Promise<string | undefined> {
  const response = await postAuthResolve<ResolvePlayerNameResponse>(
    "https://auth3.vintagestory.at/resolveplayername",
    { playername },
  );
  return isNonEmptyString(response?.playeruid) ? response.playeruid : undefined;
}

async function resolvePlayerUid(uid: string): Promise<string | undefined> {
  const response = await postAuthResolve<ResolvePlayerUidResponse>(
    "https://auth3.vintagestory.at/resolveplayeruid",
    { uid },
  );
  return isNonEmptyString(response?.playername) ? response.playername : undefined;
}

async function postAuthResolve<T>(
  url: string,
  body: Record<string, string>,
): Promise<T | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {
      method: "POST",
      body: new URLSearchParams(body),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return undefined;
    return (await response.json()) as T;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function mergePlayerRecords(
  serverRecords: PlayerRecord[],
  panelRecords: PlayerRecord[],
): PlayerRecord[] {
  const merged = new Map<string, PlayerRecord>();
  const aliases = new Map<string, string>();

  for (const record of serverRecords) {
    const key = recordKey(record);
    merged.set(key, record);
    addRecordAliases(aliases, key, record);
  }

  for (const record of panelRecords) {
    const key = findRecordKey(aliases, record) ?? recordKey(record);
    const existing = merged.get(key);
    const next = existing ? mergeRecord(existing, record) : record;
    merged.set(key, next);
    addRecordAliases(aliases, key, next);
  }

  return [...merged.values()];
}

function mergeRecord(authoritative: PlayerRecord, panel: PlayerRecord): PlayerRecord {
  return {
    uid: authoritative.uid ?? panel.uid,
    name: authoritative.name || panel.name,
    role: authoritative.role ?? panel.role,
    isWhitelisted: authoritative.isWhitelisted ?? panel.isWhitelisted,
    playtimeSeconds: panel.playtimeSeconds ?? authoritative.playtimeSeconds,
    lastSeen: authoritative.lastSeen ?? panel.lastSeen,
    hasPlayed: authoritative.hasPlayed ?? panel.hasPlayed,
  };
}

function mergePanelRecord(current: PlayerRecord, next: PlayerRecord): PlayerRecord {
  return {
    uid: current.uid ?? next.uid,
    name: current.name || next.name,
    role: next.role ?? current.role,
    isWhitelisted: next.isWhitelisted ?? current.isWhitelisted,
    playtimeSeconds: next.playtimeSeconds ?? current.playtimeSeconds,
    lastSeen: next.lastSeen ?? current.lastSeen,
    hasPlayed: next.hasPlayed ?? current.hasPlayed,
  };
}

function recordKey(record: PlayerRecord): string {
  return record.uid ? `uid:${record.uid.toLowerCase()}` : `name:${record.name.toLowerCase()}`;
}

function addRecordAliases(
  aliases: Map<string, string>,
  key: string,
  record: PlayerRecord,
) {
  aliases.set(`name:${record.name.toLowerCase()}`, key);
  if (record.uid) {
    aliases.set(`uid:${record.uid.toLowerCase()}`, key);
    aliases.set(`name:${record.uid.toLowerCase()}`, key);
    aliases.set(`uid:known-${slugName(record.name)}`, key);
  }
}

function findRecordKey(
  aliases: Map<string, string>,
  record: PlayerRecord,
): string | undefined {
  return (
    aliases.get(`name:${record.name.toLowerCase()}`) ??
    (record.uid ? aliases.get(`uid:${record.uid.toLowerCase()}`) : undefined)
  );
}

function serverPlayerLastSeen(record: ServerPlayerData): number | undefined {
  const stratumLastSeen = record.CustomPlayerData?.["stratum.lastSeenUtc"];
  if (isNonEmptyString(stratumLastSeen)) {
    const parsed = Date.parse(stratumLastSeen);
    if (Number.isFinite(parsed)) return parsed;
  }

  for (const value of [record.LastJoinDate, record.FirstJoinDate]) {
    if (!isNonEmptyString(value)) continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPlayerRecord(value: unknown): value is PlayerRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof (value as { name?: unknown }).name === "string"
  );
}

function isServerPlayerData(value: unknown): value is ServerPlayerData {
  return (
    typeof value === "object" &&
    value !== null &&
    isNonEmptyString((value as { PlayerUID?: unknown }).PlayerUID)
  );
}

function isPlayerEntry(value: unknown): value is PlayerEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as PlayerEntry;
  return isNonEmptyString(entry.PlayerUID) || isNonEmptyString(entry.PlayerName);
}
