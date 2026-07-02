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
};

type ServerConfig = {
  RoleByCode?: Record<string, unknown>;
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
  const roles = await readRoles(instance.id);
  const defaultRole = preferredDefaultRole(roles);
  const records = await readPlayerRecords(instance.id);
  const recordsByName = new Map(
    records.map((record) => [record.name.toLowerCase(), record]),
  );
  const online = onlinePlayers.map((player) =>
    normalizeOnlinePlayer(player, defaultRole, recordsByName.get(player.name.toLowerCase())),
  );
  const onlineNames = new Set(online.map((player) => player.name.toLowerCase()));
  const source = records.length > 0 ? records : fallbackOfflineRecords(defaultRole, roles);
  const offline = source
    .filter((record) => record.name && !onlineNames.has(record.name.toLowerCase()))
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
  const roles = await readRoles(serverId);
  const defaultRole = preferredDefaultRole(roles);
  const records = await readPlayerRecords(serverId);
  const existingIndex = records.findIndex(
    (record) => matchesPlayerRecord(record, name),
  );
  const current = existingIndex >= 0 ? records[existingIndex] : undefined;
  const identity = playerIdentity(name);
  const next: PlayerRecord = {
    uid: current?.uid ?? identity.uid,
    name: current?.name ?? identity.name,
    role: patch.role ?? current?.role ?? defaultRole,
    isWhitelisted: patch.isWhitelisted ?? current?.isWhitelisted ?? true,
    playtimeSeconds: current?.playtimeSeconds ?? 0,
    lastSeen: current?.lastSeen ?? Date.now(),
  };

  if (existingIndex >= 0) records[existingIndex] = next;
  else records.push(next);

  await writePlayerRecords(serverId, records);
}

async function readRoles(serverId: string): Promise<string[]> {
  try {
    const raw = await fs.readFile(vsPaths(serverId).serverConfig, "utf8");
    const parsed = JSON.parse(raw) as ServerConfig;
    const roles = Object.keys(parsed.RoleByCode ?? {}).filter(Boolean);
    if (roles.length > 0) return roles;
  } catch {
    /* fall back below */
  }
  return ["admin", "member"];
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
    role,
    isOp: role === "admin",
    isWhitelisted: player.isWhitelisted ?? true,
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
  return roles.includes("member") ? "member" : roles[0] ?? "member";
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

function playerIdentity(input: string): Pick<PlayerRecord, "name" | "uid"> {
  const trimmed = input.trim();
  return looksLikeUuid(trimmed)
    ? { name: trimmed, uid: trimmed }
    : { name: trimmed, uid: `known-${slugName(trimmed)}` };
}

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isPlayerRecord(value: unknown): value is PlayerRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof (value as { name?: unknown }).name === "string"
  );
}
