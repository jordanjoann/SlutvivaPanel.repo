import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  GtaBridgePlayer,
  GtaPlayerActionInput,
  Instance,
} from "@/lib/types";
import {
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

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "slutvival-gta-players-"));
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("GTA players", () => {
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

  it("records a closed session when a player drops", async () => {
    const inst = instance();
    const joinedAt = Date.UTC(2026, 6, 5, 12, 0, 0);
    const droppedAt = joinedAt + 180_000;

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
      durationSeconds: 180,
      dropReason: "Timed out",
    });
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
