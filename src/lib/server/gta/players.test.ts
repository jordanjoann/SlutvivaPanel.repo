import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GtaBridgePlayer,
  GtaPlayerActionInput,
  Instance,
} from "@/lib/types";
import {
  buildGtaKickCommand,
  buildGtaPlayerId,
  findActiveGtaBan,
  listGtaPlayers,
  recordGtaHeartbeat,
  recordGtaPlayerAction,
  recordGtaPlayerDrop,
  recordGtaPlayerJoin,
} from "./players";

let root = "";

function instance(): Instance {
  return {
    id: "los-santos",
    name: "Los Santos",
    game: "gta",
    description: "Private GTA test server",
    development: false,
    version: "recommended",
    port: 30120,
    dataPath: path.join(root, "server-data"),
    runtime: "docker",
    serverEngine: "fxserver",
    docker: {
      containerName: "gta-los-santos",
      image: "slutvival/fxserver-base:bookworm",
      network: "slutvival-net",
    },
    resources: { memoryLimitMB: 4096, cpuLimit: 2 },
    maxPlayers: 48,
    passwordProtected: false,
    publicAdvertised: false,
    autoRestart: false,
    autoBackup: false,
    createdAt: 1,
    updatedAt: 1,
  };
}

function bridgePlayer(
  overrides: Partial<GtaBridgePlayer> = {},
): GtaBridgePlayer {
  return {
    serverId: 7,
    name: "Bocephus",
    pingMs: 44,
    identifiers: [
      { type: "license", value: "license:abc123" },
      { type: "discord", value: "discord:987654321" },
    ],
    ...overrides,
  };
}

function expectedPlayerId(stableKey: string): string {
  return `gta_${crypto.createHash("sha256").update(stableKey).digest("hex").slice(0, 20)}`;
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "slutvival-gta-players-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("GTA players", () => {
  it("flattens newlines in kick command reasons", () => {
    expect(buildGtaKickCommand(7, "Banned:\nNope")).toBe(
      "slutvival_kick 7 Banned: Nope",
    );
  });

  it("builds player ids from the normalized selected identifier value", () => {
    expect(
      buildGtaPlayerId({
        name: "Bocephus",
        identifiers: [{ type: "license", value: " LICENSE:ABC123 " }],
      }),
    ).toBe(expectedPlayerId("license:abc123"));
  });

  it("builds fallback player ids from the lowercased player name", () => {
    expect(
      buildGtaPlayerId({
        name: " Bocephus ",
        identifiers: [],
      }),
    ).toBe(expectedPlayerId("bocephus"));
  });

  it("tracks empty bridge heartbeats independently of player heartbeats", async () => {
    const inst = instance();
    const now = Date.UTC(2026, 6, 5, 12, 0, 0);

    const heartbeat = await recordGtaHeartbeat(inst, [], now);
    const freshRoster = await listGtaPlayers(inst, now + 29_000);
    const expiredRoster = await listGtaPlayers(inst, now + 31_000);

    expect(heartbeat.players).toHaveLength(0);
    expect(heartbeat.bridge).toEqual({
      lastHeartbeatAt: now,
      online: true,
    });
    expect(freshRoster.bridge).toEqual({
      lastHeartbeatAt: now,
      online: true,
    });
    expect(expiredRoster.bridge).toEqual({
      lastHeartbeatAt: now,
      online: false,
    });
  });

  it("merges heartbeat players with tracked offline players", async () => {
    const inst = instance();
    const now = Date.UTC(2026, 6, 5, 12, 0, 0);

    const joined = await recordGtaPlayerJoin(
      inst,
      bridgePlayer({
        serverId: 3,
        name: "Offline Soon",
        identifiers: [{ type: "license", value: "license:offline456" }],
      }),
      now,
    );
    await recordGtaPlayerDrop(
      inst,
      {
        playerId: joined.player.id,
        serverId: 3,
        reason: "Quit",
      },
      now + 60_000,
    );
    await recordGtaHeartbeat(inst, [bridgePlayer()], now + 120_000);

    const roster = await listGtaPlayers(inst, now + 121_000);

    expect(roster.onlineCount).toBe(1);
    expect(roster.offlineCount).toBe(1);
    expect(roster.players.map((p) => [p.name, p.online])).toEqual([
      ["Bocephus", true],
      ["Offline Soon", false],
    ]);
    expect(roster.players[0].serverId).toBe(7);
    expect(roster.players[0].pingMs).toBe(44);
  });

  it("keeps the required stable player id when a durable identifier changes names", async () => {
    const inst = instance();
    const now = Date.UTC(2026, 6, 5, 12, 0, 0);
    const original = bridgePlayer({ name: "Original Name" });
    const renamed = bridgePlayer({ name: "Renamed Player" });

    const joined = await recordGtaPlayerJoin(inst, original, now);
    await recordGtaHeartbeat(inst, [renamed], now + 1);

    const roster = await listGtaPlayers(inst, now + 2);

    expect(joined.player.id).toBe(buildGtaPlayerId(original));
    expect(roster.players).toHaveLength(1);
    expect(roster.players[0]).toMatchObject({
      id: buildGtaPlayerId(renamed),
      name: "Renamed Player",
      online: true,
    });
  });

  it("migrates sessions and punishments when a stronger durable identifier appears", async () => {
    const inst = instance();
    const now = Date.UTC(2026, 6, 5, 12, 0, 0);
    const steamOnly = bridgePlayer({
      identifiers: [{ type: "steam", value: "steam:110000112345678" }],
    });
    const licenseAndSteam = bridgePlayer({
      identifiers: [
        { type: "license", value: "license:new-license" },
        { type: "steam", value: "steam:110000112345678" },
      ],
    });

    const joined = await recordGtaPlayerJoin(inst, steamOnly, now);
    await recordGtaPlayerAction(
      inst,
      { action: "warn", playerId: joined.player.id, reason: "Mind the rules" },
      { id: "u_owner", username: "Owner" },
      now + 1,
    );
    await recordGtaHeartbeat(inst, [licenseAndSteam], now + 2);

    const roster = await listGtaPlayers(inst, now + 3);

    expect(joined.player.id).toBe(buildGtaPlayerId(steamOnly));
    expect(roster.players).toHaveLength(1);
    expect(roster.players[0].id).toBe(buildGtaPlayerId(licenseAndSteam));
    expect(roster.players[0].sessions).toHaveLength(1);
    expect(roster.players[0].sessions[0].playerId).toBe(
      buildGtaPlayerId(licenseAndSteam),
    );
    expect(roster.players[0].punishments).toHaveLength(1);
    expect(roster.players[0].punishments[0]).toMatchObject({
      playerId: buildGtaPlayerId(licenseAndSteam),
      reason: "Mind the rules",
    });
  });

  it("records moderation actions against alias player ids after migration", async () => {
    const inst = instance();
    const now = Date.UTC(2026, 6, 5, 12, 0, 0);
    const steamOnly = bridgePlayer({
      serverId: 3,
      identifiers: [{ type: "steam", value: "steam:action-alias" }],
    });
    const licenseAndSteam = bridgePlayer({
      serverId: 12,
      identifiers: [
        { type: "license", value: "license:action-alias" },
        { type: "steam", value: "steam:action-alias" },
      ],
    });

    const joined = await recordGtaPlayerJoin(inst, steamOnly, now);
    await recordGtaHeartbeat(inst, [licenseAndSteam], now + 1);

    const result = await recordGtaPlayerAction(
      inst,
      { action: "ban", playerId: joined.player.id, reason: "Alias ban" },
      { id: "u_owner", username: "Owner" },
      now + 2,
    );

    expect(joined.player.id).toBe(buildGtaPlayerId(steamOnly));
    expect(result.punishment).toMatchObject({
      playerId: buildGtaPlayerId(licenseAndSteam),
      type: "ban",
      active: true,
      reason: "Alias ban",
    });
    expect(result.liveCommand).toContain("slutvival_kick 12");
    expect(result.liveCommand).toContain("Banned: Alias ban");
  });

  it("associates old-id punishments through player aliases after partial migration", async () => {
    const inst = instance();
    const now = Date.UTC(2026, 6, 5, 12, 0, 0);
    const steamOnly = bridgePlayer({
      identifiers: [{ type: "steam", value: "steam:110000112345678" }],
    });
    const licenseAndSteam = bridgePlayer({
      identifiers: [
        { type: "license", value: "license:partial-license" },
        { type: "steam", value: "steam:110000112345678" },
      ],
    });

    const joined = await recordGtaPlayerJoin(inst, steamOnly, now);
    await recordGtaPlayerAction(
      inst,
      { action: "ban", playerId: joined.player.id, reason: "Partial ban" },
      { id: "u_owner", username: "Owner" },
      now + 1,
    );

    const playersFile = path.join(inst.dataPath, "slutvival", "players.json");
    const players = JSON.parse(await fs.readFile(playersFile, "utf8"));
    players[0] = {
      ...players[0],
      id: buildGtaPlayerId(licenseAndSteam),
      aliases: [joined.player.id],
      identifiers: licenseAndSteam.identifiers,
    };
    await fs.writeFile(playersFile, `${JSON.stringify(players, null, 2)}\n`);

    const roster = await listGtaPlayers(inst, now + 2);
    const licenseBan = await findActiveGtaBan(inst, [
      { type: "license", value: "license:partial-license" },
    ]);
    const steamBan = await findActiveGtaBan(inst, [
      { type: "steam", value: "steam:110000112345678" },
    ]);

    expect(roster.players).toHaveLength(1);
    expect(roster.players[0].id).toBe(buildGtaPlayerId(licenseAndSteam));
    expect(roster.players[0].punishments).toHaveLength(1);
    expect(roster.players[0].punishments[0]).toMatchObject({
      playerId: joined.player.id,
      reason: "Partial ban",
    });
    expect(licenseBan?.reason).toBe("Partial ban");
    expect(steamBan?.reason).toBe("Partial ban");
  });

  it("normalizes alias-backed open sessions during timeout, drop, and rejoin", async () => {
    const now = Date.UTC(2026, 6, 5, 12, 0, 0);
    const steamOnly = bridgePlayer({
      serverId: 7,
      identifiers: [{ type: "steam", value: "steam:alias-session" }],
    });
    const licenseAndSteam = bridgePlayer({
      serverId: 7,
      identifiers: [
        { type: "license", value: "license:alias-session" },
        { type: "steam", value: "steam:alias-session" },
      ],
    });
    const oldId = buildGtaPlayerId(steamOnly);
    const canonicalId = buildGtaPlayerId(licenseAndSteam);

    async function seedPartialMigration(inst: Instance) {
      const joined = await recordGtaPlayerJoin(inst, steamOnly, now);
      expect(joined.player.id).toBe(oldId);

      const playersFile = path.join(inst.dataPath, "slutvival", "players.json");
      const players = JSON.parse(await fs.readFile(playersFile, "utf8"));
      players[0] = {
        ...players[0],
        id: canonicalId,
        aliases: [oldId],
        identifiers: licenseAndSteam.identifiers,
      };
      await fs.writeFile(playersFile, `${JSON.stringify(players, null, 2)}\n`);
    }

    const timeoutInst: Instance = {
      ...instance(),
      id: "alias-timeout",
      dataPath: path.join(root, "timeout-data"),
    };
    await seedPartialMigration(timeoutInst);

    const timedOut = await listGtaPlayers(timeoutInst, now + 31_000);
    expect(timedOut.players[0].online).toBe(false);
    expect(timedOut.players[0].sessions).toHaveLength(1);
    expect(timedOut.players[0].sessions[0]).toMatchObject({
      playerId: canonicalId,
      leftAt: now,
      dropReason: "Heartbeat timed out",
    });

    const lifecycleInst: Instance = {
      ...instance(),
      id: "alias-lifecycle",
      dataPath: path.join(root, "lifecycle-data"),
    };
    await seedPartialMigration(lifecycleInst);

    let roster = await recordGtaHeartbeat(
      lifecycleInst,
      [licenseAndSteam],
      now + 1,
    );
    let openSessions = roster.players[0].sessions.filter(
      (session) => session.leftAt === undefined,
    );
    expect(roster.players[0].sessions).toHaveLength(1);
    expect(openSessions).toHaveLength(1);
    expect(openSessions[0]).toMatchObject({
      playerId: canonicalId,
      serverId: 7,
    });

    await recordGtaPlayerDrop(
      lifecycleInst,
      { playerId: oldId, reason: "Quit" },
      now + 2,
    );
    roster = await listGtaPlayers(lifecycleInst, now + 3);
    expect(roster.players[0].online).toBe(false);
    expect(roster.players[0].sessions).toHaveLength(1);
    expect(roster.players[0].sessions[0]).toMatchObject({
      playerId: canonicalId,
      leftAt: now + 2,
      dropReason: "Quit",
    });

    await recordGtaHeartbeat(lifecycleInst, [licenseAndSteam], now + 10);
    roster = await listGtaPlayers(lifecycleInst, now + 11);
    openSessions = roster.players[0].sessions.filter(
      (session) => session.leftAt === undefined,
    );
    expect(roster.players[0].sessions).toHaveLength(2);
    expect(openSessions).toHaveLength(1);
    expect(openSessions[0]).toMatchObject({
      playerId: canonicalId,
      serverId: 7,
      joinedAt: now + 10,
    });
  });

  it("does not downgrade the canonical id when later heartbeats omit a stronger identifier", async () => {
    const inst = instance();
    const now = Date.UTC(2026, 6, 5, 12, 0, 0);
    const licenseAndSteam = bridgePlayer({
      identifiers: [
        { type: "license", value: "license:existing-license" },
        { type: "steam", value: "steam:110000112345678" },
      ],
    });
    const steamOnly = bridgePlayer({
      identifiers: [{ type: "steam", value: "steam:110000112345678" }],
    });

    const joined = await recordGtaPlayerJoin(inst, licenseAndSteam, now);
    await recordGtaPlayerAction(
      inst,
      { action: "warn", playerId: joined.player.id, reason: "Stay canonical" },
      { id: "u_owner", username: "Owner" },
      now + 1,
    );
    await recordGtaHeartbeat(inst, [steamOnly], now + 2);

    const roster = await listGtaPlayers(inst, now + 3);

    expect(joined.player.id).toBe(buildGtaPlayerId(licenseAndSteam));
    expect(roster.players).toHaveLength(1);
    expect(roster.players[0].id).toBe(buildGtaPlayerId(licenseAndSteam));
    expect(roster.players[0].sessions).toHaveLength(1);
    expect(roster.players[0].sessions[0].playerId).toBe(
      buildGtaPlayerId(licenseAndSteam),
    );
    expect(roster.players[0].punishments).toHaveLength(1);
    expect(roster.players[0].punishments[0]).toMatchObject({
      playerId: buildGtaPlayerId(licenseAndSteam),
      reason: "Stay canonical",
    });
  });

  it("does not rewrite punishments on heartbeat when no player id migration occurs", async () => {
    const inst = instance();
    const now = Date.UTC(2026, 6, 5, 12, 0, 0);
    const joined = await recordGtaPlayerJoin(inst, bridgePlayer(), now);
    await recordGtaPlayerAction(
      inst,
      { action: "ban", playerId: joined.player.id, reason: "Keep this ban" },
      { id: "u_owner", username: "Owner" },
      now + 1,
    );

    const writeSpy = vi.spyOn(fs, "writeFile");
    await recordGtaHeartbeat(inst, [bridgePlayer()], now + 2);

    const punishmentWrites = writeSpy.mock.calls.filter(([file]) =>
      String(file).includes("punishments.json"),
    );
    expect(punishmentWrites).toHaveLength(0);
  });

  it("migrates a non-durable live player by server id when durable identifiers appear", async () => {
    const inst = instance();
    const now = Date.UTC(2026, 6, 5, 12, 0, 0);
    const ipOnly = bridgePlayer({
      serverId: 7,
      name: "Temporary Identity",
      identifiers: [{ type: "ip", value: "ip:203.0.113.9" }],
    });
    const licensed = bridgePlayer({
      serverId: 7,
      name: "Licensed Identity",
      identifiers: [{ type: "license", value: "license:live-slot" }],
    });

    const joined = await recordGtaPlayerJoin(inst, ipOnly, now);
    await recordGtaPlayerAction(
      inst,
      { action: "warn", playerId: joined.player.id, reason: "Same session" },
      { id: "u_owner", username: "Owner" },
      now + 1,
    );
    await recordGtaHeartbeat(inst, [licensed], now + 2);

    const roster = await listGtaPlayers(inst, now + 3);

    expect(roster.onlineCount).toBe(1);
    expect(roster.players).toHaveLength(1);
    expect(roster.players[0].id).toBe(buildGtaPlayerId(licensed));
    expect(roster.players[0].sessions).toHaveLength(1);
    expect(roster.players[0].sessions[0].playerId).toBe(
      buildGtaPlayerId(licensed),
    );
    expect(roster.players[0].punishments).toHaveLength(1);
    expect(roster.players[0].punishments[0]).toMatchObject({
      playerId: buildGtaPlayerId(licensed),
      reason: "Same session",
    });
  });

  it("accepts drops with a stale player id when the current server id matches", async () => {
    const inst = instance();
    const now = Date.UTC(2026, 6, 5, 12, 0, 0);
    const ipOnly = bridgePlayer({
      serverId: 7,
      name: "Temporary Identity",
      identifiers: [{ type: "ip", value: "ip:203.0.113.9" }],
    });
    const licensed = bridgePlayer({
      serverId: 7,
      name: "Licensed Identity",
      identifiers: [{ type: "license", value: "license:live-slot" }],
    });

    const joined = await recordGtaPlayerJoin(inst, ipOnly, now);
    await recordGtaHeartbeat(inst, [licensed], now + 1);
    await recordGtaPlayerDrop(
      inst,
      {
        playerId: joined.player.id,
        serverId: 7,
        reason: "Disconnected",
      },
      now + 2,
    );

    const roster = await listGtaPlayers(inst, now + 3);

    expect(roster.players).toHaveLength(1);
    expect(roster.players[0]).toMatchObject({
      id: buildGtaPlayerId(licensed),
      online: false,
    });
    expect(roster.players[0].sessions).toHaveLength(1);
    expect(roster.players[0].sessions[0]).toMatchObject({
      playerId: buildGtaPlayerId(licensed),
      leftAt: now + 2,
      dropReason: "Disconnected",
    });
  });

  it("preserves concurrent joins for different durable players", async () => {
    const inst = instance();
    const now = Date.UTC(2026, 6, 5, 12, 0, 0);
    const first = bridgePlayer({
      serverId: 7,
      name: "First Join",
      identifiers: [{ type: "license", value: "license:first" }],
    });
    const second = bridgePlayer({
      serverId: 8,
      name: "Second Join",
      identifiers: [{ type: "license", value: "license:second" }],
    });

    await Promise.all([
      recordGtaPlayerJoin(inst, first, now),
      recordGtaPlayerJoin(inst, second, now + 1),
    ]);

    const roster = await listGtaPlayers(inst, now + 2);

    expect(roster.players.map((player) => player.name).sort()).toEqual([
      "First Join",
      "Second Join",
    ]);
    expect(roster.players).toHaveLength(2);
    expect(roster.players.every((player) => player.sessions.length === 1)).toBe(
      true,
    );
  });

  it("records a closed session when a player drops", async () => {
    const inst = instance();
    const joinedAt = Date.UTC(2026, 6, 5, 12, 0, 0);
    const droppedAt = joinedAt + 18_000;

    const joined = await recordGtaPlayerJoin(inst, bridgePlayer(), joinedAt);
    await recordGtaPlayerDrop(
      inst,
      {
        playerId: joined.player.id,
        serverId: 7,
        reason: "Timed out",
      },
      droppedAt,
    );

    const roster = await listGtaPlayers(inst, droppedAt + 1);
    expect(roster.players[0].online).toBe(false);
    expect(roster.players[0].sessions).toHaveLength(1);
    expect(roster.players[0].sessions[0]).toMatchObject({
      joinedAt,
      leftAt: droppedAt,
      durationSeconds: 18,
      dropReason: "Timed out",
    });
  });

  it("clears online state when a dropped player has no open session", async () => {
    const inst = instance();
    const joinedAt = Date.UTC(2026, 6, 5, 12, 0, 0);
    const droppedAt = joinedAt + 1_000;

    const joined = await recordGtaPlayerJoin(inst, bridgePlayer(), joinedAt);
    await fs.writeFile(
      path.join(inst.dataPath, "slutvival", "sessions.json"),
      "[]\n",
      "utf8",
    );

    await recordGtaPlayerDrop(
      inst,
      {
        playerId: joined.player.id,
        serverId: 7,
        reason: "Missing session",
      },
      droppedAt,
    );

    const roster = await listGtaPlayers(inst, droppedAt + 1);

    expect(roster.players[0].online).toBe(false);
    expect(roster.players[0].serverId).toBeUndefined();
    expect(roster.players[0].pingMs).toBeUndefined();
    expect(roster.players[0].sessions).toHaveLength(0);
  });

  it("closes online players missing from heartbeat before a reused server id can be targeted", async () => {
    const inst = instance();
    const now = Date.UTC(2026, 6, 5, 12, 0, 0);
    const playerA = bridgePlayer({
      serverId: 7,
      name: "Player A",
      identifiers: [{ type: "license", value: "license:a" }],
    });
    const playerB = bridgePlayer({
      serverId: 7,
      name: "Player B",
      identifiers: [{ type: "license", value: "license:b" }],
    });

    const joinedA = await recordGtaPlayerJoin(inst, playerA, now);
    await recordGtaHeartbeat(inst, [playerB], now + 1_000);

    const roster = await listGtaPlayers(inst, now + 1_001);
    const stalePlayer = roster.players.find(
      (player) => player.name === "Player A",
    );
    const currentPlayer = roster.players.find(
      (player) => player.name === "Player B",
    );

    expect(currentPlayer).toMatchObject({
      online: true,
      serverId: 7,
    });
    expect(stalePlayer).toMatchObject({
      online: false,
    });
    expect(stalePlayer?.sessions[0]).toMatchObject({
      leftAt: now + 1_000,
      durationSeconds: 1,
      dropReason: "Heartbeat missing",
    });

    await expect(
      recordGtaPlayerAction(
        inst,
        { action: "kick", playerId: joinedA.player.id, reason: "Stale kick" },
        { id: "u_owner", username: "Owner" },
        now + 2_000,
      ),
    ).rejects.toThrow(/online player/i);
  });

  it("closes a different durable player when join reuses an online server id", async () => {
    const inst = instance();
    const now = Date.UTC(2026, 6, 5, 12, 0, 0);
    const playerA = bridgePlayer({
      serverId: 7,
      name: "Join A",
      identifiers: [{ type: "license", value: "license:join-a" }],
    });
    const playerB = bridgePlayer({
      serverId: 7,
      name: "Join B",
      identifiers: [{ type: "license", value: "license:join-b" }],
    });

    const joinedA = await recordGtaPlayerJoin(inst, playerA, now);
    await recordGtaPlayerJoin(inst, playerB, now + 1_000);

    const roster = await listGtaPlayers(inst, now + 1_001);
    const stalePlayer = roster.players.find(
      (player) => player.name === "Join A",
    );
    const currentPlayer = roster.players.find(
      (player) => player.name === "Join B",
    );

    expect(currentPlayer).toMatchObject({
      online: true,
      serverId: 7,
    });
    expect(stalePlayer).toMatchObject({
      online: false,
    });
    expect(stalePlayer?.sessions[0]).toMatchObject({
      leftAt: now + 1_000,
      durationSeconds: 1,
      dropReason: "Server id reused",
    });

    await expect(
      recordGtaPlayerAction(
        inst,
        { action: "kick", playerId: joinedA.player.id, reason: "Stale kick" },
        { id: "u_owner", username: "Owner" },
        now + 2_000,
      ),
    ).rejects.toThrow(/online player/i);
  });

  it("ignores stale drops for an old server id after the player rejoins", async () => {
    const inst = instance();
    const joinedAt = Date.UTC(2026, 6, 5, 12, 0, 0);
    const rejoinedAt = joinedAt + 2_000;
    const initial = bridgePlayer({ serverId: 7 });
    const rejoined = bridgePlayer({ serverId: 12 });

    const joined = await recordGtaPlayerJoin(inst, initial, joinedAt);
    await recordGtaPlayerDrop(
      inst,
      { playerId: joined.player.id, serverId: 7, reason: "Quit" },
      joinedAt + 1_000,
    );
    await recordGtaPlayerJoin(inst, rejoined, rejoinedAt);
    await recordGtaPlayerDrop(
      inst,
      { playerId: joined.player.id, serverId: 7, reason: "Late duplicate" },
      rejoinedAt + 1_000,
    );

    const roster = await listGtaPlayers(inst, rejoinedAt + 2_000);

    expect(roster.players[0]).toMatchObject({
      online: true,
      serverId: 12,
    });
    expect(roster.players[0].sessions).toHaveLength(2);
    expect(roster.players[0].sessions[0]).toMatchObject({
      serverId: 7,
      leftAt: joinedAt + 1_000,
      dropReason: "Quit",
    });
    expect(roster.players[0].sessions[1]).toMatchObject({
      serverId: 12,
      joinedAt: rejoinedAt,
    });
    expect(roster.players[0].sessions[1].leftAt).toBeUndefined();
  });

  it("starts a new current session when the same durable player changes server id", async () => {
    const inst = instance();
    const joinedAt = Date.UTC(2026, 6, 5, 12, 0, 0);
    const rejoinedAt = joinedAt + 5_000;
    const droppedAt = rejoinedAt + 1_000;

    await recordGtaPlayerJoin(inst, bridgePlayer({ serverId: 7 }), joinedAt);
    await recordGtaHeartbeat(
      inst,
      [bridgePlayer({ serverId: 12 })],
      rejoinedAt,
    );

    let roster = await listGtaPlayers(inst, rejoinedAt + 1);

    expect(roster.players[0]).toMatchObject({
      online: true,
      serverId: 12,
    });
    expect(roster.players[0].sessions).toHaveLength(2);
    expect(roster.players[0].sessions[0]).toMatchObject({
      serverId: 7,
      leftAt: rejoinedAt,
      durationSeconds: 5,
    });
    expect(roster.players[0].sessions[1]).toMatchObject({
      serverId: 12,
      joinedAt: rejoinedAt,
    });
    expect(roster.players[0].sessions[1].leftAt).toBeUndefined();

    await recordGtaPlayerDrop(
      inst,
      { serverId: 12, reason: "Current drop" },
      droppedAt,
    );
    roster = await listGtaPlayers(inst, droppedAt + 1);

    expect(roster.players[0].online).toBe(false);
    expect(roster.players[0].sessions[1]).toMatchObject({
      serverId: 12,
      leftAt: droppedAt,
      dropReason: "Current drop",
    });
  });

  it("creates distinct session ids for same-millisecond server id changes", async () => {
    const inst = instance();
    const now = Date.UTC(2026, 6, 5, 12, 0, 0);

    await recordGtaPlayerJoin(inst, bridgePlayer({ serverId: 7 }), now);
    await recordGtaHeartbeat(inst, [bridgePlayer({ serverId: 12 })], now);

    const roster = await listGtaPlayers(inst, now + 1);
    const sessionIds = roster.players[0].sessions.map((session) => session.id);

    expect(roster.players[0].sessions).toHaveLength(2);
    expect(new Set(sessionIds).size).toBe(2);
  });

  it("closes stale heartbeat sessions before counting offline time", async () => {
    const inst = instance();
    const joinedAt = Date.UTC(2026, 6, 5, 12, 0, 0);

    await recordGtaPlayerJoin(inst, bridgePlayer(), joinedAt);

    const timedOutRoster = await listGtaPlayers(inst, joinedAt + 31_000);

    expect(timedOutRoster.players[0].online).toBe(false);
    expect(timedOutRoster.players[0].sessions).toHaveLength(1);
    expect(timedOutRoster.players[0].sessions[0]).toMatchObject({
      joinedAt,
      leftAt: joinedAt,
      durationSeconds: 0,
      dropReason: "Heartbeat timed out",
    });

    await recordGtaHeartbeat(inst, [bridgePlayer()], joinedAt + 60_000);
    const rejoinedRoster = await listGtaPlayers(inst, joinedAt + 61_000);

    expect(rejoinedRoster.players[0].online).toBe(true);
    expect(rejoinedRoster.players[0].sessions).toHaveLength(2);
    expect(rejoinedRoster.players[0].sessions[1]).toMatchObject({
      joinedAt: joinedAt + 60_000,
    });
    expect(rejoinedRoster.players[0].sessions[1].leftAt).toBeUndefined();
  });

  it("ignores late drops after heartbeat timeout closes the session", async () => {
    const inst = instance();
    const joinedAt = Date.UTC(2026, 6, 5, 12, 0, 0);
    const droppedAt = joinedAt + 31_000;

    const joined = await recordGtaPlayerJoin(inst, bridgePlayer(), joinedAt);
    await recordGtaPlayerDrop(
      inst,
      {
        playerId: joined.player.id,
        serverId: 7,
        reason: "Late disconnect",
      },
      droppedAt,
    );

    const roster = await listGtaPlayers(inst, droppedAt + 1);

    expect(roster.players[0].online).toBe(false);
    expect(roster.players[0].sessions).toHaveLength(1);
    expect(roster.players[0].sessions[0]).toMatchObject({
      joinedAt,
      leftAt: joinedAt,
      durationSeconds: 0,
      dropReason: "Heartbeat timed out",
    });
  });

  it("requires reasons for warn and ban actions", async () => {
    const inst = instance();
    const now = Date.UTC(2026, 6, 5, 12, 0, 0);
    const joined = await recordGtaPlayerJoin(inst, bridgePlayer(), now);

    const warnInput: GtaPlayerActionInput = {
      action: "warn",
      playerId: joined.player.id,
      reason: "",
    };
    await expect(
      recordGtaPlayerAction(
        inst,
        warnInput,
        { id: "u_owner", username: "Owner" },
        now,
      ),
    ).rejects.toThrow(/reason is required/i);

    const banInput: GtaPlayerActionInput = {
      action: "ban",
      playerId: joined.player.id,
      reason: "Repeated RDM",
    };
    const result = await recordGtaPlayerAction(
      inst,
      banInput,
      { id: "u_owner", username: "Owner" },
      now + 1,
    );

    expect(result.punishment.type).toBe("ban");
    expect(result.punishment.active).toBe(true);
    expect(result.liveCommand).toContain("slutvival_kick 7");
    expect(result.liveCommand).toContain("Banned: Repeated RDM");
  });

  it("rejects invalid runtime actions without writing punishments", async () => {
    const inst = instance();
    const now = Date.UTC(2026, 6, 5, 12, 0, 0);
    const joined = await recordGtaPlayerJoin(inst, bridgePlayer(), now);
    const invalidInput = {
      action: "mute",
      playerId: joined.player.id,
      reason: "Nope",
    } as unknown as GtaPlayerActionInput;

    await expect(
      recordGtaPlayerAction(
        inst,
        invalidInput,
        { id: "u_owner", username: "Owner" },
        now + 1,
      ),
    ).rejects.toThrow(/invalid action/i);
    await expect(
      fs.readFile(
        path.join(inst.dataPath, "slutvival", "punishments.json"),
        "utf8",
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects actions when punishments storage is corrupt without overwriting it", async () => {
    const inst = instance();
    const now = Date.UTC(2026, 6, 5, 12, 0, 0);
    const joined = await recordGtaPlayerJoin(inst, bridgePlayer(), now);
    await recordGtaPlayerAction(
      inst,
      { action: "warn", playerId: joined.player.id, reason: "First warning" },
      { id: "u_owner", username: "Owner" },
      now + 1,
    );

    const punishmentsFile = path.join(
      inst.dataPath,
      "slutvival",
      "punishments.json",
    );
    const corruptContent = "{ invalid punishment json";
    await fs.writeFile(punishmentsFile, corruptContent, "utf8");

    await expect(
      recordGtaPlayerAction(
        inst,
        {
          action: "warn",
          playerId: joined.player.id,
          reason: "Second warning",
        },
        { id: "u_owner", username: "Owner" },
        now + 2,
      ),
    ).rejects.toThrow();
    await expect(fs.readFile(punishmentsFile, "utf8")).resolves.toBe(
      corruptContent,
    );
  });

  it("rejects persisted records with malformed optional fields", async () => {
    const now = Date.UTC(2026, 6, 5, 12, 0, 0);

    async function writeStorageFile(
      inst: Instance,
      fileName: string,
      value: unknown,
    ) {
      const dir = path.join(inst.dataPath, "slutvival");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, fileName),
        `${JSON.stringify(value, null, 2)}\n`,
        "utf8",
      );
    }

    const badPlayerInst: Instance = {
      ...instance(),
      id: "bad-player",
      dataPath: path.join(root, "bad-player-data"),
    };
    await writeStorageFile(badPlayerInst, "players.json", [
      {
        id: "gta_bad_player",
        name: "Bad Player",
        online: true,
        identifiers: [],
        firstSeenAt: now,
        lastSeenAt: now,
        lastHeartbeatAt: "bad",
      },
    ]);
    await expect(listGtaPlayers(badPlayerInst, now)).rejects.toThrow(
      /invalid record/i,
    );

    const badSessionInst: Instance = {
      ...instance(),
      id: "bad-session",
      dataPath: path.join(root, "bad-session-data"),
    };
    await writeStorageFile(badSessionInst, "sessions.json", [
      {
        id: "gta_session_bad",
        playerId: "gta_bad_player",
        name: "Bad Player",
        joinedAt: now,
        leftAt: "bad",
      },
    ]);
    await expect(listGtaPlayers(badSessionInst, now)).rejects.toThrow(
      /invalid record/i,
    );

    const badPunishmentInst: Instance = {
      ...instance(),
      id: "bad-punishment",
      dataPath: path.join(root, "bad-punishment-data"),
    };
    await writeStorageFile(badPunishmentInst, "punishments.json", [
      {
        id: "gta_punishment_bad",
        playerId: "gta_bad_player",
        playerName: "Bad Player",
        type: "warn",
        reason: "Bad optional fields",
        active: false,
        createdAt: now,
        revokedAt: "bad",
        actor: { id: 123, username: "Owner" },
      },
    ]);
    await expect(listGtaPlayers(badPunishmentInst, now)).rejects.toThrow(
      /invalid record/i,
    );
  });

  it("creates distinct punishment ids for same-player actions in the same millisecond", async () => {
    const inst = instance();
    const now = Date.UTC(2026, 6, 5, 12, 0, 0);
    const joined = await recordGtaPlayerJoin(inst, bridgePlayer(), now);

    const first = await recordGtaPlayerAction(
      inst,
      { action: "warn", playerId: joined.player.id, reason: "First warning" },
      { id: "u_owner", username: "Owner" },
      now + 1,
    );
    const second = await recordGtaPlayerAction(
      inst,
      { action: "warn", playerId: joined.player.id, reason: "Second warning" },
      { id: "u_owner", username: "Owner" },
      now + 1,
    );

    expect(first.punishment.id).not.toBe(second.punishment.id);
  });

  it("matches active bans by license and license2 identifiers", async () => {
    const inst = instance();
    const now = Date.UTC(2026, 6, 5, 12, 0, 0);
    const licenseJoined = await recordGtaPlayerJoin(
      inst,
      bridgePlayer({
        identifiers: [{ type: "license", value: "license:abc123" }],
      }),
      now,
    );
    await recordGtaPlayerAction(
      inst,
      {
        action: "ban",
        playerId: licenseJoined.player.id,
        reason: "License nope",
      },
      { id: "u_owner", username: "Owner" },
      now + 1,
    );

    const license2Joined = await recordGtaPlayerJoin(
      inst,
      bridgePlayer({
        name: "Second License",
        identifiers: [{ type: "license2", value: "license2:def456" }],
      }),
      now,
    );
    await recordGtaPlayerAction(
      inst,
      {
        action: "ban",
        playerId: license2Joined.player.id,
        reason: "License2 nope",
      },
      { id: "u_owner", username: "Owner" },
      now + 2,
    );

    const licenseBan = await findActiveGtaBan(inst, [
      { type: "license", value: "license:abc123" },
    ]);
    expect(licenseBan?.reason).toBe("License nope");

    const license2Ban = await findActiveGtaBan(inst, [
      { type: "license2", value: "license2:def456" },
    ]);
    expect(license2Ban?.reason).toBe("License2 nope");
  });

  it("matches active bans by non-license durable identifiers but not ip-only lookups", async () => {
    const inst = instance();
    const now = Date.UTC(2026, 6, 5, 12, 0, 0);
    const joined = await recordGtaPlayerJoin(
      inst,
      bridgePlayer({
        identifiers: [{ type: "steam", value: "steam:110000112345678" }],
      }),
      now,
    );
    await recordGtaPlayerAction(
      inst,
      { action: "ban", playerId: joined.player.id, reason: "Steam ban" },
      { id: "u_owner", username: "Owner" },
      now + 1,
    );

    const steamBan = await findActiveGtaBan(inst, [
      { type: "steam", value: "steam:110000112345678" },
    ]);
    const ipOnlyBan = await findActiveGtaBan(inst, [
      { type: "ip", value: "ip:203.0.113.9" },
    ]);

    expect(steamBan?.reason).toBe("Steam ban");
    expect(ipOnlyBan).toBeNull();
  });

  it("rejects kicking an offline player", async () => {
    const inst = instance();
    const now = Date.UTC(2026, 6, 5, 12, 0, 0);
    const joined = await recordGtaPlayerJoin(inst, bridgePlayer(), now);
    await recordGtaPlayerDrop(
      inst,
      {
        playerId: joined.player.id,
        serverId: 7,
        reason: "Quit",
      },
      now + 1,
    );

    await expect(
      recordGtaPlayerAction(
        inst,
        { action: "kick", playerId: joined.player.id, reason: "Take five" },
        { id: "u_owner", username: "Owner" },
        now + 2,
      ),
    ).rejects.toThrow(/online player/i);
  });
});
