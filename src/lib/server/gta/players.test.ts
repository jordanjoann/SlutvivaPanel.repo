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
