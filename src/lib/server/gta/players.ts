import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  GtaBridgePlayer,
  GtaIdentifierType,
  GtaPlayerActionInput,
  GtaPlayerActionResult,
  GtaPlayerIdentifier,
  GtaPlayersPayload,
  GtaPlayerSession,
  GtaPlayerSummary,
  GtaPunishment,
  Instance,
} from "@/lib/types";

type StoredGtaPlayer = {
  id: string;
  name: string;
  online: boolean;
  serverId?: number;
  pingMs?: number;
  identifiers: GtaPlayerIdentifier[];
  firstSeenAt: number;
  lastSeenAt: number;
  lastHeartbeatAt?: number;
};

type GtaPlayerStore = {
  players: StoredGtaPlayer[];
  sessions: GtaPlayerSession[];
  punishments: GtaPunishment[];
};

const ONLINE_WINDOW_MS = 30_000;
const IDENTITY_PRIORITY: GtaIdentifierType[] = [
  "license",
  "license2",
  "fivem",
  "steam",
  "discord",
];

export async function listGtaPlayers(
  inst: Instance,
  now = Date.now(),
): Promise<GtaPlayersPayload> {
  return playersPayload(await readStore(inst), now);
}

export async function recordGtaHeartbeat(
  inst: Instance,
  players: GtaBridgePlayer[],
  now = Date.now(),
): Promise<GtaPlayersPayload> {
  const store = await readStore(inst);
  for (const player of players) {
    const stored = upsertBridgePlayer(store.players, player, now);
    ensureOpenSession(store.sessions, stored, now);
  }
  await writeJsonFile(playersFile(inst), store.players);
  await writeJsonFile(sessionsFile(inst), store.sessions);
  return playersPayload(store, now);
}

export async function recordGtaPlayerJoin(
  inst: Instance,
  player: GtaBridgePlayer,
  now = Date.now(),
): Promise<{ player: GtaPlayerSummary }> {
  const store = await readStore(inst);
  const stored = upsertBridgePlayer(store.players, player, now);
  ensureOpenSession(store.sessions, stored, now);
  await writeJsonFile(playersFile(inst), store.players);
  await writeJsonFile(sessionsFile(inst), store.sessions);
  return {
    player: playerSummary(stored, store.sessions, store.punishments, now),
  };
}

export async function recordGtaPlayerDrop(
  inst: Instance,
  input: { playerId?: string; serverId?: number; reason?: string },
  now = Date.now(),
): Promise<void> {
  const store = await readStore(inst);
  const player = store.players.find((candidate) =>
    input.playerId
      ? candidate.id === input.playerId
      : input.serverId !== undefined && candidate.serverId === input.serverId,
  );
  if (!player) return;

  player.online = false;
  player.lastSeenAt = now;
  delete player.serverId;
  delete player.pingMs;

  for (const session of store.sessions) {
    if (session.playerId !== player.id || session.leftAt !== undefined)
      continue;
    if (input.serverId !== undefined && session.serverId !== input.serverId)
      continue;
    session.leftAt = now;
    session.durationSeconds = Math.max(
      0,
      Math.floor((now - session.joinedAt) / 1000),
    );
    session.dropReason = input.reason;
  }

  await writeJsonFile(playersFile(inst), store.players);
  await writeJsonFile(sessionsFile(inst), store.sessions);
}

export async function recordGtaPlayerAction(
  inst: Instance,
  input: GtaPlayerActionInput,
  actor: { id: string; username: string },
  now = Date.now(),
): Promise<GtaPlayerActionResult> {
  const store = await readStore(inst);
  const player = store.players.find(
    (candidate) => candidate.id === input.playerId,
  );
  if (!player) throw new Error("GTA player was not found");

  const reason = input.reason?.trim() ?? "";
  if ((input.action === "warn" || input.action === "ban") && !reason) {
    throw new Error(`${input.action} reason is required`);
  }

  const online = isOnline(player, now);
  if (input.action === "kick" && (!online || player.serverId === undefined)) {
    throw new Error("Kick requires an online player with a server id");
  }

  const punishment: GtaPunishment = {
    id: buildRecordId("gta_punishment", `${player.id}:${input.action}:${now}`),
    playerId: player.id,
    playerName: player.name,
    type: input.action,
    reason,
    active: input.action === "ban",
    createdAt: now,
    actor,
  };
  store.punishments.push(punishment);
  await writeJsonFile(punishmentsFile(inst), store.punishments);

  const liveCommand = liveKickCommandForAction(
    input.action,
    player,
    reason,
    online,
  );
  return liveCommand
    ? { ok: true, punishment, liveCommand }
    : { ok: true, punishment };
}

export async function findActiveGtaBan(
  inst: Instance,
  identifiers: GtaPlayerIdentifier[],
): Promise<GtaPunishment | null> {
  const normalized = normalizedIdentifierKeys(identifiers).filter(
    (key) => key.startsWith("license:") || key.startsWith("license2:"),
  );
  if (normalized.length === 0) return null;

  const store = await readStore(inst);
  const matchingPlayerIds = new Set(
    store.players
      .filter((player) =>
        normalizedIdentifierKeys(player.identifiers).some((key) =>
          normalized.includes(key),
        ),
      )
      .map((player) => player.id),
  );
  return (
    store.punishments.find(
      (punishment) =>
        punishment.type === "ban" &&
        punishment.active &&
        matchingPlayerIds.has(punishment.playerId),
    ) ?? null
  );
}

export function buildGtaPlayerId(
  player: Pick<GtaBridgePlayer, "name" | "identifiers">,
): string {
  const identifiers = normalizeIdentifiers(player.identifiers);
  for (const type of IDENTITY_PRIORITY) {
    const identifier = identifiers.find((candidate) => candidate.type === type);
    if (identifier) return buildRecordId("gta", `${type}:${identifier.value}`);
  }
  return buildRecordId("gta", `name:${player.name.trim().toLowerCase()}`);
}

export function buildGtaKickCommand(serverId: number, reason: string): string {
  return `slutvival_kick ${serverId} ${reason.replace(/[\r\n]+/g, " ").trim()}`;
}

async function readStore(inst: Instance): Promise<GtaPlayerStore> {
  const [players, sessions, punishments] = await Promise.all([
    readJsonArray<StoredGtaPlayer>(playersFile(inst), isStoredGtaPlayer),
    readJsonArray<GtaPlayerSession>(sessionsFile(inst), isGtaPlayerSession),
    readJsonArray<GtaPunishment>(punishmentsFile(inst), isGtaPunishment),
  ]);
  return { players, sessions, punishments };
}

function upsertBridgePlayer(
  players: StoredGtaPlayer[],
  bridgePlayer: GtaBridgePlayer,
  now: number,
): StoredGtaPlayer {
  const id = playerIdForBridgePlayer(players, bridgePlayer);
  const identifiers = normalizeIdentifiers(bridgePlayer.identifiers);
  const current = players.find((player) => player.id === id);
  if (current) {
    current.name = bridgePlayer.name;
    current.online = true;
    current.serverId = bridgePlayer.serverId;
    current.pingMs = bridgePlayer.pingMs;
    current.identifiers = mergeIdentifiers(current.identifiers, identifiers);
    current.lastSeenAt = now;
    current.lastHeartbeatAt = now;
    return current;
  }

  const created: StoredGtaPlayer = {
    id,
    name: bridgePlayer.name,
    online: true,
    serverId: bridgePlayer.serverId,
    pingMs: bridgePlayer.pingMs,
    identifiers,
    firstSeenAt: now,
    lastSeenAt: now,
    lastHeartbeatAt: now,
  };
  players.push(created);
  return created;
}

function playerIdForBridgePlayer(
  players: StoredGtaPlayer[],
  bridgePlayer: GtaBridgePlayer,
): string {
  const id = buildGtaPlayerId(bridgePlayer);
  const current = players.find((player) => player.id === id);
  if (!current || samePlayerName(current.name, bridgePlayer.name)) return id;

  return buildRecordId(
    "gta",
    `${id}:name:${bridgePlayer.name.trim().toLowerCase()}`,
  );
}

function ensureOpenSession(
  sessions: GtaPlayerSession[],
  player: StoredGtaPlayer,
  now: number,
): void {
  if (
    sessions.some(
      (session) =>
        session.playerId === player.id && session.leftAt === undefined,
    )
  ) {
    return;
  }
  sessions.push({
    id: buildRecordId("gta_session", `${player.id}:${now}`),
    playerId: player.id,
    name: player.name,
    serverId: player.serverId,
    joinedAt: now,
  });
}

function playersPayload(store: GtaPlayerStore, now: number): GtaPlayersPayload {
  const players = store.players
    .map((player) =>
      playerSummary(player, store.sessions, store.punishments, now),
    )
    .sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      if (a.lastSeenAt !== b.lastSeenAt) return b.lastSeenAt - a.lastSeenAt;
      return a.name.localeCompare(b.name);
    });
  const onlineCount = players.filter((player) => player.online).length;
  const lastHeartbeatAt = Math.max(
    0,
    ...store.players.map((player) => player.lastHeartbeatAt ?? 0),
  );

  return {
    players,
    onlineCount,
    offlineCount: players.length - onlineCount,
    punishmentCount: store.punishments.length,
    bridge: {
      lastHeartbeatAt: lastHeartbeatAt > 0 ? lastHeartbeatAt : undefined,
      online: lastHeartbeatAt > 0 && now - lastHeartbeatAt <= ONLINE_WINDOW_MS,
    },
  };
}

function playerSummary(
  player: StoredGtaPlayer,
  sessions: GtaPlayerSession[],
  punishments: GtaPunishment[],
  now: number,
): GtaPlayerSummary {
  const playerSessions = sessions.filter(
    (session) => session.playerId === player.id,
  );
  const online = isOnline(player, now);
  return {
    id: player.id,
    name: player.name,
    online,
    serverId: online ? player.serverId : undefined,
    pingMs: online ? player.pingMs : undefined,
    identifiers: player.identifiers,
    firstSeenAt: player.firstSeenAt,
    lastSeenAt: player.lastSeenAt,
    totalPlaytimeSeconds: totalPlaytimeSeconds(playerSessions, online, now),
    sessions: playerSessions,
    punishments: punishments.filter(
      (punishment) => punishment.playerId === player.id,
    ),
  };
}

function totalPlaytimeSeconds(
  sessions: GtaPlayerSession[],
  online: boolean,
  now: number,
): number {
  return sessions.reduce((total, session) => {
    if (typeof session.durationSeconds === "number")
      return total + session.durationSeconds;
    if (online && session.leftAt === undefined) {
      return total + Math.max(0, Math.floor((now - session.joinedAt) / 1000));
    }
    return total;
  }, 0);
}

function isOnline(player: StoredGtaPlayer, now: number): boolean {
  return (
    player.online === true &&
    player.lastHeartbeatAt !== undefined &&
    now - player.lastHeartbeatAt <= ONLINE_WINDOW_MS
  );
}

function liveKickCommandForAction(
  action: GtaPlayerActionInput["action"],
  player: StoredGtaPlayer,
  reason: string,
  online: boolean,
): string | undefined {
  if (!online || player.serverId === undefined) return undefined;
  if (action === "ban")
    return buildGtaKickCommand(player.serverId, `Banned: ${reason}`);
  if (action === "kick")
    return buildGtaKickCommand(player.serverId, reason || "Kicked");
  return undefined;
}

function normalizeIdentifiers(
  identifiers: GtaPlayerIdentifier[],
): GtaPlayerIdentifier[] {
  const seen = new Set<string>();
  const normalized: GtaPlayerIdentifier[] = [];
  for (const identifier of identifiers) {
    const value = identifier.value.trim().toLowerCase();
    if (!value) continue;
    const key = `${identifier.type}:${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ type: identifier.type, value });
  }
  return normalized;
}

function mergeIdentifiers(
  current: GtaPlayerIdentifier[],
  incoming: GtaPlayerIdentifier[],
): GtaPlayerIdentifier[] {
  return normalizeIdentifiers([...current, ...incoming]);
}

function normalizedIdentifierKeys(
  identifiers: GtaPlayerIdentifier[],
): string[] {
  return normalizeIdentifiers(identifiers).map(
    (identifier) => `${identifier.type}:${identifier.value}`,
  );
}

function samePlayerName(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
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

async function writeJsonFile(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`,
  );
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tmp, file);
}

function playersFile(inst: Instance): string {
  return path.join(storageDir(inst), "players.json");
}

function sessionsFile(inst: Instance): string {
  return path.join(storageDir(inst), "sessions.json");
}

function punishmentsFile(inst: Instance): string {
  return path.join(storageDir(inst), "punishments.json");
}

function storageDir(inst: Instance): string {
  return path.join(inst.dataPath, "slutvival");
}

function buildRecordId(prefix: string, value: string): string {
  const hex = crypto.createHash("sha256").update(value).digest("hex");
  return `${prefix}_${hex.slice(0, 20)}`;
}

function isStoredGtaPlayer(value: unknown): value is StoredGtaPlayer {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.online === "boolean" &&
    Array.isArray(value.identifiers) &&
    value.identifiers.every(isGtaPlayerIdentifier) &&
    typeof value.firstSeenAt === "number" &&
    typeof value.lastSeenAt === "number"
  );
}

function isGtaPlayerSession(value: unknown): value is GtaPlayerSession {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.playerId === "string" &&
    typeof value.name === "string" &&
    typeof value.joinedAt === "number"
  );
}

function isGtaPunishment(value: unknown): value is GtaPunishment {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.playerId === "string" &&
    typeof value.playerName === "string" &&
    (value.type === "kick" || value.type === "warn" || value.type === "ban") &&
    typeof value.reason === "string" &&
    typeof value.active === "boolean" &&
    typeof value.createdAt === "number"
  );
}

function isGtaPlayerIdentifier(value: unknown): value is GtaPlayerIdentifier {
  if (!isRecord(value)) return false;
  return (
    typeof value.type === "string" &&
    (
      [
        "license",
        "license2",
        "discord",
        "steam",
        "fivem",
        "ip",
        "unknown",
      ] as string[]
    ).includes(value.type) &&
    typeof value.value === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
