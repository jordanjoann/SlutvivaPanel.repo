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
import { readGtaBridgeToken } from "./server-data";

type StoredGtaPlayer = {
  id: string;
  aliases?: string[];
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
  bridge: GtaBridgeState;
};

type UpsertGtaPlayerResult = {
  player: StoredGtaPlayer;
  punishmentsChanged: boolean;
};

type GtaBridgeState = {
  lastHeartbeatAt?: number;
};

const ONLINE_WINDOW_MS = 30_000;
const IDENTITY_PRIORITY: GtaIdentifierType[] = [
  "license",
  "license2",
  "fivem",
  "steam",
  "discord",
];
const DURABLE_IDENTIFIER_TYPES = new Set<GtaIdentifierType>(IDENTITY_PRIORITY);
const storeLocks = new Map<string, Promise<void>>();

export async function listGtaPlayers(
  inst: Instance,
  now = Date.now(),
): Promise<GtaPlayersPayload> {
  return withStoreLock(inst, () => listGtaPlayersUnlocked(inst, now));
}

async function listGtaPlayersUnlocked(
  inst: Instance,
  now: number,
): Promise<GtaPlayersPayload> {
  const store = await readStore(inst);
  const changed = closeStaleSessions(store, now);
  if (changed) {
    await writeJsonFile(playersFile(inst), store.players);
    await writeJsonFile(sessionsFile(inst), store.sessions);
  }
  return playersPayload(store, now);
}

export async function recordGtaHeartbeat(
  inst: Instance,
  players: GtaBridgePlayer[],
  now = Date.now(),
): Promise<GtaPlayersPayload> {
  return withStoreLock(inst, () =>
    recordGtaHeartbeatUnlocked(inst, players, now),
  );
}

async function recordGtaHeartbeatUnlocked(
  inst: Instance,
  players: GtaBridgePlayer[],
  now: number,
): Promise<GtaPlayersPayload> {
  const store = await readStore(inst);
  store.bridge.lastHeartbeatAt = now;
  closeStaleSessions(store, now);
  let punishmentsChanged = false;
  const seenPlayerIds = new Set<string>();
  for (const player of players) {
    const result = upsertBridgePlayer(store, player, now);
    punishmentsChanged ||= result.punishmentsChanged;
    for (const id of playerIdsForAssociations(result.player)) {
      seenPlayerIds.add(id);
    }
    ensureOpenSession(store.sessions, result.player, now);
  }
  closeMissingHeartbeatPlayers(store, seenPlayerIds, now);
  await writeJsonFile(playersFile(inst), store.players);
  await writeJsonFile(sessionsFile(inst), store.sessions);
  await writeJsonFile(bridgeFile(inst), store.bridge);
  if (punishmentsChanged) {
    await writeJsonFile(punishmentsFile(inst), store.punishments);
  }
  return playersPayload(store, now);
}

export async function recordGtaPlayerJoin(
  inst: Instance,
  player: GtaBridgePlayer,
  now = Date.now(),
): Promise<{ player: GtaPlayerSummary }> {
  return withStoreLock(inst, () =>
    recordGtaPlayerJoinUnlocked(inst, player, now),
  );
}

async function recordGtaPlayerJoinUnlocked(
  inst: Instance,
  player: GtaBridgePlayer,
  now: number,
): Promise<{ player: GtaPlayerSummary }> {
  const store = await readStore(inst);
  closeStaleSessions(store, now);
  const result = upsertBridgePlayer(store, player, now);
  closeOnlinePlayersReusingServerId(store, result.player, player.serverId, now);
  ensureOpenSession(store.sessions, result.player, now);
  await writeJsonFile(playersFile(inst), store.players);
  await writeJsonFile(sessionsFile(inst), store.sessions);
  if (result.punishmentsChanged) {
    await writeJsonFile(punishmentsFile(inst), store.punishments);
  }
  return {
    player: playerSummary(
      result.player,
      store.sessions,
      store.punishments,
      now,
    ),
  };
}

export async function recordGtaPlayerDrop(
  inst: Instance,
  input: { playerId?: string; serverId?: number; reason?: string },
  now = Date.now(),
): Promise<void> {
  return withStoreLock(inst, () =>
    recordGtaPlayerDropUnlocked(inst, input, now),
  );
}

async function recordGtaPlayerDropUnlocked(
  inst: Instance,
  input: { playerId?: string; serverId?: number; reason?: string },
  now: number,
): Promise<void> {
  const store = await readStore(inst);
  const staleChanged = closeStaleSessions(store, now);
  const inputPlayerId = input.playerId;
  const player =
    (inputPlayerId !== undefined
      ? store.players.find((candidate) =>
          playerHasAssociatedId(candidate, inputPlayerId),
        )
      : undefined) ??
    (input.serverId !== undefined
      ? store.players.find((candidate) => candidate.serverId === input.serverId)
      : undefined);
  if (!player || !isOnline(player, now)) {
    if (staleChanged) {
      await writeJsonFile(playersFile(inst), store.players);
      await writeJsonFile(sessionsFile(inst), store.sessions);
    }
    return;
  }
  if (input.serverId !== undefined && player.serverId !== input.serverId) {
    if (staleChanged) {
      await writeJsonFile(playersFile(inst), store.players);
      await writeJsonFile(sessionsFile(inst), store.sessions);
    }
    return;
  }

  const session = store.sessions.find((candidate) => {
    if (
      !sessionBelongsToPlayer(candidate, player) ||
      candidate.leftAt !== undefined
    ) {
      return false;
    }
    if (input.serverId !== undefined)
      return candidate.serverId === input.serverId;
    if (player.serverId !== undefined)
      return candidate.serverId === player.serverId;
    return true;
  });

  player.online = false;
  player.lastSeenAt = now;
  delete player.serverId;
  delete player.pingMs;

  if (!session) {
    await writeJsonFile(playersFile(inst), store.players);
    if (staleChanged) {
      await writeJsonFile(sessionsFile(inst), store.sessions);
    }
    return;
  }

  normalizeSessionPlayerId(session, player);
  session.leftAt = now;
  session.durationSeconds = Math.max(
    0,
    Math.floor((now - session.joinedAt) / 1000),
  );
  session.dropReason = input.reason;

  await writeJsonFile(playersFile(inst), store.players);
  await writeJsonFile(sessionsFile(inst), store.sessions);
}

export async function recordGtaPlayerAction(
  inst: Instance,
  input: GtaPlayerActionInput,
  actor: { id: string; username: string },
  now = Date.now(),
): Promise<GtaPlayerActionResult> {
  return withStoreLock(inst, () =>
    recordGtaPlayerActionUnlocked(inst, input, actor, now),
  );
}

async function recordGtaPlayerActionUnlocked(
  inst: Instance,
  input: GtaPlayerActionInput,
  actor: { id: string; username: string },
  now: number,
): Promise<GtaPlayerActionResult> {
  if (!isGtaPlayerAction(input.action)) {
    throw new Error("Invalid action");
  }

  const store = await readStore(inst);
  const player = store.players.find((candidate) =>
    playerHasAssociatedId(candidate, input.playerId),
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
    id: buildRecordId(
      "gta_punishment",
      `${player.id}:${input.action}:${now}:${crypto.randomUUID()}`,
    ),
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
  return withStoreLock(inst, () => findActiveGtaBanUnlocked(inst, identifiers));
}

export async function handleGtaBridgeEvent(
  inst: Instance,
  body: unknown,
): Promise<{ ok: true } | { allowed: boolean; reason?: string }> {
  if (!isPlainRecord(body)) {
    throw malformedBridgePayload("body must be an object");
  }

  const expectedToken = await readGtaBridgeToken(inst);
  if (
    !expectedToken ||
    typeof body.serverToken !== "string" ||
    body.serverToken !== expectedToken
  ) {
    throw new Error("Invalid GTA bridge token");
  }

  switch (body.type) {
    case "heartbeat": {
      if (
        !Array.isArray(body.players) ||
        !body.players.every(isGtaBridgePlayer)
      ) {
        throw malformedBridgePayload("heartbeat players are required");
      }
      await recordGtaHeartbeat(inst, body.players);
      return { ok: true };
    }

    case "playerJoin": {
      if (!isGtaBridgePlayer(body.player)) {
        throw malformedBridgePayload("playerJoin player is required");
      }
      await recordGtaPlayerJoin(inst, body.player);
      return { ok: true };
    }

    case "playerDrop": {
      const playerId = body.playerId;
      const serverId = body.serverId;
      const reason = body.reason;
      if (
        (playerId !== undefined && typeof playerId !== "string") ||
        (serverId !== undefined && !isFiniteNumber(serverId)) ||
        (reason !== undefined && typeof reason !== "string") ||
        (typeof playerId !== "string" && !isFiniteNumber(serverId))
      ) {
        throw malformedBridgePayload("playerDrop playerId or serverId is required");
      }
      await recordGtaPlayerDrop(inst, { playerId, serverId, reason });
      return { ok: true };
    }

    case "banCheck": {
      if (
        !Array.isArray(body.identifiers) ||
        !body.identifiers.every(isGtaPlayerIdentifier) ||
        (body.player !== undefined && !isGtaBridgePlayer(body.player))
      ) {
        throw malformedBridgePayload("banCheck identifiers are required");
      }
      const ban = await findActiveGtaBan(inst, body.identifiers);
      return ban
        ? { allowed: false, reason: ban.reason }
        : { allowed: true };
    }

    default:
      throw new Error("Unknown GTA bridge event type");
  }
}

async function findActiveGtaBanUnlocked(
  inst: Instance,
  identifiers: GtaPlayerIdentifier[],
): Promise<GtaPunishment | null> {
  const normalized = durableIdentifierKeys(identifiers);
  if (normalized.length === 0) return null;

  const store = await readStore(inst);
  const matchingPlayerIds = new Set(
    store.players
      .filter((player) =>
        durableIdentifierKeys(player.identifiers).some((key) =>
          normalized.includes(key),
        ),
      )
      .flatMap(playerIdsForAssociations),
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
    if (identifier) return buildRecordId("gta", identifier.value);
  }
  return buildRecordId("gta", player.name.trim().toLowerCase());
}

export function buildGtaKickCommand(serverId: number, reason: string): string {
  return `slutvival_kick ${serverId} ${reason.replace(/[\r\n]+/g, " ").trim()}`;
}

async function withStoreLock<T>(
  inst: Instance,
  work: () => Promise<T>,
): Promise<T> {
  const key = storageDir(inst);
  const previous = storeLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.catch(() => undefined).then(() => gate);
  storeLocks.set(key, queued);

  await previous.catch(() => undefined);
  try {
    return await work();
  } finally {
    release();
    if (storeLocks.get(key) === queued) {
      storeLocks.delete(key);
    }
  }
}

async function readStore(inst: Instance): Promise<GtaPlayerStore> {
  const [players, sessions, punishments, bridge] = await Promise.all([
    readJsonArray<StoredGtaPlayer>(playersFile(inst), isStoredGtaPlayer),
    readJsonArray<GtaPlayerSession>(sessionsFile(inst), isGtaPlayerSession),
    readJsonArray<GtaPunishment>(punishmentsFile(inst), isGtaPunishment),
    readJsonObject<GtaBridgeState>(bridgeFile(inst), isGtaBridgeState),
  ]);
  return { players, sessions, punishments, bridge: bridge ?? {} };
}

function upsertBridgePlayer(
  store: GtaPlayerStore,
  bridgePlayer: GtaBridgePlayer,
  now: number,
): UpsertGtaPlayerResult {
  const identifiers = normalizeIdentifiers(bridgePlayer.identifiers);
  const incomingId = buildGtaPlayerId({
    name: bridgePlayer.name,
    identifiers,
  });
  const matchingPlayers = store.players.filter(
    (player) =>
      player.id === incomingId ||
      durableIdentifiersOverlap(player.identifiers, identifiers) ||
      sameNonDurableLiveServerId(player, bridgePlayer.serverId, now),
  );
  const mergedIdentifiers = matchingPlayers.reduce(
    (merged, player) => mergeIdentifiers(merged, player.identifiers),
    identifiers,
  );
  const id = buildGtaPlayerId({
    name: bridgePlayer.name,
    identifiers: mergedIdentifiers,
  });
  const current =
    matchingPlayers.find((player) => player.id === id) ??
    matchingPlayers.find((player) => player.id === incomingId) ??
    matchingPlayers[0];
  if (current) {
    const oldIds = matchingPlayers.flatMap(playerIdsForAssociations);
    if (current.id !== id) {
      addPlayerAliases(current, [current.id]);
      current.id = id;
    }
    for (const matched of matchingPlayers) {
      if (matched === current) continue;
      addPlayerAliases(current, playerIdsForAssociations(matched));
      current.identifiers = mergeIdentifiers(
        current.identifiers,
        matched.identifiers,
      );
      current.firstSeenAt = Math.min(current.firstSeenAt, matched.firstSeenAt);
      current.lastSeenAt = Math.max(current.lastSeenAt, matched.lastSeenAt);
      if (
        current.lastHeartbeatAt === undefined ||
        (matched.lastHeartbeatAt ?? 0) > current.lastHeartbeatAt
      ) {
        current.lastHeartbeatAt = matched.lastHeartbeatAt;
      }
    }
    store.players = store.players.filter(
      (player) => player === current || !matchingPlayers.includes(player),
    );
    const punishmentsChanged = migrateRelatedPlayerIds(store, oldIds, id);
    closeOpenSessionsForOtherServer(
      store.sessions,
      current,
      bridgePlayer.serverId,
      now,
    );
    current.name = bridgePlayer.name;
    current.online = true;
    current.serverId = bridgePlayer.serverId;
    current.pingMs = bridgePlayer.pingMs;
    current.identifiers = mergeIdentifiers(current.identifiers, identifiers);
    addPlayerAliases(current, oldIds);
    current.lastSeenAt = now;
    current.lastHeartbeatAt = now;
    return { player: current, punishmentsChanged };
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
  store.players.push(created);
  return { player: created, punishmentsChanged: false };
}

function migrateRelatedPlayerIds(
  store: GtaPlayerStore,
  oldIds: string[],
  nextId: string,
): boolean {
  let punishmentsChanged = false;
  for (const session of store.sessions) {
    if (oldIds.includes(session.playerId) && session.playerId !== nextId) {
      session.playerId = nextId;
    }
  }
  for (const punishment of store.punishments) {
    if (
      oldIds.includes(punishment.playerId) &&
      punishment.playerId !== nextId
    ) {
      punishment.playerId = nextId;
      punishmentsChanged = true;
    }
  }
  return punishmentsChanged;
}

function ensureOpenSession(
  sessions: GtaPlayerSession[],
  player: StoredGtaPlayer,
  now: number,
): void {
  for (const session of sessions) {
    if (
      sessionBelongsToPlayer(session, player) &&
      session.leftAt === undefined &&
      session.serverId === player.serverId
    ) {
      normalizeSessionPlayerId(session, player);
      return;
    }
  }
  sessions.push({
    id: buildRecordId(
      "gta_session",
      `${player.id}:${player.serverId ?? ""}:${now}:${crypto.randomUUID()}`,
    ),
    playerId: player.id,
    name: player.name,
    serverId: player.serverId,
    joinedAt: now,
  });
}

function closeOpenSessionsForOtherServer(
  sessions: GtaPlayerSession[],
  player: StoredGtaPlayer,
  serverId: number,
  now: number,
): void {
  for (const session of sessions) {
    if (
      !sessionBelongsToPlayer(session, player) ||
      session.leftAt !== undefined ||
      session.serverId === serverId
    ) {
      continue;
    }
    normalizeSessionPlayerId(session, player);
    session.leftAt = now;
    session.durationSeconds = Math.max(
      0,
      Math.floor((now - session.joinedAt) / 1000),
    );
    session.dropReason = "Reconnected";
  }
}

function closeStaleSessions(store: GtaPlayerStore, now: number): boolean {
  let changed = false;
  for (const player of store.players) {
    if (isOnline(player, now)) continue;
    if (!player.online) {
      const leftAt = player.lastSeenAt ?? player.lastHeartbeatAt ?? now;
      for (const session of store.sessions) {
        if (
          !sessionBelongsToPlayer(session, player) ||
          session.leftAt !== undefined
        )
          continue;
        normalizeSessionPlayerId(session, player);
        session.leftAt = leftAt;
        session.durationSeconds = Math.max(
          0,
          Math.floor((leftAt - session.joinedAt) / 1000),
        );
        session.dropReason = "State repaired";
        changed = true;
      }
      continue;
    }
    if (player.lastHeartbeatAt === undefined) continue;

    const leftAt = player.lastHeartbeatAt;
    for (const session of store.sessions) {
      if (
        !sessionBelongsToPlayer(session, player) ||
        session.leftAt !== undefined
      )
        continue;
      normalizeSessionPlayerId(session, player);
      session.leftAt = leftAt;
      session.durationSeconds = Math.max(
        0,
        Math.floor((leftAt - session.joinedAt) / 1000),
      );
      session.dropReason = "Heartbeat timed out";
      changed = true;
    }
    player.online = false;
    delete player.serverId;
    delete player.pingMs;
    changed = true;
  }
  return changed;
}

function closeMissingHeartbeatPlayers(
  store: GtaPlayerStore,
  seenPlayerIds: Set<string>,
  now: number,
): void {
  for (const player of store.players) {
    if (!isOnline(player, now)) continue;
    if (playerIdsForAssociations(player).some((id) => seenPlayerIds.has(id))) {
      continue;
    }

    for (const session of store.sessions) {
      if (
        !sessionBelongsToPlayer(session, player) ||
        session.leftAt !== undefined
      ) {
        continue;
      }
      normalizeSessionPlayerId(session, player);
      session.leftAt = now;
      session.durationSeconds = Math.max(
        0,
        Math.floor((now - session.joinedAt) / 1000),
      );
      session.dropReason = "Heartbeat missing";
    }
    player.online = false;
    player.lastSeenAt = now;
    delete player.serverId;
    delete player.pingMs;
  }
}

function closeOnlinePlayersReusingServerId(
  store: GtaPlayerStore,
  incoming: StoredGtaPlayer,
  serverId: number,
  now: number,
): void {
  const incomingIds = new Set(playerIdsForAssociations(incoming));
  for (const player of store.players) {
    if (player === incoming) continue;
    if (player.serverId !== serverId) continue;
    if (!isOnline(player, now)) continue;
    if (playerIdsForAssociations(player).some((id) => incomingIds.has(id))) {
      continue;
    }

    for (const session of store.sessions) {
      if (
        !sessionBelongsToPlayer(session, player) ||
        session.leftAt !== undefined
      ) {
        continue;
      }
      normalizeSessionPlayerId(session, player);
      session.leftAt = now;
      session.durationSeconds = Math.max(
        0,
        Math.floor((now - session.joinedAt) / 1000),
      );
      session.dropReason = "Server id reused";
    }
    player.online = false;
    player.lastSeenAt = now;
    delete player.serverId;
    delete player.pingMs;
  }
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
  const lastHeartbeatAt = store.bridge.lastHeartbeatAt;

  return {
    players,
    onlineCount,
    offlineCount: players.length - onlineCount,
    punishmentCount: store.punishments.length,
    bridge: {
      lastHeartbeatAt,
      online:
        lastHeartbeatAt !== undefined &&
        now - lastHeartbeatAt <= ONLINE_WINDOW_MS,
    },
  };
}

function playerSummary(
  player: StoredGtaPlayer,
  sessions: GtaPlayerSession[],
  punishments: GtaPunishment[],
  now: number,
): GtaPlayerSummary {
  const playerIds = new Set(playerIdsForAssociations(player));
  const playerSessions = sessions.filter((session) =>
    playerIds.has(session.playerId),
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
    punishments: punishments.filter((punishment) =>
      playerIds.has(punishment.playerId),
    ),
  };
}

function playerIdsForAssociations(player: StoredGtaPlayer): string[] {
  return [...new Set([player.id, ...(player.aliases ?? [])])];
}

function playerHasAssociatedId(player: StoredGtaPlayer, id: string): boolean {
  return playerIdsForAssociations(player).includes(id);
}

function sessionBelongsToPlayer(
  session: GtaPlayerSession,
  player: StoredGtaPlayer,
): boolean {
  return playerHasAssociatedId(player, session.playerId);
}

function normalizeSessionPlayerId(
  session: GtaPlayerSession,
  player: StoredGtaPlayer,
): void {
  if (sessionBelongsToPlayer(session, player)) {
    session.playerId = player.id;
  }
}

function addPlayerAliases(player: StoredGtaPlayer, ids: string[]): void {
  const aliases = new Set(player.aliases ?? []);
  for (const id of ids) {
    if (id !== player.id) aliases.add(id);
  }
  if (aliases.size > 0) {
    player.aliases = [...aliases];
  }
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

function sameNonDurableLiveServerId(
  player: StoredGtaPlayer,
  serverId: number,
  now: number,
): boolean {
  return (
    player.serverId === serverId &&
    durableIdentifierKeys(player.identifiers).length === 0 &&
    isOnline(player, now)
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

function isGtaPlayerAction(
  value: unknown,
): value is GtaPlayerActionInput["action"] {
  return value === "kick" || value === "warn" || value === "ban";
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

function durableIdentifierKeys(identifiers: GtaPlayerIdentifier[]): string[] {
  return normalizeIdentifiers(identifiers)
    .filter((identifier) => DURABLE_IDENTIFIER_TYPES.has(identifier.type))
    .map((identifier) => `${identifier.type}:${identifier.value}`);
}

function durableIdentifiersOverlap(
  left: GtaPlayerIdentifier[],
  right: GtaPlayerIdentifier[],
): boolean {
  const rightKeys = new Set(durableIdentifierKeys(right));
  return durableIdentifierKeys(left).some((key) => rightKeys.has(key));
}

async function readJsonArray<T>(
  file: string,
  guard: (value: unknown) => value is T,
): Promise<T[]> {
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (error) {
    if (isNotFoundError(error)) return [];
    throw error;
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`${file} must contain a JSON array`);
  }

  const values: T[] = [];
  for (const [index, value] of parsed.entries()) {
    if (!guard(value)) {
      throw new Error(`${file} contains an invalid record at index ${index}`);
    }
    values.push(value);
  }
  return values;
}

async function readJsonObject<T>(
  file: string,
  guard: (value: unknown) => value is T,
): Promise<T | null> {
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!guard(parsed)) {
    throw new Error(`${file} must contain a valid JSON object`);
  }
  return parsed;
}

async function writeJsonFile(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`,
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

function bridgeFile(inst: Instance): string {
  return path.join(storageDir(inst), "bridge.json");
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
    (value.aliases === undefined ||
      (Array.isArray(value.aliases) &&
        value.aliases.every((alias) => typeof alias === "string"))) &&
    typeof value.name === "string" &&
    typeof value.online === "boolean" &&
    isOptionalFiniteNumber(value.serverId) &&
    isOptionalFiniteNumber(value.pingMs) &&
    Array.isArray(value.identifiers) &&
    value.identifiers.every(isGtaPlayerIdentifier) &&
    isFiniteNumber(value.firstSeenAt) &&
    isFiniteNumber(value.lastSeenAt) &&
    isOptionalFiniteNumber(value.lastHeartbeatAt)
  );
}

function isGtaPlayerSession(value: unknown): value is GtaPlayerSession {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.playerId === "string" &&
    typeof value.name === "string" &&
    isOptionalFiniteNumber(value.serverId) &&
    isFiniteNumber(value.joinedAt) &&
    isOptionalFiniteNumber(value.leftAt) &&
    isOptionalFiniteNumber(value.durationSeconds) &&
    isOptionalString(value.dropReason)
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
    isFiniteNumber(value.createdAt) &&
    isOptionalFiniteNumber(value.revokedAt) &&
    (value.actor === undefined || isGtaPunishmentActor(value.actor))
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

function isGtaBridgePlayer(value: unknown): value is GtaBridgePlayer {
  if (!isRecord(value)) return false;
  return (
    isFiniteNumber(value.serverId) &&
    typeof value.name === "string" &&
    isFiniteNumber(value.pingMs) &&
    Array.isArray(value.identifiers) &&
    value.identifiers.every(isGtaPlayerIdentifier)
  );
}

function isGtaBridgeState(value: unknown): value is GtaBridgeState {
  if (!isRecord(value)) return false;
  return (
    value.lastHeartbeatAt === undefined || isFiniteNumber(value.lastHeartbeatAt)
  );
}

function isGtaPunishmentActor(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.username === "string"
  );
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === undefined || isFiniteNumber(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNotFoundError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && !Array.isArray(value);
}

function malformedBridgePayload(detail: string): Error {
  return new Error(`Malformed GTA bridge payload: ${detail}`);
}
