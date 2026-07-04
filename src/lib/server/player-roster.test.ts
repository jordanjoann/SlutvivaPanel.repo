import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Instance, Player } from "@/lib/types";

const REAL_UID = "bLRZEr65Nyp+9c7tZ7FGEQQS";

describe("player roster", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses Vintage Story playerdata as the player identity source", async () => {
    const { getPlayerRoster } = await setupRoster({
      playerdata: [
        {
          PlayerUID: REAL_UID,
          RoleCode: "admin",
          LastKnownPlayername: "P1nkOblivion",
          LastJoinDate: "07/03/2026 02:22",
        },
      ],
      panelPlayers: [
        {
          uid: "known-p1nkoblivion",
          name: "p1nkoblivion",
          role: "admin",
          isWhitelisted: true,
          playtimeSeconds: 0,
          lastSeen: 1783043645032,
        },
        {
          uid: "known-blrzer65nyp-9c7tz7fgeqqs",
          name: REAL_UID,
          role: "member",
          isWhitelisted: false,
          playtimeSeconds: 0,
          lastSeen: 1783046234569,
        },
      ],
    });

    const roster = await getPlayerRoster(instance(), []);

    expect(roster.offline).toHaveLength(1);
    expect(roster.offline[0]).toMatchObject({
      uid: REAL_UID,
      name: "P1nkOblivion",
      role: "admin",
    });
    expect(roster.offline.map((player) => player.name)).not.toContain(REAL_UID);
  });

  it("applies the real playerdata UID to matching online players", async () => {
    const { getPlayerRoster } = await setupRoster({
      playerdata: [
        {
          PlayerUID: REAL_UID,
          RoleCode: "admin",
          LastKnownPlayername: "P1nkOblivion",
        },
      ],
      panelPlayers: [],
    });

    const onlinePlayer: Player = {
      uid: "P1nkOblivion",
      name: "P1nkOblivion",
      online: true,
      pingMs: 0,
      playtimeSeconds: 0,
      isOp: false,
      isWhitelisted: true,
      lastSeen: 1,
    };
    const roster = await getPlayerRoster(instance(), [onlinePlayer]);

    expect(roster.players).toHaveLength(1);
    expect(roster.players[0]).toMatchObject({
      uid: REAL_UID,
      name: "P1nkOblivion",
      role: "admin",
      isOp: true,
    });
    expect(roster.offline).toHaveLength(0);
  });

  it("reads roles from Vintage Story Roles arrays and DefaultRoleCode", async () => {
    const { getPlayerRoster } = await setupRoster({
      playerdata: [],
      panelPlayers: [],
      serverConfig: {
        DefaultRoleCode: "suplayer",
        Roles: [{ Code: "suplayer" }, { Code: "admin" }],
      },
    });

    const roster = await getPlayerRoster(instance(), []);

    expect(roster.roles).toEqual(["suplayer", "admin"]);
    expect(roster.defaultRole).toBe("suplayer");
  });

  it("reads role options from serverconfig.json even when serverroles.json exists", async () => {
    const { getPlayerRoster } = await setupRoster({
      playerdata: [],
      panelPlayers: [],
      serverConfig: {
        DefaultRoleCode: "suplayer",
        Roles: [
          { Code: "guest" },
          { Code: "spectator" },
          { Code: "suplayer" },
          { Code: "sumod" },
          { Code: "admin" },
        ],
      },
      serverRoles: {
        DefaultRoleCode: "admin",
        Roles: [{ Code: "admin" }],
      },
    });

    const roster = await getPlayerRoster(instance(), []);

    expect(roster.roles).toEqual(["guest", "spectator", "suplayer", "sumod", "admin"]);
    expect(roster.defaultRole).toBe("suplayer");
  });

  it("resolves managed player names through Vintage Story auth before caching", async () => {
    const { getPlayerRoster, updateKnownPlayer } = await setupRoster({
      playerdata: [],
      panelPlayers: [],
    });
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const body = String(init?.body ?? "");
      if (String(url).endsWith("/resolveplayername")) {
        expect(body).toBe("playername=P1nkOblivion");
        return Response.json({ playeruid: REAL_UID, valid: 1 });
      }
      if (String(url).endsWith("/resolveplayeruid")) {
        expect(body).toBe(`uid=${encodeURIComponent(REAL_UID)}`);
        return Response.json({ playername: "P1nkOblivion", valid: 1 });
      }
      throw new Error(`Unexpected auth URL ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await updateKnownPlayer("hub", "P1nkOblivion", { isWhitelisted: true });
    const roster = await getPlayerRoster(instance(), []);

    expect(roster.whitelist).toHaveLength(1);
    expect(roster.whitelist[0]).toMatchObject({
      uid: REAL_UID,
      name: "P1nkOblivion",
      isWhitelisted: true,
    });
  });

  it("does not show whitelist-only players as offline before they have joined", async () => {
    const { getPlayerRoster, updateKnownPlayer } = await setupRoster({
      playerdata: [],
      panelPlayers: [],
    });

    await updateKnownPlayer("hub", "InvitedPlayer", { isWhitelisted: true });
    const roster = await getPlayerRoster(instance(), []);

    expect(roster.whitelist).toHaveLength(1);
    expect(roster.whitelist[0]).toMatchObject({
      name: "InvitedPlayer",
      isWhitelisted: true,
    });
    expect(roster.offline.map((player) => player.name)).not.toContain("InvitedPlayer");
  });

  it("rewrites stale panel identities when a real identity is available", async () => {
    const { getPlayerRoster, updateKnownPlayer } = await setupRoster({
      playerdata: [
        {
          PlayerUID: REAL_UID,
          RoleCode: "admin",
          LastKnownPlayername: "P1nkOblivion",
        },
      ],
      panelPlayers: [
        {
          uid: "known-p1nkoblivion",
          name: "p1nkoblivion",
          role: "admin",
          isWhitelisted: true,
        },
        {
          uid: "known-blrzer65nyp-9c7tz7fgeqqs",
          name: REAL_UID,
          role: "member",
          isWhitelisted: false,
        },
      ],
    });

    await updateKnownPlayer("hub", REAL_UID, { isWhitelisted: false });
    const roster = await getPlayerRoster(instance(), []);

    expect(roster.offline).toHaveLength(1);
    expect(roster.offline[0]).toMatchObject({
      uid: REAL_UID,
      name: "P1nkOblivion",
      isWhitelisted: false,
    });
    expect(roster.whitelist).toHaveLength(0);
  });
});

async function setupRoster({
  playerdata,
  panelPlayers,
  serverConfig = {
    DefaultRoleCode: "suplayer",
    Roles: [{ Code: "suplayer" }, { Code: "admin" }],
  },
  serverRoles,
}: {
  playerdata: unknown[];
  panelPlayers: unknown[];
  serverConfig?: unknown;
  serverRoles?: unknown;
}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "slutvival-roster-"));
  vi.resetModules();
  vi.stubEnv("SLUTVIVAL_ROOT", root);

  const data = path.join(root, "games", "vintage-story", "hub", "vintage");
  await fs.mkdir(path.join(data, "ModConfig"), { recursive: true });
  await fs.mkdir(path.join(data, "Playerdata"), { recursive: true });
  await fs.writeFile(
    path.join(data, "serverconfig.json"),
    JSON.stringify(serverConfig, null, 2),
    "utf8",
  );
  if (serverRoles) {
    await fs.writeFile(
      path.join(data, "serverroles.json"),
      JSON.stringify(serverRoles, null, 2),
      "utf8",
    );
  }
  await fs.writeFile(
    path.join(data, "ModConfig", "panel-players.json"),
    JSON.stringify(panelPlayers, null, 2),
    "utf8",
  );
  await fs.writeFile(
    path.join(data, "Playerdata", "playerdata.json"),
    JSON.stringify(playerdata, null, 2),
    "utf8",
  );

  return import("./player-roster");
}

function instance(): Instance {
  return {
    id: "hub",
    name: "Hub",
    game: "vintage-story",
    development: false,
    version: "1.22.3",
    port: 42420,
    dataPath: "/tmp/hub/vintage",
    runtime: "docker",
    serverEngine: "stratum",
    docker: {
      containerName: "vs-hub",
      image: "mcr.microsoft.com/dotnet/runtime:10.0",
      network: "slutvival-net",
    },
    resources: { memoryLimitMB: 4096, cpuLimit: 2 },
    maxPlayers: 16,
    passwordProtected: false,
    publicAdvertised: false,
    autoRestart: false,
    autoBackup: true,
    createdAt: 1,
    updatedAt: 1,
  };
}
