# GTA Players Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GTA `Players` tab with online/offline roster tracking, player details, and Kick/Warn/Ban actions backed by a small `slutvival-admin` FiveM resource.

**Architecture:** Keep GTA player management separate from the Vintage Story player roster. Add a file-backed GTA player service under `src/lib/server/gta/`, owner-only GTA API routes under `/api/instances/[id]/gta/*`, a generated FiveM resource in `server-data/resources/[slutvival]/slutvival-admin`, and a panel page at `/gta/[id]/players`. The FiveM resource calls the panel over the shared Docker network using a generated bridge token stored in local runtime config.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, SWR, shadcn/base-nova components, lucide-react icons, FiveM Lua server resource, Docker network `slutvival-net`.

---

## Worktree Guard

The repo currently has unrelated dirty changes from the prior GTA setup work, including:

- `src/app/(panel)/gta/[id]/files/page.tsx`
- `src/components/vintage-story/file-manager.tsx`
- `src/components/vintage-story/file-manager-path.ts`
- `src/components/vintage-story/file-manager-path.test.ts`
- `src/lib/server/gta/artifacts.ts`
- `src/lib/server/gta/artifacts.test.ts`
- `src/lib/server/gta/server-data.ts`
- `src/lib/server/gta/server-data.test.ts`

Before each commit checkpoint, run:

```bash
git -C /opt/slutvival/slutvival-panel status --short
```

Do not revert those existing changes. If a task modifies a file that is already dirty, review the whole file before editing and stage only the intended GTA Players changes or skip the commit checkpoint and report the dirty overlap.

## File Structure

- Modify `src/lib/types.ts`: add serializable GTA player, session, punishment, and API payload types.
- Create `src/lib/server/gta/players.ts`: file-backed GTA player storage, merge logic, moderation records, ban matching, bridge event handling, and command helpers.
- Create `src/lib/server/gta/players.test.ts`: unit tests for merge/session/punishment/ban behavior.
- Modify `src/lib/server/gta/server-data.ts`: generate bridge token, write `slutvival-admin` resource files, and ensure `server.cfg` starts the resource after local secrets load.
- Modify `src/lib/server/gta/server-data.test.ts`: tests for resource generation, bridge token persistence, and `server.cfg` ordering.
- Create `src/app/api/instances/[id]/gta/players/route.ts`: owner-only GTA player list API.
- Create `src/app/api/instances/[id]/gta/players/action/route.ts`: owner-only Kick/Warn/Ban API.
- Create `src/app/api/instances/[id]/gta/bridge/route.ts`: token-authenticated FiveM bridge API.
- Create route tests beside the new routes as `route.test.ts`.
- Modify `src/lib/api.ts`: add typed `api.gta.players` client helpers.
- Create `src/lib/gta-players-view.ts`: pure UI helpers for filtering, initial selection, labels, and sorting.
- Create `src/lib/gta-players-view.test.ts`: tests for client-side list behavior.
- Modify `src/app/(panel)/gta/[id]/layout.tsx`: add `Players` tab between `Console` and `Files`.
- Create `src/app/(panel)/gta/[id]/players/page.tsx`: two-pane Players UI.

---

## Task 1: Add GTA Player Domain And Storage

**Files:**
- Modify: `src/lib/types.ts`
- Create: `src/lib/server/gta/players.ts`
- Test: `src/lib/server/gta/players.test.ts`

- [ ] **Step 1: Write failing storage tests**

Create `src/lib/server/gta/players.test.ts`:

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GtaBridgePlayer, GtaPlayerActionInput, Instance } from "@/lib/types";
import {
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

function bridgePlayer(overrides: Partial<GtaBridgePlayer> = {}): GtaBridgePlayer {
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

    const joined = await recordGtaPlayerJoin(inst, bridgePlayer({ serverId: 3, name: "Offline Soon" }), now);
    await recordGtaPlayerDrop(inst, {
      playerId: joined.player.id,
      serverId: 3,
      reason: "Quit",
    }, now + 60_000);
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

  it("records a closed session when a player drops", async () => {
    const inst = instance();
    const joinedAt = Date.UTC(2026, 6, 5, 12, 0, 0);
    const droppedAt = joinedAt + 180_000;

    const joined = await recordGtaPlayerJoin(inst, bridgePlayer(), joinedAt);
    await recordGtaPlayerDrop(inst, {
      playerId: joined.player.id,
      serverId: 7,
      reason: "Timed out",
    }, droppedAt);

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
      recordGtaPlayerAction(inst, warnInput, { id: "u_owner", username: "Owner" }, now),
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
    const joined = await recordGtaPlayerJoin(
      inst,
      bridgePlayer({
        identifiers: [{ type: "license2", value: "license2:def456" }],
      }),
      now,
    );
    await recordGtaPlayerAction(
      inst,
      { action: "ban", playerId: joined.player.id, reason: "Nope" },
      { id: "u_owner", username: "Owner" },
      now + 1,
    );

    const ban = await findActiveGtaBan(inst, [{ type: "license2", value: "license2:def456" }]);
    expect(ban?.reason).toBe("Nope");
  });

  it("rejects kicking an offline player", async () => {
    const inst = instance();
    const now = Date.UTC(2026, 6, 5, 12, 0, 0);
    const joined = await recordGtaPlayerJoin(inst, bridgePlayer(), now);
    await recordGtaPlayerDrop(inst, {
      playerId: joined.player.id,
      serverId: 7,
      reason: "Quit",
    }, now + 1);

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
```

- [ ] **Step 2: Run the failing storage tests**

Run:

```bash
cd /opt/slutvival/slutvival-panel
npm test -- src/lib/server/gta/players.test.ts
```

Expected: FAIL because `src/lib/server/gta/players.ts` and the GTA player types do not exist.

- [ ] **Step 3: Add GTA player types**

Add these serializable types to `src/lib/types.ts` near the existing `Player` section:

```ts
export type GtaIdentifierType =
  | "license"
  | "license2"
  | "discord"
  | "steam"
  | "fivem"
  | "ip"
  | "unknown";

export interface GtaPlayerIdentifier {
  type: GtaIdentifierType;
  value: string;
}

export interface GtaBridgePlayer {
  serverId: number;
  name: string;
  pingMs: number;
  identifiers: GtaPlayerIdentifier[];
}

export interface GtaPlayerSession {
  id: string;
  playerId: string;
  name: string;
  serverId?: number;
  joinedAt: number;
  leftAt?: number;
  durationSeconds?: number;
  dropReason?: string;
}

export type GtaPunishmentType = "kick" | "warn" | "ban";

export interface GtaPunishment {
  id: string;
  playerId: string;
  playerName: string;
  type: GtaPunishmentType;
  reason: string;
  active: boolean;
  createdAt: number;
  revokedAt?: number;
  actor?: {
    id: string;
    username: string;
  };
}

export interface GtaPlayerSummary {
  id: string;
  name: string;
  online: boolean;
  serverId?: number;
  pingMs?: number;
  identifiers: GtaPlayerIdentifier[];
  firstSeenAt: number;
  lastSeenAt: number;
  totalPlaytimeSeconds: number;
  sessions: GtaPlayerSession[];
  punishments: GtaPunishment[];
}

export interface GtaPlayersPayload {
  players: GtaPlayerSummary[];
  onlineCount: number;
  offlineCount: number;
  punishmentCount: number;
  bridge: {
    lastHeartbeatAt?: number;
    online: boolean;
  };
}

export interface GtaPlayerActionInput {
  action: GtaPunishmentType;
  playerId: string;
  reason?: string;
}

export interface GtaPlayerActionResult {
  ok: true;
  punishment: GtaPunishment;
  liveCommand?: string;
  liveAction?: {
    ok: boolean;
    error?: string;
  };
}
```

- [ ] **Step 4: Implement the GTA player service**

Create `src/lib/server/gta/players.ts` with these exports:

```ts
export async function listGtaPlayers(inst: Instance, now = Date.now()): Promise<GtaPlayersPayload>;
export async function recordGtaHeartbeat(inst: Instance, players: GtaBridgePlayer[], now = Date.now()): Promise<GtaPlayersPayload>;
export async function recordGtaPlayerJoin(inst: Instance, player: GtaBridgePlayer, now = Date.now()): Promise<{ player: GtaPlayerSummary }>;
export async function recordGtaPlayerDrop(inst: Instance, input: { playerId?: string; serverId?: number; reason?: string }, now = Date.now()): Promise<void>;
export async function recordGtaPlayerAction(inst: Instance, input: GtaPlayerActionInput, actor: { id: string; username: string }, now = Date.now()): Promise<GtaPlayerActionResult>;
export async function findActiveGtaBan(inst: Instance, identifiers: GtaPlayerIdentifier[]): Promise<GtaPunishment | null>;
export function buildGtaPlayerId(player: Pick<GtaBridgePlayer, "name" | "identifiers">): string;
export function buildGtaKickCommand(serverId: number, reason: string): string;
```

Implementation requirements:

- Store JSON under `path.join(inst.dataPath, "slutvival")`.
- Use `players.json`, `sessions.json`, and `punishments.json`.
- Write JSON atomically with `fs.writeFile(tmp)` then `fs.rename(tmp, file)`.
- Build stable player ids from the first available `license`, then `license2`, then `fivem`, then `steam`, then `discord`, then lowercased player name.
- Hash the stable key with SHA-256 and use `gta_${hex.slice(0, 20)}`.
- Normalize identifier values to lowercase and trim whitespace.
- Treat a player as online only when `online === true` and `lastHeartbeatAt` is no older than 30 seconds.
- Sort the list with online players first, then newest `lastSeenAt`, then name.
- `warn` and `ban` require non-empty reasons.
- `kick` requires an online player with a `serverId`.
- `ban` creates `active: true`; `warn` and `kick` create `active: false`.
- `ban` and `kick` return `liveCommand` when the target is online.
- `buildGtaKickCommand(7, "Banned: Nope")` returns `slutvival_kick 7 Banned: Nope` after replacing newlines with spaces.

- [ ] **Step 5: Run storage tests**

Run:

```bash
cd /opt/slutvival/slutvival-panel
npm test -- src/lib/server/gta/players.test.ts
```

Expected: PASS.

---

## Task 2: Generate The FiveM Admin Resource

**Files:**
- Modify: `src/lib/server/gta/server-data.ts`
- Modify: `src/lib/server/gta/server-data.test.ts`

- [ ] **Step 1: Add failing server-data tests**

Append tests to `src/lib/server/gta/server-data.test.ts`:

```ts
it("seeds the Slutvival admin resource and bridge token", async () => {
  const { ensureGtaServerData, readGtaBridgeToken } = await loadModule();
  const inst = instance();

  await ensureGtaServerData(inst, { cloneBaseResources: false });

  const manifest = await fs.readFile(
    path.join(inst.dataPath, "resources", "[slutvival]", "slutvival-admin", "fxmanifest.lua"),
    "utf8",
  );
  const serverLua = await fs.readFile(
    path.join(inst.dataPath, "resources", "[slutvival]", "slutvival-admin", "server.lua"),
    "utf8",
  );
  const secret = await fs.readFile(path.join(inst.dataPath, "server.secret.cfg"), "utf8");

  expect(manifest).toContain("fx_version");
  expect(serverLua).toContain("slutvival_kick");
  expect(serverLua).toContain("playerConnecting");
  expect(secret).toMatch(/set slutvival_bridge_token "[a-f0-9]{48}"/);
  await expect(readGtaBridgeToken(inst)).resolves.toMatch(/[a-f0-9]{48}/);
});

it("starts slutvival-admin after secrets are executed", async () => {
  const { ensureGtaServerData } = await loadModule();
  const inst = instance();

  await ensureGtaServerData(inst, { cloneBaseResources: false });

  const cfg = await fs.readFile(path.join(inst.dataPath, "server.cfg"), "utf8");
  expect(cfg.indexOf("exec server.secret.cfg")).toBeGreaterThan(-1);
  expect(cfg.indexOf("ensure slutvival-admin")).toBeGreaterThan(cfg.indexOf("exec server.secret.cfg"));
  expect(cfg).toContain('set slutvival_panel_url "http://slutvival-panel:3000"');
  expect(cfg).toContain('set slutvival_panel_server_id "los-santos"');
});

it("does not replace an existing bridge token", async () => {
  const { ensureGtaServerData, readGtaBridgeToken } = await loadModule();
  const inst = instance();
  await ensureGtaServerData(inst, { cloneBaseResources: false });
  const first = await readGtaBridgeToken(inst);

  await ensureGtaServerData(inst, { cloneBaseResources: false });

  await expect(readGtaBridgeToken(inst)).resolves.toBe(first);
});
```

- [ ] **Step 2: Run the failing server-data tests**

Run:

```bash
cd /opt/slutvival/slutvival-panel
npm test -- src/lib/server/gta/server-data.test.ts
```

Expected: FAIL because `readGtaBridgeToken`, token seeding, and resource files are not implemented.

- [ ] **Step 3: Implement token and resource generation**

Update `src/lib/server/gta/server-data.ts`:

- Import `randomBytes` from `node:crypto`.
- Add `const DEFAULT_PANEL_INTERNAL_URL = process.env.SLUTVIVAL_PANEL_INTERNAL_URL ?? "http://slutvival-panel:3000";`.
- Export `readGtaBridgeToken(inst: Instance): Promise<string | null>`.
- Add an internal `ensureGtaBridgeToken(inst)` that appends `set slutvival_bridge_token "<token>"` to `server.secret.cfg` when missing.
- Add `writeSlutvivalAdminResource(inst)` that writes `fxmanifest.lua` and `server.lua` under `resources/[slutvival]/slutvival-admin`.
- Call `ensureGtaBridgeToken(inst)` and `writeSlutvivalAdminResource(inst)` from `ensureGtaServerData`.

`fxmanifest.lua` content:

```lua
fx_version 'cerulean'
game 'gta5'

author 'Slutvival'
description 'Slutvival panel bridge and basic GTA moderation commands'
version '0.1.0'

server_script 'server.lua'
```

`server.lua` must:

- Read `slutvival_panel_url`, `slutvival_panel_server_id`, and `slutvival_bridge_token` convars.
- POST JSON to `/api/instances/<serverId>/gta/bridge`.
- Send `heartbeat`, `playerJoin`, `playerDrop`, and `banCheck` events.
- Use deferrals in `playerConnecting` and reject when the panel returns `{ allowed = false }`.
- Register `slutvival_kick` for console source `0` and call `DropPlayer(target, reason)`.
- Never print the bridge token.

- [ ] **Step 4: Update server.cfg generation**

Modify `gtaServerConfig(inst)` so the generated config includes this ordering:

```cfg
ensure mapmanager
ensure chat
ensure spawnmanager
ensure sessionmanager
ensure basic-gamemode
ensure hardcap
ensure rconlog

set slutvival_panel_url "http://slutvival-panel:3000"
set slutvival_panel_server_id "los-santos"

sv_scriptHookAllowed 0
sets tags "slutvival,default"
sets locale "en-US"
sv_hostname "Los Santos"
sets sv_projectName "Los Santos"
sets sv_projectDesc "Private Slutvival FiveM server."
set onesync on
sv_maxclients 48
exec server.secret.cfg

ensure slutvival-admin
```

- [ ] **Step 5: Run server-data tests**

Run:

```bash
cd /opt/slutvival/slutvival-panel
npm test -- src/lib/server/gta/server-data.test.ts
```

Expected: PASS.

---

## Task 3: Add GTA Player API Routes

**Files:**
- Create: `src/app/api/instances/[id]/gta/players/route.ts`
- Create: `src/app/api/instances/[id]/gta/players/route.test.ts`
- Create: `src/app/api/instances/[id]/gta/players/action/route.ts`
- Create: `src/app/api/instances/[id]/gta/players/action/route.test.ts`
- Create: `src/app/api/instances/[id]/gta/bridge/route.ts`
- Create: `src/app/api/instances/[id]/gta/bridge/route.test.ts`
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Write failing list route tests**

Create `src/app/api/instances/[id]/gta/players/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionAccount = vi.fn();
const getInstance = vi.fn();
const listGtaPlayers = vi.fn();

vi.mock("@/lib/server/auth", () => ({ getSessionAccount }));
vi.mock("@/lib/server/store", () => ({ getInstance }));
vi.mock("@/lib/server/gta/players", () => ({ listGtaPlayers }));

function params(id = "los-santos") {
  return { params: Promise.resolve({ id }) };
}

function gtaInstance() {
  return { id: "los-santos", name: "Los Santos", game: "gta" };
}

describe("GTA players list route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInstance.mockResolvedValue(gtaInstance());
    listGtaPlayers.mockResolvedValue({
      players: [],
      onlineCount: 0,
      offlineCount: 0,
      punishmentCount: 0,
      bridge: { online: false },
    });
  });

  it("rejects non-owner GTA access", async () => {
    getSessionAccount.mockResolvedValue({ account: { role: "admin" } });
    const { GET } = await import("./route");

    const response = await GET(new Request("http://panel/api/instances/los-santos/gta/players"), params());

    expect(response.status).toBe(403);
    expect(listGtaPlayers).not.toHaveBeenCalled();
  });

  it("rejects non-GTA instances", async () => {
    getSessionAccount.mockResolvedValue({ account: { role: "owner" } });
    getInstance.mockResolvedValue({ id: "main", name: "Main", game: "vintage-story" });
    const { GET } = await import("./route");

    const response = await GET(new Request("http://panel/api/instances/main/gta/players"), params("main"));

    expect(response.status).toBe(400);
    expect(listGtaPlayers).not.toHaveBeenCalled();
  });

  it("returns the owner GTA roster", async () => {
    getSessionAccount.mockResolvedValue({ account: { role: "owner" } });
    const { GET } = await import("./route");

    const response = await GET(new Request("http://panel/api/instances/los-santos/gta/players"), params());

    expect(response.status).toBe(200);
    expect(listGtaPlayers).toHaveBeenCalledWith(expect.objectContaining({ game: "gta" }));
  });
});
```

- [ ] **Step 2: Write failing action route tests**

Create `src/app/api/instances/[id]/gta/players/action/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionAccount = vi.fn();
const getInstance = vi.fn();
const recordGtaPlayerAction = vi.fn();
const command = vi.fn();

vi.mock("@/lib/server/auth", () => ({ getSessionAccount }));
vi.mock("@/lib/server/store", () => ({ getInstance }));
vi.mock("@/lib/server/gta/players", () => ({ recordGtaPlayerAction }));
vi.mock("@/lib/server/supervisor", () => ({ supervisor: { command } }));

function params(id = "los-santos") {
  return { params: Promise.resolve({ id }) };
}

describe("GTA player action route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInstance.mockResolvedValue({ id: "los-santos", name: "Los Santos", game: "gta" });
    recordGtaPlayerAction.mockResolvedValue({
      ok: true,
      punishment: {
        id: "pun_1",
        playerId: "gta_1",
        playerName: "Bocephus",
        type: "warn",
        reason: "Ease up",
        active: false,
        createdAt: 1,
      },
    });
  });

  it("requires owner access", async () => {
    getSessionAccount.mockResolvedValue({ account: { role: "moderator" } });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://panel/api/instances/los-santos/gta/players/action", {
        method: "POST",
        body: JSON.stringify({ action: "warn", playerId: "gta_1", reason: "Ease up" }),
      }),
      params(),
    );

    expect(response.status).toBe(403);
    expect(recordGtaPlayerAction).not.toHaveBeenCalled();
  });

  it("records owner actor details", async () => {
    getSessionAccount.mockResolvedValue({
      account: { id: "u_owner", username: "Owner", role: "owner" },
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://panel/api/instances/los-santos/gta/players/action", {
        method: "POST",
        body: JSON.stringify({ action: "warn", playerId: "gta_1", reason: "Ease up" }),
      }),
      params(),
    );

    expect(response.status).toBe(200);
    expect(recordGtaPlayerAction).toHaveBeenCalledWith(
      expect.objectContaining({ game: "gta" }),
      { action: "warn", playerId: "gta_1", reason: "Ease up" },
      { id: "u_owner", username: "Owner" },
    );
  });

  it("runs live commands and reports command failure", async () => {
    getSessionAccount.mockResolvedValue({
      account: { id: "u_owner", username: "Owner", role: "owner" },
    });
    recordGtaPlayerAction.mockResolvedValue({
      ok: true,
      punishment: { id: "pun_2", playerId: "gta_1", playerName: "Bocephus", type: "ban", reason: "Nope", active: true, createdAt: 1 },
      liveCommand: "slutvival_kick 7 Banned: Nope",
    });
    command.mockRejectedValue(new Error("stdin unavailable"));
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://panel/api/instances/los-santos/gta/players/action", {
        method: "POST",
        body: JSON.stringify({ action: "ban", playerId: "gta_1", reason: "Nope" }),
      }),
      params(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(command).toHaveBeenCalledWith(expect.objectContaining({ game: "gta" }), "slutvival_kick 7 Banned: Nope");
    expect(body.liveAction).toEqual({ ok: false, error: "stdin unavailable" });
  });
});
```

- [ ] **Step 3: Write failing bridge route tests**

Create `src/app/api/instances/[id]/gta/bridge/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const getInstance = vi.fn();
const handleGtaBridgeEvent = vi.fn();

vi.mock("@/lib/server/store", () => ({ getInstance }));
vi.mock("@/lib/server/gta/players", () => ({ handleGtaBridgeEvent }));

function params(id = "los-santos") {
  return { params: Promise.resolve({ id }) };
}

describe("GTA bridge route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInstance.mockResolvedValue({ id: "los-santos", name: "Los Santos", game: "gta" });
    handleGtaBridgeEvent.mockResolvedValue({ ok: true });
  });

  it("rejects non-GTA instances", async () => {
    getInstance.mockResolvedValue({ id: "main", name: "Main", game: "vintage-story" });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://panel/api/instances/main/gta/bridge", {
        method: "POST",
        body: JSON.stringify({ type: "heartbeat", serverToken: "token", players: [] }),
      }),
      params("main"),
    );

    expect(response.status).toBe(400);
    expect(handleGtaBridgeEvent).not.toHaveBeenCalled();
  });

  it("passes bridge events to the GTA player service without browser session auth", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://panel/api/instances/los-santos/gta/bridge", {
        method: "POST",
        body: JSON.stringify({ type: "heartbeat", serverToken: "token", players: [] }),
      }),
      params(),
    );

    expect(response.status).toBe(200);
    expect(handleGtaBridgeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ game: "gta" }),
      { type: "heartbeat", serverToken: "token", players: [] },
    );
  });
});
```

- [ ] **Step 4: Run failing route tests**

Run:

```bash
cd /opt/slutvival/slutvival-panel
npm test -- \
  src/app/api/instances/[id]/gta/players/route.test.ts \
  src/app/api/instances/[id]/gta/players/action/route.test.ts \
  src/app/api/instances/[id]/gta/bridge/route.test.ts
```

Expected: FAIL because the route files do not exist and `handleGtaBridgeEvent` is not exported yet.

- [ ] **Step 5: Implement bridge event handling in the player service**

Add this export to `src/lib/server/gta/players.ts`:

```ts
export async function handleGtaBridgeEvent(
  inst: Instance,
  body: unknown,
): Promise<{ ok: true } | { allowed: boolean; reason?: string }>;
```

Behavior:

- Validate `body` is an object.
- Read the expected token with `readGtaBridgeToken(inst)`.
- Throw `new Error("Invalid GTA bridge token")` when missing or mismatched.
- For `{ type: "heartbeat", players }`, call `recordGtaHeartbeat`.
- For `{ type: "playerJoin", player }`, call `recordGtaPlayerJoin`.
- For `{ type: "playerDrop", playerId, serverId, reason }`, call `recordGtaPlayerDrop`.
- For `{ type: "banCheck", identifiers }`, call `findActiveGtaBan` and return `{ allowed: false, reason }` when matched, otherwise `{ allowed: true }`.
- Throw `new Error("Unknown GTA bridge event type")` for any other type.

- [ ] **Step 6: Implement the routes**

Create `src/app/api/instances/[id]/gta/players/route.ts`:

```ts
import { canAccessInstanceGame } from "@/lib/access-policy";
import { getSessionAccount } from "@/lib/server/auth";
import { badRequest, forbidden, json, loadInstance, serverError, unauthorized } from "@/lib/server/http";
import { listGtaPlayers } from "@/lib/server/gta/players";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const session = await getSessionAccount();
    if (!session) return unauthorized();
    const { id } = await params;
    const res = await loadInstance(id);
    if ("response" in res) return res.response;
    if (!canAccessInstanceGame(session.account.role, res.instance.game)) return forbidden();
    if (res.instance.game !== "gta") return badRequest("GTA player routes require a GTA instance");
    return json(await listGtaPlayers(res.instance));
  } catch (e) {
    return serverError(e);
  }
}
```

Create `src/app/api/instances/[id]/gta/players/action/route.ts` using the same owner/GTA access guard. It should:

- Parse `action`, `playerId`, and `reason`.
- Reject invalid bodies with `400`.
- Call `recordGtaPlayerAction(instance, input, { id: session.account.id, username: session.account.username })`.
- If `result.liveCommand` exists, call `supervisor.command(instance, result.liveCommand)`.
- Return `{ ...result, liveAction: { ok: true } }` when the live command succeeds.
- Return `{ ...result, liveAction: { ok: false, error: message } }` when the live command fails.

Create `src/app/api/instances/[id]/gta/bridge/route.ts`. It should:

- Load the instance without browser session auth.
- Reject missing/non-GTA instances with `404`/`400`.
- Pass the JSON body to `handleGtaBridgeEvent`.
- Return the service result as JSON.
- Convert known validation errors to `400` and unexpected errors to `500`.

- [ ] **Step 7: Add typed client helpers**

Modify `src/lib/api.ts`:

```ts
import type {
  GtaPlayerActionInput,
  GtaPlayerActionResult,
  GtaPlayersPayload,
  // keep existing imports
} from "./types";
```

Add:

```ts
gta: {
  players: {
    list: (id: string) =>
      fetcher<GtaPlayersPayload>(`/api/instances/${id}/gta/players`),
    action: (id: string, body: GtaPlayerActionInput) =>
      send<GtaPlayerActionResult>(
        `/api/instances/${id}/gta/players/action`,
        "POST",
        body,
      ),
  },
},
```

- [ ] **Step 8: Run route tests**

Run:

```bash
cd /opt/slutvival/slutvival-panel
npm test -- \
  src/app/api/instances/[id]/gta/players/route.test.ts \
  src/app/api/instances/[id]/gta/players/action/route.test.ts \
  src/app/api/instances/[id]/gta/bridge/route.test.ts
```

Expected: PASS.

---

## Task 4: Add The GTA Players Page

**Files:**
- Create: `src/lib/gta-players-view.ts`
- Test: `src/lib/gta-players-view.test.ts`
- Modify: `src/app/(panel)/gta/[id]/layout.tsx`
- Create: `src/app/(panel)/gta/[id]/players/page.tsx`

- [ ] **Step 1: Write failing view helper tests**

Create `src/lib/gta-players-view.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { GtaPlayerSummary } from "./types";
import { filterGtaPlayers, initialGtaPlayerId, matchesGtaPlayerQuery } from "./gta-players-view";

function player(overrides: Partial<GtaPlayerSummary>): GtaPlayerSummary {
  return {
    id: "gta_1",
    name: "Bocephus",
    online: true,
    serverId: 7,
    pingMs: 44,
    identifiers: [{ type: "license", value: "license:abc123" }],
    firstSeenAt: 1,
    lastSeenAt: 2,
    totalPlaytimeSeconds: 0,
    sessions: [],
    punishments: [],
    ...overrides,
  };
}

describe("GTA players view helpers", () => {
  it("matches name, server id, and identifiers", () => {
    const p = player({});
    expect(matchesGtaPlayerQuery(p, "boce")).toBe(true);
    expect(matchesGtaPlayerQuery(p, "7")).toBe(true);
    expect(matchesGtaPlayerQuery(p, "abc123")).toBe(true);
    expect(matchesGtaPlayerQuery(p, "zzz")).toBe(false);
  });

  it("filters by status and query", () => {
    const players = [
      player({ id: "online", name: "Online", online: true }),
      player({ id: "offline", name: "Offline", online: false, serverId: undefined, pingMs: undefined }),
    ];

    expect(filterGtaPlayers(players, "all", "").map((p) => p.id)).toEqual(["online", "offline"]);
    expect(filterGtaPlayers(players, "online", "").map((p) => p.id)).toEqual(["online"]);
    expect(filterGtaPlayers(players, "offline", "").map((p) => p.id)).toEqual(["offline"]);
    expect(filterGtaPlayers(players, "all", "off").map((p) => p.id)).toEqual(["offline"]);
  });

  it("keeps selected player when possible and otherwise picks first online player", () => {
    const players = [
      player({ id: "offline", online: false }),
      player({ id: "online", online: true }),
    ];

    expect(initialGtaPlayerId(players, "offline")).toBe("offline");
    expect(initialGtaPlayerId(players, "missing")).toBe("online");
    expect(initialGtaPlayerId([], "missing")).toBe("");
  });
});
```

- [ ] **Step 2: Run failing view helper tests**

Run:

```bash
cd /opt/slutvival/slutvival-panel
npm test -- src/lib/gta-players-view.test.ts
```

Expected: FAIL because `src/lib/gta-players-view.ts` does not exist.

- [ ] **Step 3: Implement view helpers**

Create `src/lib/gta-players-view.ts`:

```ts
import type { GtaPlayerSummary } from "./types";

export type GtaPlayerFilter = "all" | "online" | "offline";

export function matchesGtaPlayerQuery(player: GtaPlayerSummary, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  return (
    player.name.toLowerCase().includes(query) ||
    String(player.serverId ?? "").includes(query) ||
    player.id.toLowerCase().includes(query) ||
    player.identifiers.some((identifier) => identifier.value.toLowerCase().includes(query))
  );
}

export function filterGtaPlayers(
  players: GtaPlayerSummary[],
  filter: GtaPlayerFilter,
  query: string,
): GtaPlayerSummary[] {
  return players.filter((player) => {
    if (filter === "online" && !player.online) return false;
    if (filter === "offline" && player.online) return false;
    return matchesGtaPlayerQuery(player, query);
  });
}

export function initialGtaPlayerId(players: GtaPlayerSummary[], currentId: string): string {
  if (currentId && players.some((player) => player.id === currentId)) return currentId;
  return players.find((player) => player.online)?.id ?? players[0]?.id ?? "";
}
```

- [ ] **Step 4: Add the Players tab**

Modify `src/app/(panel)/gta/[id]/layout.tsx`:

```ts
const TABS = [
  { key: "overview", label: "Overview", segment: "" },
  { key: "console", label: "Console", segment: "console" },
  { key: "players", label: "Players", segment: "players" },
  { key: "files", label: "Files", segment: "files" },
  { key: "settings", label: "Settings", segment: "settings" },
] as const;
```

- [ ] **Step 5: Create the Players page**

Create `src/app/(panel)/gta/[id]/players/page.tsx`.

Implementation requirements:

- Start with `"use client";`.
- Use `useParams<{ id: string }>()`.
- Fetch with `useSWR(["gta-players", id], () => api.gta.players.list(id), { refreshInterval: 3000 })`.
- Use `PageHeader` with title `Players`, description `Track GTA player history and moderation actions.`, and `UsersIcon`.
- Use a desktop grid `lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]`.
- Left pane uses `SectionCard` with search input, a `Select` filter, and rows built from `filterGtaPlayers`.
- Rows use `Avatar` + `AvatarFallback`, `Badge` for Online/Offline, server ID, ping, and last seen.
- Right pane shows the selected player details, identifiers, sessions, punishment history, and action buttons.
- Use existing `useConfirm` for `Kick` and `Ban`.
- Use `Dialog` + `Textarea` for Warn/Ban reason entry.
- Use `toast` for action results.
- Disable `Kick` when `selected.online` is false.
- When `liveAction?.ok === false`, toast with `Ban recorded, live disconnect failed` or `Kick recorded, live disconnect failed` using the returned error as description.
- Keep text inside controls short enough for mobile: `Kick`, `Warn`, `Ban`.
- Do not add an Admin tab or any map/entity/report placeholders.

- [ ] **Step 6: Run view tests and typecheck**

Run:

```bash
cd /opt/slutvival/slutvival-panel
npm test -- src/lib/gta-players-view.test.ts
npm run typecheck
```

Expected: tests PASS and typecheck exits 0.

---

## Task 5: Full Verification And Local Runtime Check

**Files:**
- No new files unless a verification failure requires a fix.

- [ ] **Step 1: Run targeted test suite**

Run:

```bash
cd /opt/slutvival/slutvival-panel
npm test -- \
  src/lib/server/gta/players.test.ts \
  src/lib/server/gta/server-data.test.ts \
  src/app/api/instances/[id]/gta/players/route.test.ts \
  src/app/api/instances/[id]/gta/players/action/route.test.ts \
  src/app/api/instances/[id]/gta/bridge/route.test.ts \
  src/lib/gta-players-view.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run broader checks**

Run:

```bash
cd /opt/slutvival/slutvival-panel
npm run test
npm run typecheck
npm run build
```

Expected: PASS.

- [ ] **Step 3: Regenerate GTA server data**

Use the panel app flow or a focused Node invocation during container start. After the server data generator has run, verify files:

```bash
test -f /opt/slutvival/games/gta/los-santos/server-data/resources/[slutvival]/slutvival-admin/fxmanifest.lua
test -f /opt/slutvival/games/gta/los-santos/server-data/resources/[slutvival]/slutvival-admin/server.lua
grep -n 'ensure slutvival-admin' /opt/slutvival/games/gta/los-santos/server-data/server.cfg
grep -n 'slutvival_bridge_token' /opt/slutvival/games/gta/los-santos/server-data/server.secret.cfg
```

Expected: all commands exit 0. Do not print the token value in final output.

- [ ] **Step 4: Rebuild/restart panel if needed**

Run:

```bash
cd /opt/slutvival/docker/stacks/slutvival-panel
docker compose up -d --build
docker ps --filter name=slutvival-panel --format 'table {{.Names}}\t{{.Status}}'
```

Expected: `slutvival-panel` is running.

- [ ] **Step 5: Restart GTA server to load the resource**

Run:

```bash
docker restart gta-los-santos
sleep 8
docker logs --tail 120 gta-los-santos
```

Expected: logs include `slutvival-admin` starting and no bridge token leak.

- [ ] **Step 6: Smoke-test the bridge endpoint without exposing secrets**

Use the actual token only in an environment variable and do not echo it:

```bash
TOKEN="$(awk '/slutvival_bridge_token/ {gsub(/"/, "", $3); print $3}' /opt/slutvival/games/gta/los-santos/server-data/server.secret.cfg)"
curl -fsS -X POST http://127.0.0.1:3000/api/instances/los-santos/gta/bridge \
  -H 'Content-Type: application/json' \
  -d "{\"type\":\"heartbeat\",\"serverToken\":\"$TOKEN\",\"players\":[]}" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const j=JSON.parse(s); if (!j.ok) process.exit(1); console.log("bridge ok")})'
unset TOKEN
```

Expected:

```text
bridge ok
```

- [ ] **Step 7: Browser/UI verification**

Open the panel and check:

- `/gta/los-santos/players` loads.
- The GTA layout tabs show `Players` between `Console` and `Files`.
- Empty state appears if no players have connected since install.
- Search/filter controls do not shift layout on desktop or mobile widths.
- Selected-player panel shows a stable empty state when the list is empty.

If a GTA client is available, complete the live checks:

- Join the server and confirm the player appears online.
- Disconnect and confirm the player becomes offline.
- Kick an online player from the panel.
- Warn an offline player and confirm the record appears.
- Ban a player and confirm reconnect is rejected.

- [ ] **Step 8: Final status**

Before reporting completion, run:

```bash
cd /opt/slutvival/slutvival-panel
git status --short
```

Report:

- Files changed for GTA Players.
- Any pre-existing dirty files still present.
- Exact tests/build commands run.
- Any manual verification that could not be completed, especially live join/ban if no GTA client was available.
