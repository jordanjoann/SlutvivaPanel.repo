# GTA / FiveM Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an owner-only GTA / FiveM management path that can create and run vanilla FXServer instances from the panel.

**Architecture:** Split the existing Vintage Story assumptions at the game path, store, provisioning, and Docker-preflight seams. Keep the Docker runtime as the shared control plane while game-specific helpers provide commands, mounts, install checks, config seeding, and secret validation.

**Tech Stack:** Next.js App Router, React, TypeScript, Vitest, Dockerode, YAML, FXServer Linux artifacts, Cfx.re `cfx-server-data`.

---

## Scope Check

The approved spec covers one cohesive subsystem: owner-only GTA/FiveM server bootstrap. It touches access control, game-aware storage, provisioning, Docker runtime startup, UI, and deployment verification, but each task below produces working, testable progress without requiring an unrelated subsystem.

## File Structure

- Modify `src/lib/types.ts`: add `fxserver` to `ServerEngine`.
- Modify `src/lib/games.ts`: mark GTA available.
- Modify `src/lib/nav.ts`: mark GTA available and remove the "Soon" badge.
- Modify `src/lib/access.test.ts`: lock owner-only GTA behavior.
- Modify `src/app/(panel)/gta/page.tsx`: replace coming-soon with owner GTA instance list.
- Create `src/components/gta/create-gta-server-dialog.tsx`: small owner create dialog for GTA.
- Modify `src/components/vintage-story/instance-card.tsx`: add `baseHref` prop so the card can link to `/gta/<id>` without duplicating the whole card.
- Modify `src/lib/server/config.ts`: add game-aware root/path helpers while preserving Vintage Story helper names.
- Modify `src/lib/server/store.ts`: read and create instances across known game roots.
- Add `src/lib/server/store.test.ts`: game-aware create/list/get coverage.
- Modify `src/lib/server/provisioning.ts`: branch commands, mounts, compose, env, install markers, and Docker image defaults by game.
- Modify `src/lib/server/provisioning.test.ts`: GTA compose and Vintage Story regression tests.
- Create `src/lib/server/gta/artifacts.ts`: resolve and install recommended FXServer Linux artifacts.
- Create `src/lib/server/gta/artifacts.test.ts`: artifact parser and install-marker tests.
- Create `src/lib/server/gta/server-data.ts`: seed `server.cfg`, secret placeholder, and `cfx-server-data` resources.
- Create `src/lib/server/gta/server-data.test.ts`: config, secret validation, and placeholder tests.
- Create `src/lib/server/gta/base-image.ts`: build `slutvival/fxserver-base:bookworm` when missing.
- Create `src/lib/server/gta/base-image.test.ts`: fake Dockerode build behavior tests.
- Create `docker/fxserver-base/Dockerfile`: local FXServer base image.
- Modify `Dockerfile`: add `git` and `xz` runtime packages to the panel container.
- Modify `src/lib/server/runtimes/docker.ts`: call game-aware preflight and base-image build, and include game label/ports.
- Modify `src/lib/server/runtimes/docker.test.ts`: GTA port binding coverage.
- Modify `src/app/api/instances/[id]/command/route.ts`: add session and game access checks.
- Modify `src/app/api/instances/[id]/files/route.ts`: add session and game access checks for every method.
- Add `src/app/api/instances/[id]/command/route.test.ts`: handler-level owner-only command coverage.
- Add `src/app/api/instances/[id]/files/route.test.ts`: handler-level owner-only files coverage.
- Create `src/app/(panel)/gta/[id]/layout.tsx`: GTA instance header and tabs.
- Create `src/app/(panel)/gta/[id]/page.tsx`: overview cards.
- Create `src/app/(panel)/gta/[id]/console/page.tsx`: existing console view.
- Create `src/app/(panel)/gta/[id]/files/page.tsx`: existing file manager.
- Create `src/app/(panel)/gta/[id]/settings/page.tsx`: basic instance edits.
- Create `src/app/(panel)/gta/[id]/danger/page.tsx`: delete server.
- Modify outer repo `.gitignore` before runtime verification: ignore `games/**/server-data/`.

---

### Task 1: Owner-Only GTA Availability

**Files:**
- Modify: `src/lib/access.test.ts`
- Modify: `src/lib/games.ts`
- Modify: `src/lib/nav.ts`

- [ ] **Step 1: Write the failing access and nav tests**

Add this test to `src/lib/access.test.ts` after the existing nav test:

```ts
  it("keeps GTA owner-only while showing it as available to owners", () => {
    expect(canAccessPagePath("owner", "/gta")).toBe(true);
    expect(canAccessApiPath("owner", "/api/instances")).toBe(true);
    expect(canAccessInstanceGame("owner", "gta")).toBe(true);

    for (const role of ["admin", "moderator", "viewer"] as const) {
      expect(canAccessPagePath(role, "/gta")).toBe(false);
      expect(canAccessInstanceGame(role, "gta")).toBe(false);
      expect(visibleNavForRole(role).flatMap((group) => group.items.map((item) => item.href))).not.toContain(
        "/gta",
      );
    }

    const ownerGtaItem = visibleNavForRole("owner")
      .flatMap((group) => group.items)
      .find((item) => item.href === "/gta");
    expect(ownerGtaItem).toMatchObject({ available: true });
    expect(ownerGtaItem?.badge).toBeUndefined();
  });
```

- [ ] **Step 2: Run the access test and verify it fails**

Run:

```bash
npx -y node@22 node_modules/vitest/vitest.mjs run src/lib/access.test.ts
```

Expected: FAIL because the owner GTA nav item still has `badge: "Soon"` and no `available: true`.

- [ ] **Step 3: Mark GTA available**

In `src/lib/games.ts`, change the GTA entry to:

```ts
  gta: {
    id: "gta",
    name: "GTA / FiveM",
    tagline: "Roleplay and racing servers on FiveM.",
    available: true,
    accent: "#e6b566",
  },
```

In `src/lib/nav.ts`, change the GTA nav item to:

```ts
      { label: "GTA / FiveM", href: "/gta", icon: Car, available: true },
```

- [ ] **Step 4: Run the access test and verify it passes**

Run:

```bash
npx -y node@22 node_modules/vitest/vitest.mjs run src/lib/access.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/access.test.ts src/lib/games.ts src/lib/nav.ts
git commit -m "feat: make GTA owner-only available"
```

---

### Task 2: Game-Aware Instance Paths And Store

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/server/config.ts`
- Modify: `src/lib/server/store.ts`
- Add: `src/lib/server/store.test.ts`

- [ ] **Step 1: Write failing store tests**

Create `src/lib/server/store.test.ts`:

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let root = "";

async function loadStore() {
  vi.resetModules();
  vi.stubEnv("SLUTVIVAL_ROOT", root);
  return import("./store");
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "slutvival-store-"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(root, { recursive: true, force: true });
});

describe("game-aware instance store", () => {
  it("creates GTA instances under the GTA root with FXServer defaults", async () => {
    const { createInstance, listInstances, getInstance } = await loadStore();

    const created = await createInstance({ name: "Los Santos", game: "gta" });

    expect(created).toMatchObject({
      game: "gta",
      version: "recommended",
      port: 30120,
      runtime: "docker",
      serverEngine: "fxserver",
      maxPlayers: 48,
      docker: {
        containerName: `gta-${created.id}`,
        image: "slutvival/fxserver-base:bookworm",
        network: "slutvival-net",
      },
      resources: { memoryLimitMB: 4096, cpuLimit: 2 },
    });
    expect(created.dataPath).toBe(path.join(root, "games", "gta", created.id, "server-data"));

    await expect(fs.stat(path.join(root, "games", "gta", created.id, "server.yml"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(root, "games", "gta", created.id, "server-data", "server.cfg"))).resolves.toBeTruthy();

    expect(await listInstances("gta")).toHaveLength(1);
    expect(await listInstances("vintage-story")).toHaveLength(0);
    expect((await getInstance(created.id))?.game).toBe("gta");
  });

  it("preserves Vintage Story defaults under the Vintage Story root", async () => {
    const { createInstance } = await loadStore();

    const created = await createInstance({ name: "Hub", game: "vintage-story" });

    expect(created).toMatchObject({
      game: "vintage-story",
      port: 42420,
      serverEngine: "stratum",
      maxPlayers: 16,
      docker: { containerName: `vs-${created.id}` },
    });
    expect(created.dataPath).toBe(path.join(root, "games", "vintage-story", created.id, "vintage"));
  });
});
```

- [ ] **Step 2: Run the store tests and verify they fail**

Run:

```bash
npx -y node@22 node_modules/vitest/vitest.mjs run src/lib/server/store.test.ts
```

Expected: FAIL because `fxserver` is not a valid `ServerEngine`, store paths are Vintage Story-only, and GTA defaults do not exist.

- [ ] **Step 3: Add game-aware path helpers**

In `src/lib/types.ts`, change:

```ts
export type ServerEngine = "stratum" | "vanilla";
```

to:

```ts
export type ServerEngine = "stratum" | "vanilla" | "fxserver";
```

In `src/lib/server/config.ts`, add imports and helpers while preserving the existing Vintage Story helper functions:

```ts
import type { GameId } from "@/lib/types";
```

Add after `config`:

```ts
export const MANAGED_GAMES: GameId[] = ["vintage-story", "gta"];

export function gameRoot(game: GameId): string {
  switch (game) {
    case "vintage-story":
      return config.vintageStoryRoot;
    case "gta":
      return path.join(config.gamesRoot, "gta");
    default:
      return path.join(config.gamesRoot, game);
  }
}

export function instanceDirForGame(game: GameId, serverId: string): string {
  return path.join(gameRoot(game), serverId);
}

export function instanceDataPathForGame(game: GameId, serverId: string): string {
  if (game === "gta") return path.join(instanceDirForGame(game, serverId), "server-data");
  return path.join(instanceDirForGame(game, serverId), "vintage");
}

export function instanceServerPathForGame(game: GameId, serverId: string): string {
  return path.join(instanceDirForGame(game, serverId), "server");
}

export function serverYmlPathForGame(game: GameId, serverId: string): string {
  return path.join(instanceDirForGame(game, serverId), "server.yml");
}
```

Then update existing helpers to delegate:

```ts
export function instanceDir(serverId: string): string {
  return instanceDirForGame("vintage-story", serverId);
}

export function instanceDataPath(serverId: string): string {
  return instanceDataPathForGame("vintage-story", serverId);
}

export function instanceServerPath(serverId: string): string {
  return instanceServerPathForGame("vintage-story", serverId);
}

export function serverYmlPath(serverId: string): string {
  return serverYmlPathForGame("vintage-story", serverId);
}
```

Add:

```ts
export const GTA_DATA_SUBDIRS = ["resources", "cache", "txData"] as const;
```

- [ ] **Step 4: Make store defaults game-aware**

In `src/lib/server/store.ts`, import the new helpers:

```ts
import {
  config,
  gameRoot,
  instanceDataPathForGame,
  instanceDirForGame,
  instanceServerPathForGame,
  MANAGED_GAMES,
  serverYmlPathForGame,
  vsPaths,
  VS_DATA_SUBDIRS,
  GTA_DATA_SUBDIRS,
} from "./config";
```

Add helper functions near defaults:

```ts
function defaultPortForGame(game: GameId): number {
  return game === "gta" ? 30120 : 42420;
}

function defaultVersionForGame(game: GameId): string {
  return game === "gta" ? "recommended" : DEFAULT_VINTAGE_STORY_VERSION;
}

function defaultEngineForGame(game: GameId): Instance["serverEngine"] {
  return game === "gta" ? "fxserver" : "stratum";
}

function defaultDockerForGame(game: GameId, id: string): Instance["docker"] {
  if (game === "gta") {
    return {
      containerName: `gta-${id}`,
      image: "slutvival/fxserver-base:bookworm",
      network: config.docker.network,
    };
  }
  return {
    containerName: `vs-${id}`,
    image: config.docker.image,
    network: config.docker.network,
  };
}

function defaultResourcesForGame(game: GameId): Instance["resources"] {
  return game === "gta" ? { memoryLimitMB: 4096, cpuLimit: 2 } : { memoryLimitMB: 4096, cpuLimit: 2 };
}

function defaultMaxPlayersForGame(game: GameId): number {
  return game === "gta" ? 48 : 16;
}
```

Update `withDefaults` to derive `game` first and use those helpers:

```ts
function withDefaults(partial: Partial<Instance> & { id: string; name: string }): Instance {
  const id = partial.id;
  const game = partial.game ?? "vintage-story";
  const now = Date.now();
  const development =
    partial.development ??
    (partial.group === "Development" || id === "development");
  const docker = partial.docker ?? defaultDockerForGame(game, id);
  return {
    id,
    name: partial.name,
    game,
    description: partial.description ?? "",
    group: partial.group ?? (development ? "Development" : "Servers"),
    development,
    version: partial.version ?? defaultVersionForGame(game),
    port: partial.port ?? defaultPortForGame(game),
    dataPath: partial.dataPath ?? instanceDataPathForGame(game, id),
    runtime: normalizeRuntime(partial.runtime),
    serverEngine: partial.serverEngine ?? defaultEngineForGame(game),
    docker: {
      containerName: docker.containerName ?? defaultDockerForGame(game, id).containerName,
      image: normalizeDockerImage(docker.image),
      network: docker.network ?? config.docker.network,
    },
    resources: partial.resources ?? defaultResourcesForGame(game),
    motd: partial.motd ?? "Welcome to the server!",
    worldName: partial.worldName ?? (game === "gta" ? "Los Santos" : "New World"),
    seed: partial.seed ?? "",
    maxPlayers: partial.maxPlayers ?? defaultMaxPlayersForGame(game),
    passwordProtected: partial.passwordProtected ?? false,
    publicAdvertised: partial.publicAdvertised ?? false,
    autoRestart: partial.autoRestart ?? false,
    autoBackup: partial.autoBackup ?? game !== "gta",
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}
```

Replace `readInstance(id)` with:

```ts
async function readInstance(game: GameId, id: string): Promise<Instance | null> {
  const file = serverYmlPathForGame(game, id);
  if (!existsSync(file)) return null;
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = (YAML.parse(raw) ?? {}) as Partial<Instance>;
    const inst = withDefaults({ ...parsed, game, id, name: parsed.name ?? id });
    return refreshLegacyInstance(inst, parsed);
  } catch {
    return null;
  }
}
```

Update `writeInstance`:

```ts
async function writeInstance(inst: Instance): Promise<void> {
  await fs.mkdir(instanceDirForGame(inst.game, inst.id), { recursive: true });
  const yml = YAML.stringify(inst);
  await fs.writeFile(serverYmlPathForGame(inst.game, inst.id), yml, "utf8");
}
```

Update `ensureInstanceDirs` to accept an instance:

```ts
export async function ensureInstanceDirs(inst: Instance): Promise<void> {
  const dir = instanceDirForGame(inst.game, inst.id);
  await fs.mkdir(dir, { recursive: true });
  const data = instanceDataPathForGame(inst.game, inst.id);
  await fs.mkdir(data, { recursive: true });
  const subdirs = inst.game === "gta" ? GTA_DATA_SUBDIRS : VS_DATA_SUBDIRS;
  for (const sub of subdirs) {
    await fs.mkdir(path.join(data, sub), { recursive: true });
  }
  await fs.mkdir(instanceServerPathForGame(inst.game, inst.id), { recursive: true });
}
```

Update initialization and public API:

```ts
async function initializeIfNeeded(): Promise<void> {
  if (seeded) return;
  seeded = true;
  await Promise.all(MANAGED_GAMES.map((game) => fs.mkdir(gameRoot(game), { recursive: true })));
}

export async function listInstances(game?: GameId): Promise<Instance[]> {
  await initializeIfNeeded();
  const games = game ? [game] : MANAGED_GAMES;
  const out: Instance[] = [];
  for (const currentGame of games) {
    const dirs = await fs.readdir(gameRoot(currentGame)).catch(() => []);
    for (const id of dirs) {
      const inst = await readInstance(currentGame, id);
      if (inst && (!game || inst.game === game)) out.push(inst);
    }
  }
  out.sort((a, b) => a.createdAt - b.createdAt);
  return out;
}

export async function getInstance(id: string): Promise<Instance | null> {
  await initializeIfNeeded();
  const matches = (await Promise.all(MANAGED_GAMES.map((game) => readInstance(game, id)))).filter(
    (inst): inst is Instance => Boolean(inst),
  );
  if (matches.length > 1) throw new Error(`Duplicate server id '${id}' exists in multiple game roots`);
  return matches[0] ?? null;
}
```

Update `createInstance` to use the game:

```ts
export async function createInstance(
  input: CreateInstanceInput,
): Promise<Instance> {
  await initializeIfNeeded();
  const game = input.game ?? "vintage-story";
  const id = input.id ?? slugId(input.name);
  if (await getInstance(id)) throw new Error(`Server '${id}' already exists`);
  const used = await listInstances(game);
  const basePort = defaultPortForGame(game);
  const port =
    input.port ?? Math.max(basePort - 1, ...used.map((i) => i.port)) + 1;
  const inst = withDefaults({
    ...input,
    game,
    id,
    port,
    autoRestart: false,
    dataPath: instanceDataPathForGame(game, id),
    docker: defaultDockerForGame(game, id),
  });
  await ensureInstanceDirs(inst);
  await writeInstance(inst);
  await ensureInstanceDockerFiles(inst);
  await seedInstanceContent(inst, input);
  return inst;
}
```

Update `deleteInstance`:

```ts
export async function deleteInstance(id: string): Promise<boolean> {
  const inst = await getInstance(id);
  if (!inst) return false;
  const dir = instanceDirForGame(inst.game, inst.id);
  await fs.rm(dir, { recursive: true, force: true });
  return true;
}
```

Update `updateInstance` to call `readInstance(current.game, id)` internally or use `getInstance(id)` for the current instance.

- [ ] **Step 5: Run store tests**

Run:

```bash
npx -y node@22 node_modules/vitest/vitest.mjs run src/lib/server/store.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run existing provisioning tests**

Run:

```bash
npx -y node@22 node_modules/vitest/vitest.mjs run src/lib/server/provisioning.test.ts
```

Expected: PASS. If it fails because `normalizeDockerImage` now expects a second argument, update call sites to pass `"vintage-story"` or default the argument to `"vintage-story"`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/lib/server/config.ts src/lib/server/store.ts src/lib/server/store.test.ts
git commit -m "feat: add game-aware instance store"
```

---

### Task 3: GTA Provisioning And Compose Generation

**Files:**
- Modify: `src/lib/server/provisioning.ts`
- Modify: `src/lib/server/provisioning.test.ts`
- Modify: `src/lib/server/runtimes/docker.test.ts`

- [ ] **Step 1: Write failing provisioning tests**

Add this helper and tests to `src/lib/server/provisioning.test.ts`:

```ts
function gtaInstance(): Instance {
  return {
    id: "los-santos",
    name: "Los Santos",
    game: "gta",
    development: false,
    version: "recommended",
    port: 30120,
    dataPath: "/opt/slutvival/games/gta/los-santos/server-data",
    runtime: "docker",
    serverEngine: "fxserver",
    docker: { containerName: "gta-los-santos", image: "slutvival/fxserver-base:bookworm", network: "slutvival-net" },
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
```

Add tests:

```ts
  it("uses the FXServer command for GTA instances", () => {
    expect(dockerCommand(gtaInstance())).toEqual(["bash", "/server/run.sh", "+exec", "server.cfg"]);
  });

  it("mounts GTA server artifacts read-only and server-data read-write", () => {
    expect(dockerMounts(gtaInstance())).toEqual([
      "/opt/slutvival/games/gta/los-santos/server:/server:ro",
      "/opt/slutvival/games/gta/los-santos/server-data:/server-data:rw",
    ]);
  });

  it("generates GTA compose without txAdmin exposure by default", () => {
    const compose = dockerCompose(gtaInstance());
    expect(compose).toContain("image: slutvival/fxserver-base:bookworm");
    expect(compose).toContain("container_name: gta-los-santos");
    expect(compose).toContain('command: ["bash","/server/run.sh","+exec","server.cfg"]');
    expect(compose).toContain('"30120:30120/tcp"');
    expect(compose).toContain('"30120:30120/udp"');
    expect(compose).not.toContain("40120");
    expect(compose).toContain("      - ./server:/server:ro");
    expect(compose).toContain("      - ./server-data:/server-data:rw");
    expect(compose).toContain('      slutvival.panel.game: "gta"');
  });

  it("uses FXServer install markers for GTA", () => {
    expect(serverInstallMarkerValue(gtaInstance())).toBe("fxserver:recommended");
  });
```

Add this test to `src/lib/server/runtimes/docker.test.ts`:

```ts
  it("publishes GTA player ports and not txAdmin by default", () => {
    expect(backendPortBindings({
      ...dockerInstance("vanilla"),
      game: "gta",
      serverEngine: "fxserver",
      port: 30120,
    })).toEqual({
      "30120/tcp": [{ HostPort: "30120" }],
      "30120/udp": [{ HostPort: "30120" }],
    });
  });
```

- [ ] **Step 2: Run provisioning tests and verify they fail**

Run:

```bash
npx -y node@22 node_modules/vitest/vitest.mjs run src/lib/server/provisioning.test.ts src/lib/server/runtimes/docker.test.ts
```

Expected: FAIL because provisioning is still Vintage Story-specific.

- [ ] **Step 3: Implement game-specific provisioning branches**

In `src/lib/server/provisioning.ts`, update imports:

```ts
import type { GameId, Instance } from "@/lib/types";
import {
  config,
  instanceDataPathForGame,
  instanceDirForGame,
  instanceServerPathForGame,
} from "./config";
```

Update image normalization:

```ts
const GTA_IMAGE = "slutvival/fxserver-base:bookworm";

export function normalizeDockerImage(image?: string, game: GameId = "vintage-story"): string {
  if (game === "gta") return image || GTA_IMAGE;
  if (!image || image === LEGACY_IMAGE) return config.docker.image;
  return image;
}
```

Update command, marker, mounts, and compose:

```ts
export function dockerServiceName(inst: Instance): string {
  if (inst.game === "gta") return "fxserver";
  return inst.game === "vintage-story" ? "vintage-story" : inst.id;
}

export function dockerCommand(inst: Instance): string[] {
  if (inst.game === "gta") return ["bash", "/server/run.sh", "+exec", "server.cfg"];
  if (inst.serverEngine === "stratum") return ["./StratumServer", "--dataPath", "/data"];
  return ["dotnet", "VintagestoryServer.dll", "--dataPath", "/data"];
}

export function serverInstallMarkerValue(inst: Instance): string {
  if (inst.game === "gta") return `fxserver:${inst.version}`;
  return `${inst.serverEngine}:${inst.version}`;
}

export function dockerMounts(inst: Instance): string[] {
  if (inst.game === "gta") {
    return [
      `${instanceServerPathForGame("gta", inst.id)}:/server:ro`,
      `${instanceDataPathForGame("gta", inst.id)}:/server-data:rw`,
    ];
  }
  const serverMode = inst.serverEngine === "stratum" ? "rw" : "ro";
  return [
    `${instanceServerPathForGame("vintage-story", inst.id)}:/server:${serverMode}`,
    `${instanceDataPathForGame("vintage-story", inst.id)}:/data:rw`,
  ];
}
```

In `ensureInstanceDockerFiles`, write game-specific `.env` values:

```ts
  const env =
    inst.game === "gta"
      ? [
          `SERVER_ID=${inst.id}`,
          `SERVER_NAME=${quoteEnv(inst.name)}`,
          `FXSERVER_BUILD=${inst.version}`,
          `FXSERVER_PORT=${inst.port}`,
          `FXSERVER_IMAGE=${normalizeDockerImage(inst.docker.image, inst.game)}`,
          `FXSERVER_CONTAINER=${inst.docker.containerName}`,
          `DOCKER_NETWORK=${inst.docker.network}`,
          "",
        ]
      : [
          `SERVER_ID=${inst.id}`,
          `SERVER_NAME=${quoteEnv(inst.name)}`,
          `VINTAGE_STORY_VERSION=${inst.version}`,
          `VINTAGE_STORY_PORT=${inst.port}`,
          `VINTAGE_STORY_IMAGE=${normalizeDockerImage(inst.docker.image, inst.game)}`,
          `VINTAGE_STORY_CONTAINER=${inst.docker.containerName}`,
          `VINTAGE_STORY_NETWORK=${inst.docker.network}`,
          "",
        ];
```

Then write `env.join("\n")`.

Replace `dockerCompose(inst)` with a branch:

```ts
export function dockerCompose(inst: Instance): string {
  if (inst.game === "gta") return gtaDockerCompose(inst);
  return vintageStoryDockerCompose(inst);
}
```

Move the existing body into `vintageStoryDockerCompose(inst)` and add:

```ts
function gtaDockerCompose(inst: Instance): string {
  const service = dockerServiceName(inst);
  const image = normalizeDockerImage(inst.docker.image, inst.game);
  const cpuLimit = inst.resources.cpuLimit > 0 ? inst.resources.cpuLimit : undefined;
  const cpus = cpuLimit ? `    cpus: "${cpuLimit}"\n` : "";

  return [
    "services:",
    `  ${service}:`,
    `    image: ${image}`,
    `    container_name: ${inst.docker.containerName}`,
    "    restart: unless-stopped",
    "    working_dir: /server-data",
    `    command: ${JSON.stringify(dockerCommand(inst))}`,
    "    stdin_open: true",
    "    tty: false",
    cpus.trimEnd(),
    `    mem_limit: ${inst.resources.memoryLimitMB}m`,
    "    networks:",
    `      - ${inst.docker.network}`,
    "    ports:",
    `      - "${inst.port}:${inst.port}/tcp"`,
    `      - "${inst.port}:${inst.port}/udp"`,
    "    volumes:",
    "      - ./server:/server:ro",
    "      - ./server-data:/server-data:rw",
    "    environment:",
    `      FXSERVER_BUILD: "${inst.version}"`,
    `      FXSERVER_DATA_PATH: "/server-data"`,
    "    labels:",
    '      slutvival.panel.managed: "true"',
    `      slutvival.panel.instance: "${inst.id}"`,
    '      slutvival.panel.game: "gta"',
    "",
    "networks:",
    `  ${inst.docker.network}:`,
    "    external: true",
    "",
  ]
    .filter(Boolean)
    .join("\n");
}
```

- [ ] **Step 4: Update Docker port binding helper**

In `src/lib/server/runtimes/docker.ts`, update `backendPortBindings` so GTA publishes player ports:

```ts
export function backendPortBindings(inst: Instance): Record<string, Array<{ HostPort: string }>> {
  if (inst.game === "vintage-story" && inst.serverEngine === "stratum") return {};
  const port = String(inst.port);
  return {
    [`${port}/tcp`]: [{ HostPort: port }],
    [`${port}/udp`]: [{ HostPort: port }],
  };
}
```

- [ ] **Step 5: Run provisioning tests**

Run:

```bash
npx -y node@22 node_modules/vitest/vitest.mjs run src/lib/server/provisioning.test.ts src/lib/server/runtimes/docker.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/provisioning.ts src/lib/server/provisioning.test.ts src/lib/server/runtimes/docker.ts src/lib/server/runtimes/docker.test.ts
git commit -m "feat: add GTA Docker provisioning"
```

---

### Task 4: FXServer Artifacts, Server Data, And Secret Validation

**Files:**
- Create: `src/lib/server/gta/artifacts.ts`
- Create: `src/lib/server/gta/artifacts.test.ts`
- Create: `src/lib/server/gta/server-data.ts`
- Create: `src/lib/server/gta/server-data.test.ts`
- Modify: `src/lib/server/provisioning.ts`
- Modify: `src/lib/server/seed.ts`
- Modify: `Dockerfile`

- [ ] **Step 1: Write failing artifact tests**

Create `src/lib/server/gta/artifacts.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { parseRecommendedFxServerArtifact } from "./artifacts";

describe("FXServer artifacts", () => {
  it("parses the latest recommended Linux artifact URL", () => {
    const html = `
      <a href="25770-abcdef/">LATEST RECOMMENDED (25770)</a>
      <a href="31689-fedcba/fx.tar.xz">31689</a>
    `;

    expect(parseRecommendedFxServerArtifact(html, "https://runtime.fivem.net/artifacts/fivem/build_proot_linux/master/")).toEqual({
      build: "25770",
      url: "https://runtime.fivem.net/artifacts/fivem/build_proot_linux/master/25770-abcdef/fx.tar.xz",
    });
  });

  it("throws when the recommended artifact is missing", () => {
    expect(() => parseRecommendedFxServerArtifact("<html></html>", "https://runtime.fivem.net/artifacts/fivem/build_proot_linux/master/")).toThrow(
      "Could not find latest recommended FXServer Linux artifact",
    );
  });
});
```

- [ ] **Step 2: Write failing server-data tests**

Create `src/lib/server/gta/server-data.test.ts`:

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Instance } from "@/lib/types";

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
    dataPath: path.join(root, "games", "gta", "los-santos", "server-data"),
    runtime: "docker",
    serverEngine: "fxserver",
    docker: { containerName: "gta-los-santos", image: "slutvival/fxserver-base:bookworm", network: "slutvival-net" },
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

async function loadModule() {
  vi.resetModules();
  vi.stubEnv("SLUTVIVAL_ROOT", root);
  return import("./server-data");
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "slutvival-gta-"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(root, { recursive: true, force: true });
});

describe("GTA server data", () => {
  it("seeds server.cfg and an ignored secret placeholder", async () => {
    const { ensureGtaServerData, hasUsableGtaSecret } = await loadModule();
    const inst = instance();

    await ensureGtaServerData(inst, { cloneBaseResources: false });

    const cfg = await fs.readFile(path.join(inst.dataPath, "server.cfg"), "utf8");
    expect(cfg).toContain('endpoint_add_tcp "0.0.0.0:30120"');
    expect(cfg).toContain('endpoint_add_udp "0.0.0.0:30120"');
    expect(cfg).toContain("ensure mapmanager");
    expect(cfg).toContain('sv_hostname "Los Santos"');
    expect(cfg).toContain('sets sv_projectDesc "Private GTA test server"');
    expect(cfg).toContain("sv_maxclients 48");
    expect(cfg).toContain("exec server.secret.cfg");

    const secret = await fs.readFile(path.join(inst.dataPath, "server.secret.cfg"), "utf8");
    expect(secret).toContain("sv_licenseKey");
    expect(secret).toContain("replace-with-cfx-license-key");
    await expect(hasUsableGtaSecret(inst)).resolves.toBe(false);
  });

  it("detects a real Cfx license key", async () => {
    const { ensureGtaServerData, hasUsableGtaSecret } = await loadModule();
    const inst = instance();
    await ensureGtaServerData(inst, { cloneBaseResources: false });
    await fs.writeFile(path.join(inst.dataPath, "server.secret.cfg"), 'sv_licenseKey "cfxk_real_value"\\n', "utf8");

    await expect(hasUsableGtaSecret(inst)).resolves.toBe(true);
  });
});
```

- [ ] **Step 3: Run GTA tests and verify they fail**

Run:

```bash
npx -y node@22 node_modules/vitest/vitest.mjs run src/lib/server/gta/artifacts.test.ts src/lib/server/gta/server-data.test.ts
```

Expected: FAIL because the modules do not exist.

- [ ] **Step 4: Implement artifact parser and installer skeleton**

Create `src/lib/server/gta/artifacts.ts`:

```ts
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { Instance } from "@/lib/types";
import { instanceDirForGame, instanceServerPathForGame } from "../config";
import { serverInstallMarkerValue } from "../provisioning";

const execFileAsync = promisify(execFile);
const ARTIFACTS_URL = "https://runtime.fivem.net/artifacts/fivem/build_proot_linux/master/";
const VERSION_MARKER = ".slutvival-version";

export type FxServerArtifact = {
  build: string;
  url: string;
};

export function parseRecommendedFxServerArtifact(html: string, baseUrl = ARTIFACTS_URL): FxServerArtifact {
  const match = /href="([^"]+)"[^>]*>\s*LATEST RECOMMENDED \((\d+)\)/i.exec(html);
  if (!match) {
    throw new Error("Could not find latest recommended FXServer Linux artifact");
  }
  const href = match[1].endsWith("/") ? `${match[1]}fx.tar.xz` : match[1];
  return {
    build: match[2],
    url: new URL(href, baseUrl).toString(),
  };
}

export async function resolveRecommendedFxServerArtifact(fetchImpl: typeof fetch = fetch): Promise<FxServerArtifact> {
  const response = await fetchImpl(ARTIFACTS_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`FXServer artifact listing failed with HTTP ${response.status}`);
  return parseRecommendedFxServerArtifact(await response.text(), ARTIFACTS_URL);
}

export async function ensureFxServerInstalled(
  inst: Instance,
  options: { force?: boolean; onLog?: (message: string) => void } = {},
): Promise<void> {
  const installDir = instanceServerPathForGame("gta", inst.id);
  const markerValue = serverInstallMarkerValue(inst);
  if (!options.force && await hasInstalledVersion(installDir, markerValue)) return;

  const artifact = await resolveRecommendedFxServerArtifact();
  options.onLog?.(`[Install] Downloading FXServer ${artifact.build}.`);

  const tmpRoot = path.join(instanceDirForGame("gta", inst.id), `.fxserver-install-${Date.now()}`);
  const extractDir = path.join(tmpRoot, "server");
  const archivePath = path.join(tmpRoot, "fx.tar.xz");
  await fs.rm(tmpRoot, { recursive: true, force: true });
  await fs.mkdir(extractDir, { recursive: true });

  try {
    const response = await fetch(artifact.url, { cache: "no-store" });
    if (!response.ok) throw new Error(`FXServer download failed with HTTP ${response.status}`);
    await fs.writeFile(archivePath, Buffer.from(await response.arrayBuffer()));
    await execFileAsync("tar", ["-xf", archivePath, "-C", extractDir]);
    await validateFxServerInstall(extractDir);
    await fs.writeFile(path.join(extractDir, VERSION_MARKER), `${markerValue}\n`, "utf8");
    await fs.writeFile(
      path.join(extractDir, ".slutvival-artifact.json"),
      `${JSON.stringify({
        name: "fxserver",
        channel: inst.version,
        build: artifact.build,
        url: artifact.url,
        installedAt: new Date().toISOString(),
      }, null, 2)}\n`,
      "utf8",
    );
    await fs.rm(installDir, { recursive: true, force: true });
    await fs.rename(extractDir, installDir);
    options.onLog?.(`[Install] FXServer ${artifact.build} installed.`);
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
}

async function hasInstalledVersion(installDir: string, markerValue: string): Promise<boolean> {
  try {
    await validateFxServerInstall(installDir);
    const marker = await fs.readFile(path.join(installDir, VERSION_MARKER), "utf8");
    return marker.trim() === markerValue;
  } catch {
    return false;
  }
}

async function validateFxServerInstall(dir: string): Promise<void> {
  const run = path.join(dir, "run.sh");
  const stat = await fs.stat(run);
  if (!stat.isFile()) throw new Error("FXServer artifact did not contain run.sh");
}
```

- [ ] **Step 5: Implement GTA server-data helpers**

Create `src/lib/server/gta/server-data.ts`:

```ts
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { Instance } from "@/lib/types";

const execFileAsync = promisify(execFile);
const CFX_SERVER_DATA_REPO = "https://github.com/citizenfx/cfx-server-data.git";
const PLACEHOLDER_LICENSE = "replace-with-cfx-license-key";

export async function ensureGtaServerData(
  inst: Instance,
  options: { cloneBaseResources?: boolean } = {},
): Promise<void> {
  await fs.mkdir(inst.dataPath, { recursive: true });
  await fs.mkdir(path.join(inst.dataPath, "resources"), { recursive: true });
  await fs.mkdir(path.join(inst.dataPath, "cache"), { recursive: true });
  await fs.mkdir(path.join(inst.dataPath, "txData"), { recursive: true });

  await fs.writeFile(path.join(inst.dataPath, "server.cfg"), gtaServerConfig(inst), "utf8");
  await writeIfMissing(path.join(inst.dataPath, "server.secret.cfg"), gtaSecretTemplate());

  if (options.cloneBaseResources !== false) {
    await ensureBaseResources(inst.dataPath);
  }
}

export async function hasUsableGtaSecret(inst: Instance): Promise<boolean> {
  try {
    const raw = await fs.readFile(path.join(inst.dataPath, "server.secret.cfg"), "utf8");
    const match = /^\s*sv_licenseKey\s+"?([^"\s]+)"?/m.exec(raw);
    return Boolean(match?.[1] && match[1] !== PLACEHOLDER_LICENSE);
  } catch {
    return false;
  }
}

export function gtaServerConfig(inst: Instance): string {
  const description = inst.description?.trim() || "Slutvival FiveM server";
  return [
    `endpoint_add_tcp "0.0.0.0:${inst.port}"`,
    `endpoint_add_udp "0.0.0.0:${inst.port}"`,
    "",
    "ensure mapmanager",
    "ensure chat",
    "ensure spawnmanager",
    "ensure sessionmanager",
    "ensure basic-gamemode",
    "ensure hardcap",
    "ensure rconlog",
    "",
    "sv_scriptHookAllowed 0",
    'sets tags "slutvival,default"',
    'sets locale "en-US"',
    `sv_hostname "${escapeCfg(inst.name)}"`,
    `sets sv_projectName "${escapeCfg(inst.name)}"`,
    `sets sv_projectDesc "${escapeCfg(description)}"`,
    "set onesync on",
    `sv_maxclients ${inst.maxPlayers}`,
    "exec server.secret.cfg",
    "",
  ].join("\n");
}

export function gtaSecretTemplate(): string {
  return [
    "# Local FiveM secrets. This file must stay out of Git.",
    `sv_licenseKey "${PLACEHOLDER_LICENSE}"`,
    'set steam_webApiKey ""',
    "",
  ].join("\n");
}

async function writeIfMissing(file: string, content: string): Promise<void> {
  if (existsSync(file)) return;
  await fs.writeFile(file, content, "utf8");
}

async function ensureBaseResources(dataPath: string): Promise<void> {
  const marker = path.join(dataPath, "resources", "[system]", "mapmanager");
  if (existsSync(marker)) return;
  const tmp = path.join(dataPath, `.cfx-server-data-${Date.now()}`);
  await fs.rm(tmp, { recursive: true, force: true });
  try {
    await execFileAsync("git", ["clone", "--depth=1", CFX_SERVER_DATA_REPO, tmp]);
    await fs.cp(path.join(tmp, "resources"), path.join(dataPath, "resources"), {
      recursive: true,
      force: true,
    });
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

function escapeCfg(value: string): string {
  return value.replace(/["\\]/g, "");
}
```

- [ ] **Step 6: Wire seed/provisioning to GTA helpers**

In `src/lib/server/seed.ts`, import and branch:

```ts
import { ensureGtaServerData } from "./gta/server-data";
```

At the top of `ensureRunnableServerConfig`:

```ts
  if (inst.game === "gta") {
    await ensureGtaServerData(inst);
    return;
  }
```

At the top of `seedInstanceContent`:

```ts
  if (inst.game === "gta") {
    await ensureGtaServerData(inst, { cloneBaseResources: false });
    return;
  }
```

In `src/lib/server/provisioning.ts`, import:

```ts
import { ensureFxServerInstalled } from "./gta/artifacts";
```

At the top of `ensureServerInstalled`:

```ts
  if (inst.game === "gta") {
    await ensureFxServerInstalled(inst, options);
    await ensureInstanceDockerFiles(inst);
    return;
  }
```

- [ ] **Step 7: Add panel runtime dependencies**

In `Dockerfile`, change the runner package line:

```dockerfile
RUN apk add --no-cache tar zstd age unzip git xz
```

- [ ] **Step 8: Run GTA helper tests**

Run:

```bash
npx -y node@22 node_modules/vitest/vitest.mjs run src/lib/server/gta/artifacts.test.ts src/lib/server/gta/server-data.test.ts
```

Expected: PASS.

- [ ] **Step 9: Run store tests**

Run:

```bash
npx -y node@22 node_modules/vitest/vitest.mjs run src/lib/server/store.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add Dockerfile src/lib/server/gta src/lib/server/provisioning.ts src/lib/server/seed.ts
git commit -m "feat: add FXServer bootstrap helpers"
```

---

### Task 5: GTA Docker Runtime Preflight And Base Image

**Files:**
- Create: `docker/fxserver-base/Dockerfile`
- Create: `src/lib/server/gta/base-image.ts`
- Create: `src/lib/server/gta/base-image.test.ts`
- Modify: `src/lib/server/runtimes/docker.ts`
- Modify: `src/lib/server/runtimes/docker.test.ts`

- [ ] **Step 1: Write failing base-image tests**

Create `src/lib/server/gta/base-image.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { ensureFxServerBaseImage } from "./base-image";

describe("FXServer base image", () => {
  it("does not build when the image already exists", async () => {
    const docker = {
      getImage: vi.fn(() => ({ inspect: vi.fn().mockResolvedValue({}) })),
      buildImage: vi.fn(),
      modem: { followProgress: vi.fn() },
    };

    await ensureFxServerBaseImage(docker as never, "slutvival/fxserver-base:bookworm");

    expect(docker.buildImage).not.toHaveBeenCalled();
  });

  it("builds the local image when it is missing", async () => {
    const followProgress = vi.fn((_stream, cb: (err: Error | null) => void) => cb(null));
    const docker = {
      getImage: vi.fn(() => ({ inspect: vi.fn().mockRejectedValue({ statusCode: 404 }) })),
      buildImage: vi.fn().mockResolvedValue({}),
      modem: { followProgress },
    };

    await ensureFxServerBaseImage(docker as never, "slutvival/fxserver-base:bookworm");

    expect(docker.buildImage).toHaveBeenCalledWith(
      expect.objectContaining({ context: expect.stringContaining("docker/fxserver-base") }),
      { t: "slutvival/fxserver-base:bookworm" },
    );
    expect(followProgress).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run base-image tests and verify they fail**

Run:

```bash
npx -y node@22 node_modules/vitest/vitest.mjs run src/lib/server/gta/base-image.test.ts
```

Expected: FAIL because `base-image.ts` does not exist.

- [ ] **Step 3: Add the FXServer base image Dockerfile**

Create `docker/fxserver-base/Dockerfile`:

```dockerfile
FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    libatomic1 \
    xz-utils \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /server-data
```

- [ ] **Step 4: Implement base image builder**

Create `src/lib/server/gta/base-image.ts`:

```ts
import path from "node:path";
import type Docker from "dockerode";

export async function ensureFxServerBaseImage(
  docker: Pick<Docker, "getImage" | "buildImage" | "modem">,
  image: string,
  onLog?: (message: string) => void,
): Promise<void> {
  try {
    await docker.getImage(image).inspect();
    return;
  } catch (error) {
    if (!isDockerNotFound(error)) throw error;
  }

  onLog?.(`[Install] Building Docker image ${image}.`);
  const context = path.join(process.cwd(), "docker", "fxserver-base");
  const stream = await docker.buildImage({ context, src: ["Dockerfile"] }, { t: image });
  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(stream, (err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function isDockerNotFound(error: unknown): error is { statusCode: 404 } {
  return typeof error === "object" && error !== null && (error as { statusCode?: number }).statusCode === 404;
}
```

- [ ] **Step 5: Add GTA preflight to Docker runtime**

In `src/lib/server/runtimes/docker.ts`, import:

```ts
import { ensureFxServerBaseImage } from "../gta/base-image";
import { hasUsableGtaSecret } from "../gta/server-data";
```

At the top of `ensureContainer`, after `ensureRunnableServerConfig(this.instance);` and `ensureServerInstalled(...)`, add:

```ts
    if (this.instance.game === "gta" && !(await hasUsableGtaSecret(this.instance))) {
      consoleBus.push(
        this.instance.id,
        "GTA setup incomplete: add a real Cfx.re sv_licenseKey to server-data/server.secret.cfg.",
        "system",
        "error",
      );
      throw new Error("GTA setup incomplete: missing Cfx.re sv_licenseKey");
    }
```

In `ensureImage`, before pulling:

```ts
    if (this.instance.game === "gta") {
      await ensureFxServerBaseImage(docker(), this.image(), (message) =>
        consoleBus.push(this.instance.id, message, "system"),
      );
      return;
    }
```

In the `createContainer` call, use game-aware working dir, exposed ports, env, and labels:

```ts
      WorkingDir: this.instance.game === "gta" ? "/server-data" : "/server",
      Cmd: dockerCommand(this.instance),
      ExposedPorts: {
        [`${port}/tcp`]: {},
        [`${port}/udp`]: {},
      },
      Env: this.instance.game === "gta"
        ? [`FXSERVER_BUILD=${this.instance.version}`, "FXSERVER_DATA_PATH=/server-data"]
        : [`VINTAGE_STORY_SERVER_VERSION=${this.instance.version}`, "VINTAGE_STORY_DATA_PATH=/data"],
      Labels: {
        "slutvival.panel.managed": "true",
        "slutvival.panel.instance": this.instance.id,
        "slutvival.panel.game": this.instance.game,
      },
```

- [ ] **Step 6: Run base image and Docker tests**

Run:

```bash
npx -y node@22 node_modules/vitest/vitest.mjs run src/lib/server/gta/base-image.test.ts src/lib/server/runtimes/docker.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add docker/fxserver-base/Dockerfile src/lib/server/gta/base-image.ts src/lib/server/gta/base-image.test.ts src/lib/server/runtimes/docker.ts src/lib/server/runtimes/docker.test.ts
git commit -m "feat: prepare GTA Docker runtime"
```

---

### Task 6: Handler-Level Owner Checks For Generic Routes

**Files:**
- Modify: `src/app/api/instances/[id]/command/route.ts`
- Modify: `src/app/api/instances/[id]/files/route.ts`
- Add: `src/app/api/instances/[id]/command/route.test.ts`
- Add: `src/app/api/instances/[id]/files/route.test.ts`

- [ ] **Step 1: Write failing command route tests**

Create `src/app/api/instances/[id]/command/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const command = vi.fn();
const getSessionAccount = vi.fn();
const getInstance = vi.fn();

vi.mock("@/lib/server/supervisor", () => ({
  supervisor: { command },
}));

vi.mock("@/lib/server/auth", () => ({
  getSessionAccount,
}));

vi.mock("@/lib/server/store", () => ({
  getInstance,
}));

function params(id = "los-santos") {
  return { params: Promise.resolve({ id }) };
}

function gtaInstance() {
  return {
    id: "los-santos",
    name: "Los Santos",
    game: "gta",
  };
}

describe("command route access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInstance.mockResolvedValue(gtaInstance());
  });

  it("rejects non-owner GTA commands", async () => {
    getSessionAccount.mockResolvedValue({ account: { role: "admin" } });
    const { POST } = await import("./route");

    const response = await POST(new Request("http://panel/api/instances/los-santos/command", {
      method: "POST",
      body: JSON.stringify({ command: "status" }),
    }), params());

    expect(response.status).toBe(403);
    expect(command).not.toHaveBeenCalled();
  });

  it("allows owner GTA commands", async () => {
    getSessionAccount.mockResolvedValue({ account: { role: "owner" } });
    const { POST } = await import("./route");

    const response = await POST(new Request("http://panel/api/instances/los-santos/command", {
      method: "POST",
      body: JSON.stringify({ command: "status" }),
    }), params());

    expect(response.status).toBe(200);
    expect(command).toHaveBeenCalledWith(expect.objectContaining({ game: "gta" }), "status");
  });
});
```

- [ ] **Step 2: Write failing files route tests**

Create `src/app/api/instances/[id]/files/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionAccount = vi.fn();
const getInstance = vi.fn();
const listDir = vi.fn();

vi.mock("@/lib/server/auth", () => ({
  getSessionAccount,
}));

vi.mock("@/lib/server/store", () => ({
  getInstance,
}));

vi.mock("@/lib/server/files", () => ({
  listDir,
  mkdirp: vi.fn(),
  createFile: vi.fn(),
  rename: vi.fn(),
  remove: vi.fn(),
}));

function params(id = "los-santos") {
  return { params: Promise.resolve({ id }) };
}

describe("files route access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getInstance.mockResolvedValue({ id: "los-santos", name: "Los Santos", game: "gta" });
    listDir.mockResolvedValue([]);
  });

  it("rejects non-owner GTA file reads", async () => {
    getSessionAccount.mockResolvedValue({ account: { role: "moderator" } });
    const { GET } = await import("./route");

    const response = await GET(new Request("http://panel/api/instances/los-santos/files"), params());

    expect(response.status).toBe(403);
    expect(listDir).not.toHaveBeenCalled();
  });

  it("allows owner GTA file reads", async () => {
    getSessionAccount.mockResolvedValue({ account: { role: "owner" } });
    const { GET } = await import("./route");

    const response = await GET(new Request("http://panel/api/instances/los-santos/files"), params());

    expect(response.status).toBe(200);
    expect(listDir).toHaveBeenCalledWith("los-santos", "");
  });
});
```

- [ ] **Step 3: Run route tests and verify they fail**

Run:

```bash
npx -y node@22 node_modules/vitest/vitest.mjs run 'src/app/api/instances/[id]/command/route.test.ts' 'src/app/api/instances/[id]/files/route.test.ts'
```

Expected: FAIL because the routes do not check sessions.

- [ ] **Step 4: Add access checks to command route**

In `src/app/api/instances/[id]/command/route.ts`, import:

```ts
import { canAccessInstanceGame } from "@/lib/access-policy";
import { getSessionAccount } from "@/lib/server/auth";
import { forbidden, ok, badRequest, serverError, loadInstance, unauthorized } from "@/lib/server/http";
```

At the top of `POST`:

```ts
    const session = await getSessionAccount();
    if (!session) return unauthorized();
```

After `loadInstance`:

```ts
    if (!canAccessInstanceGame(session.account.role, res.instance.game)) return forbidden();
```

- [ ] **Step 5: Add shared access helper to files route**

In `src/app/api/instances/[id]/files/route.ts`, import:

```ts
import { canAccessInstanceGame } from "@/lib/access-policy";
import { getSessionAccount } from "@/lib/server/auth";
import { forbidden, json, ok, badRequest, serverError, loadInstance, unauthorized } from "@/lib/server/http";
```

Add:

```ts
async function requireFileAccess(id: string) {
  const session = await getSessionAccount();
  if (!session) return { response: unauthorized() };
  const res = await loadInstance(id);
  if ("response" in res) return res;
  if (!canAccessInstanceGame(session.account.role, res.instance.game)) {
    return { response: forbidden() };
  }
  return { instance: res.instance };
}
```

At the start of every exported method after resolving `id`, add:

```ts
    const access = await requireFileAccess(id);
    if ("response" in access) return access.response;
```

- [ ] **Step 6: Run route tests**

Run:

```bash
npx -y node@22 node_modules/vitest/vitest.mjs run 'src/app/api/instances/[id]/command/route.test.ts' 'src/app/api/instances/[id]/files/route.test.ts'
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add 'src/app/api/instances/[id]/command/route.ts' 'src/app/api/instances/[id]/files/route.ts' 'src/app/api/instances/[id]/command/route.test.ts' 'src/app/api/instances/[id]/files/route.test.ts'
git commit -m "fix: enforce owner access on generic instance routes"
```

---

### Task 7: GTA Owner UI

**Files:**
- Modify: `src/app/(panel)/gta/page.tsx`
- Create: `src/components/gta/create-gta-server-dialog.tsx`
- Modify: `src/components/vintage-story/instance-card.tsx`
- Create: `src/app/(panel)/gta/[id]/layout.tsx`
- Create: `src/app/(panel)/gta/[id]/page.tsx`
- Create: `src/app/(panel)/gta/[id]/console/page.tsx`
- Create: `src/app/(panel)/gta/[id]/files/page.tsx`
- Create: `src/app/(panel)/gta/[id]/settings/page.tsx`
- Create: `src/app/(panel)/gta/[id]/danger/page.tsx`

- [ ] **Step 1: Make instance cards reusable**

In `src/components/vintage-story/instance-card.tsx`, change the props:

```ts
export function InstanceCard({
  instance,
  hasFullAccess,
  baseHref = "/vintage-story",
}: {
  instance: InstanceWithState;
  hasFullAccess: boolean;
  baseHref?: string;
}) {
```

Add:

```ts
  const href = `${baseHref}/${instance.id}`;
```

Replace both hard-coded links with `href`:

```tsx
      <Link href={href} className="absolute inset-0 z-0" aria-hidden="true" tabIndex={-1} />
```

and:

```tsx
          render={<Link href={href} aria-label={`Manage ${instance.name}`} />}
```

- [ ] **Step 2: Create GTA server dialog**

Create `src/components/gta/create-gta-server-dialog.tsx`:

```tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function CreateGtaServerDialog() {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [name, setName] = React.useState("Los Santos");
  const [description, setDescription] = React.useState("Private Slutvival FiveM server.");
  const [maxPlayers, setMaxPlayers] = React.useState("48");
  const router = useRouter();
  const { mutate } = useSWRConfig();

  async function submit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Enter a server name");
      return;
    }

    try {
      setBusy(true);
      const created = await api.instances.create({
        name: trimmedName,
        game: "gta",
        description: description.trim(),
        maxPlayers: Number.parseInt(maxPlayers, 10) || 48,
        resources: { memoryLimitMB: 4096, cpuLimit: 2 },
      });
      await mutate((key) => Array.isArray(key) && key[0] === "instances");
      toast.success(`Server "${created.name}" created`);
      setOpen(false);
      router.push(`/gta/${created.id}`);
    } catch (error) {
      toast.error("Failed to create GTA server", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <PlusIcon /> New Server
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New GTA / FiveM server</DialogTitle>
          <DialogDescription>
            Creates a vanilla FXServer layout. Add the Cfx.re license key before starting it.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="gta-name">Name</Label>
            <Input id="gta-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="gta-description">Description</Label>
            <Textarea id="gta-description" value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="gta-max-players">Max players</Label>
            <Input id="gta-max-players" inputMode="numeric" value={maxPlayers} onChange={(event) => setMaxPlayers(event.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Replace GTA coming-soon page**

Replace `src/app/(panel)/gta/page.tsx` with:

```tsx
"use client";

import { CarIcon, ServerIcon } from "lucide-react";
import { useInstances } from "@/hooks/use-instances";
import { PageHeader } from "@/components/panel/page-header";
import { EmptyState } from "@/components/panel/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { InstanceCard } from "@/components/vintage-story/instance-card";
import { CreateGtaServerDialog } from "@/components/gta/create-gta-server-dialog";

export default function GtaPage() {
  const { data: instances, isLoading } = useInstances("gta");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="GTA / FiveM"
        description="Manage owner-only FiveM servers, FXServer startup, console logs, and files."
        icon={CarIcon}
        actions={<CreateGtaServerDialog />}
      />

      {isLoading && !instances ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      ) : instances && instances.length === 0 ? (
        <EmptyState
          icon={ServerIcon}
          title="No GTA servers yet"
          description="Create a vanilla FXServer instance, then add the Cfx.re license key before starting it."
          action={<CreateGtaServerDialog />}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(instances ?? []).map((instance) => (
            <InstanceCard key={instance.id} instance={instance} hasFullAccess baseHref="/gta" />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create GTA instance layout**

Create `src/app/(panel)/gta/[id]/layout.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { CarIcon, ChevronLeftIcon, ClockIcon, PlugIcon } from "lucide-react";
import { useInstance } from "@/hooks/use-instances";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/panel/status-badge";
import { PowerControls } from "@/components/panel/power-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDuration } from "@/lib/format";

const TABS = [
  { key: "overview", label: "Overview", segment: "" },
  { key: "console", label: "Console", segment: "console" },
  { key: "files", label: "Files", segment: "files" },
  { key: "settings", label: "Settings", segment: "settings" },
  { key: "danger", label: "Danger Zone", segment: "danger", danger: true },
] as const;

export default function GtaServerLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const { data: instance } = useInstance(id);
  const base = `/gta/${id}`;
  const status = instance?.state.status ?? "unknown";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4">
        <Link href="/gta" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ChevronLeftIcon className="size-4" /> GTA / FiveM
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <CarIcon className="size-5" />
            </div>
            {instance ? (
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <h1 className="truncate font-heading text-xl font-semibold tracking-tight">{instance.name}</h1>
                  <StatusBadge status={status} />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-mono">FXServer {instance.version}</span>
                  <span className="inline-flex items-center gap-1.5"><PlugIcon className="size-3.5" /> Port {instance.port}</span>
                  <span className="inline-flex items-center gap-1.5"><ClockIcon className="size-3.5" /> {formatDuration(instance.state.uptimeSeconds)}</span>
                </div>
              </div>
            ) : (
              <Skeleton className="h-12 w-64" />
            )}
          </div>
          <PowerControls id={id} status={status} />
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((tab) => {
          const href = tab.segment ? `${base}/${tab.segment}` : base;
          const active = pathname === href;
          return (
            <Link
              key={tab.key}
              href={href}
              className={cn(
                "whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
                tab.danger && "text-destructive hover:text-destructive",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
```

- [ ] **Step 5: Create GTA overview page**

Create `src/app/(panel)/gta/[id]/page.tsx`:

```tsx
"use client";

import { CpuIcon, HardDriveIcon, MemoryStickIcon, PlugIcon, UsersIcon } from "lucide-react";
import { useParams } from "next/navigation";
import { useInstance } from "@/hooks/use-instances";
import { StatCard } from "@/components/panel/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMB, formatPercent } from "@/lib/format";

export default function GtaOverviewPage() {
  const { id } = useParams<{ id: string }>();
  const { data: instance } = useInstance(id);

  if (!instance) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-[104px] rounded-xl" />
        ))}
      </div>
    );
  }

  const stats = instance.state.stats;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <StatCard label="Players" value={`${instance.state.playersOnline}/${instance.maxPlayers}`} icon={UsersIcon} accent="info" />
      <StatCard label="Port" value={String(instance.port)} icon={PlugIcon} accent="primary" />
      <StatCard label="CPU" value={formatPercent(stats.cpuPercent)} icon={CpuIcon} accent="primary" progress={stats.cpuPercent} />
      <StatCard label="Memory" value={formatPercent(stats.memoryPercent)} icon={MemoryStickIcon} accent="info" progress={stats.memoryPercent} sub={`${formatMB(stats.memoryUsedMB, 0)} / ${formatMB(stats.memoryLimitMB, 0)}`} />
      <StatCard label="Disk" value={formatMB(stats.diskUsedMB, 1)} icon={HardDriveIcon} accent="warning" progress={(stats.diskUsedMB / stats.diskTotalMB) * 100} />
    </div>
  );
}
```

- [ ] **Step 6: Create GTA console and files pages**

Create `src/app/(panel)/gta/[id]/console/page.tsx`:

```tsx
"use client";

import { useParams } from "next/navigation";
import { ConsoleView } from "@/components/vintage-story/console-view";

export default function GtaConsolePage() {
  const { id } = useParams<{ id: string }>();
  return <ConsoleView id={id} />;
}
```

Create `src/app/(panel)/gta/[id]/files/page.tsx`:

```tsx
"use client";

import { useParams } from "next/navigation";
import { FolderIcon } from "lucide-react";
import { PageHeader } from "@/components/panel/page-header";
import { FileManager } from "@/components/vintage-story/file-manager";

export default function GtaFilesPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Files" description="Browse and edit FXServer data files." icon={FolderIcon} />
      <FileManager id={id} />
    </div>
  );
}
```

- [ ] **Step 7: Create GTA settings page**

Create `src/app/(panel)/gta/[id]/settings/page.tsx`:

```tsx
"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { SaveIcon, SettingsIcon } from "lucide-react";
import { api } from "@/lib/api";
import { useInstance } from "@/hooks/use-instances";
import { PageHeader } from "@/components/panel/page-header";
import { SectionCard } from "@/components/panel/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

export default function GtaSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const { data: instance, mutate } = useInstance(id);
  const [busy, setBusy] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [maxPlayers, setMaxPlayers] = React.useState("48");

  React.useEffect(() => {
    if (!instance) return;
    setName(instance.name);
    setDescription(instance.description ?? "");
    setMaxPlayers(String(instance.maxPlayers));
  }, [instance]);

  async function save() {
    if (!instance) return;
    try {
      setBusy(true);
      await api.instances.update(id, {
        name: name.trim() || instance.name,
        description: description.trim(),
        maxPlayers: Number.parseInt(maxPlayers, 10) || instance.maxPlayers,
      });
      await mutate();
      toast.success("GTA server settings saved");
    } catch (error) {
      toast.error("Failed to save settings", { description: error instanceof Error ? error.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  if (!instance) return <Skeleton className="h-64 rounded-xl" />;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Settings" description="Basic FXServer metadata surfaced in server.cfg." icon={SettingsIcon} />
      <SectionCard title="General" icon={SettingsIcon}>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="gta-settings-name">Name</Label>
            <Input id="gta-settings-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="gta-settings-description">Description</Label>
            <Textarea id="gta-settings-description" value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="gta-settings-max-players">Max players</Label>
            <Input id="gta-settings-max-players" inputMode="numeric" value={maxPlayers} onChange={(event) => setMaxPlayers(event.target.value)} />
          </div>
          <div>
            <Button onClick={save} disabled={busy}>
              <SaveIcon /> Save changes
            </Button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
```

- [ ] **Step 8: Create GTA danger page**

Create `src/app/(panel)/gta/[id]/danger/page.tsx`:

```tsx
"use client";

import { useParams, useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { toast } from "sonner";
import { Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { api } from "@/lib/api";
import { useInstance } from "@/hooks/use-instances";
import { PageHeader } from "@/components/panel/page-header";
import { useConfirm } from "@/components/panel/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function GtaDangerPage() {
  const { id } = useParams<{ id: string }>();
  const { data: instance } = useInstance(id);
  const { confirm, node } = useConfirm();
  const router = useRouter();
  const { mutate } = useSWRConfig();

  if (!instance) return <Skeleton className="h-64 rounded-xl" />;

  async function deleteServer() {
    await api.instances.remove(id);
    await mutate((key) => Array.isArray(key) && key[0] === "instances");
    toast.success(`Server "${instance?.name}" deleted`);
    router.push("/gta");
  }

  return (
    <div className="flex flex-col gap-5">
      {node}
      <PageHeader title="Danger Zone" description="Irreversible GTA server actions." icon={TriangleAlertIcon} />
      <div className="rounded-xl border border-destructive/30 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-heading text-sm font-semibold">Delete server</h2>
            <p className="text-sm text-muted-foreground">Deletes this FXServer instance and its local server-data directory.</p>
          </div>
          <Button
            variant="destructive"
            onClick={() =>
              confirm({
                title: `Delete ${instance.name}?`,
                description: "This deletes the GTA server directory from disk.",
                confirmLabel: "Delete server",
                confirmPhrase: instance.name,
                destructive: true,
                onConfirm: deleteServer,
              })
            }
          >
            <Trash2Icon /> Delete server
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add 'src/app/(panel)/gta' src/components/gta src/components/vintage-story/instance-card.tsx
git commit -m "feat: add owner GTA panel views"
```

---

### Task 8: Verification, Build, And Runtime Smoke

**Files:**
- Modify: `/opt/slutvival/.gitignore`
- No panel code changes unless verification catches a defect.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npx -y node@22 node_modules/vitest/vitest.mjs run \
  src/lib/access.test.ts \
  src/lib/server/store.test.ts \
  src/lib/server/provisioning.test.ts \
  src/lib/server/runtimes/docker.test.ts \
  src/lib/server/gta/artifacts.test.ts \
  src/lib/server/gta/server-data.test.ts \
  src/lib/server/gta/base-image.test.ts \
  'src/app/api/instances/[id]/command/route.test.ts' \
  'src/app/api/instances/[id]/files/route.test.ts'
```

Expected: all listed test files PASS.

- [ ] **Step 2: Run full test suite**

Run:

```bash
npx -y node@22 node_modules/vitest/vitest.mjs run
```

Expected: all tests PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 5: Run production build**

Run:

```bash
npx -y node@22 node_modules/next/dist/bin/next build
```

Expected: PASS. The existing Turbopack NFT trace warning may appear; no new build errors should appear.

- [ ] **Step 6: Rebuild the deployed panel container**

Run from `/opt/slutvival`:

```bash
docker compose -f docker/stacks/slutvival-panel/docker-compose.yml up -d --build
```

Expected: image builds, `slutvival-panel` is recreated, and container starts.

- [ ] **Step 7: Verify container health**

Run:

```bash
docker ps --filter name=slutvival-panel --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
docker logs --tail 80 slutvival-panel
```

Expected: `slutvival-panel` is up and Next reports ready.

- [ ] **Step 8: Ignore GTA runtime server-data before creating instances**

Run from `/opt/slutvival`:

```bash
if ! rg -q '^games/\*\*/server-data/$' .gitignore; then
  printf '\n# GTA / FiveM runtime data\ngames/**/server-data/\n' >> .gitignore
fi
git check-ignore games/gta/los-santos/server-data/server.secret.cfg
git add .gitignore
git commit -m "chore: ignore GTA server data"
```

Expected: `git check-ignore` prints `games/gta/los-santos/server-data/server.secret.cfg`, and the outer repo commit contains only `.gitignore`.

- [ ] **Step 9: Create a GTA instance from the panel or API**

Use the owner UI or run an authenticated API request from the browser session. If using API is inconvenient, use the panel UI at `/gta`.

Expected local files after create:

```text
/opt/slutvival/games/gta/<server-id>/server.yml
/opt/slutvival/games/gta/<server-id>/docker-compose.yml
/opt/slutvival/games/gta/<server-id>/.env
/opt/slutvival/games/gta/<server-id>/server-data/server.cfg
/opt/slutvival/games/gta/<server-id>/server-data/server.secret.cfg
```

- [ ] **Step 10: Check generated compose**

Run:

```bash
docker compose -f /opt/slutvival/games/gta/<server-id>/docker-compose.yml config
```

Expected: config renders; `30120` TCP/UDP is published; `40120` is absent.

- [ ] **Step 11: Verify missing-license start fails clearly**

From the panel, start the GTA instance before adding a real Cfx key.

Expected: start fails with `GTA setup incomplete: missing Cfx.re sv_licenseKey`, and no secret value is logged.

- [ ] **Step 12: Add real license key manually**

Edit:

```text
/opt/slutvival/games/gta/<server-id>/server-data/server.secret.cfg
```

Set:

```cfg
sv_licenseKey "real-cfx-license-key"
set steam_webApiKey ""
```

Do not commit this file.

- [ ] **Step 13: Start GTA server**

From the panel, start the GTA instance.

Expected: FXServer artifact installs, base Docker image builds if missing, server container starts, and console logs stream.

- [ ] **Step 14: Confirm ignored runtime files**

Run from `/opt/slutvival`:

```bash
git status --short --ignored games/gta | sed -n '1,160p'
```

Expected: runtime directories and `server.secret.cfg` are ignored. If anything sensitive appears as untracked, stop and update `/opt/slutvival/.gitignore` before committing panel code.

- [ ] **Step 15: Commit final panel changes**

Run from `/opt/slutvival/slutvival-panel`:

```bash
git status --short
git add .
git commit -m "feat: bootstrap owner-only GTA FiveM servers"
```

Expected: final feature commit includes panel code and tests only. Runtime GTA data and secrets remain untracked/ignored.
