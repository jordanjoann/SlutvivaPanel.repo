# Stratum Nimbus Network Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a panel-managed Stratum and Nimbus Vintage Story network with a dedicated creative superflat `hub` and only Nimbus publicly exposed on `play.slutvival.com:42420`.

**Architecture:** Add a focused `src/lib/server/vintage-network` module that owns release artifacts, Nimbus config, the hub bootstrap, and the Nimbus proxy container. Existing instance provisioning and Docker runtime gain server-engine awareness so Stratum backends run privately while vanilla remains available as a hidden fallback.

**Tech Stack:** Next.js 16, TypeScript, Dockerode, Vitest, Node `fs/promises`, GitHub Releases API, `unzip`, Docker bind mounts, Vintage Story server config JSON, Nimbus TOML/JSON config.

---

## Scope Check

This plan covers one deployable slice: a working panel-managed Stratum/Nimbus network. It includes artifact install, hub bootstrap, private backend networking, Nimbus proxy startup, a small API/UI surface, and verification. It does not include advanced Nimbus routing UI or player client mod distribution.

## Current Verified Release Facts

- Stratum latest release metadata checked on 2026-07-03: `v1.22.3-stratum.13`.
- Stratum Linux asset: `stratum-1.22.3-stratum.13-linux-x64.zip`.
- Stratum zip contents include a self-contained executable named `StratumServer`.
- Nimbus latest release metadata checked on 2026-07-03: `0.1.0-dev`.
- Nimbus asset: `Nimbus-v0.1.0.zip`.
- Nimbus zip contents include `release_full/Nimbus/` for the proxy and `release_full/Nimbus.ServerMod/` for the backend server mod.

## File Structure

- Modify `Dockerfile`: install `unzip` in the runner image.
- Modify `src/lib/types.ts`: add `ServerEngine` and Vintage Story network status/setup response types.
- Modify `src/lib/server/config.ts`: add tool, secret, public play domain, and Vintage network config paths.
- Create `src/lib/server/vintage-network/constants.ts`: release pins, public address helpers, hub defaults, and pure path helpers.
- Create `src/lib/server/vintage-network/constants.test.ts`: tests for pins, public address, and hub world defaults.
- Create `src/lib/server/vintage-network/artifacts.ts`: GitHub release asset selection, download, unzip extraction, validation, and install markers.
- Create `src/lib/server/vintage-network/artifacts.test.ts`: tests for asset selection and validation behavior.
- Create `src/lib/server/vintage-network/nimbus-config.ts`: shared secret management, Nimbus proxy TOML, backend JSON, runtime directory activation, and server mod install.
- Create `src/lib/server/vintage-network/nimbus-config.test.ts`: tests for generated config and mod copy layout.
- Modify `src/lib/server/provisioning.ts`: make server install and Docker command engine-aware.
- Modify `src/lib/server/store.ts`: persist `serverEngine`, default new Vintage Story instances to Stratum, and create `hub` deterministically when requested.
- Modify `src/lib/server/runtimes/docker.ts`: keep Stratum backends private, use engine-aware command/mounts, and compare containers against private-port desired state.
- Create `src/lib/server/vintage-network/docker-proxy.ts`: pure Nimbus proxy container spec builder plus Dockerode start/inspect helpers.
- Create `src/lib/server/vintage-network/docker-proxy.test.ts`: tests for public proxy port bindings and mounts.
- Create `src/lib/server/vintage-network/service.ts`: orchestration for status and setup.
- Create `src/lib/server/vintage-network/service.test.ts`: tests with injected dependencies for hub setup sequencing.
- Create `src/app/api/vintage-story/network/route.ts`: GET status and POST setup.
- Modify `src/lib/api.ts`: add typed `api.vintageStory.network`.
- Create `src/components/vintage-story/network-panel.tsx`: setup/status panel on the Vintage Story page.
- Modify `src/app/(panel)/vintage-story/page.tsx`: render the network panel above instance groups.

---

### Task 1: Add Network Types, Config, And Hub Defaults

**Files:**
- Modify: `Dockerfile`
- Modify: `src/lib/types.ts`
- Modify: `src/lib/server/config.ts`
- Create: `src/lib/server/vintage-network/constants.ts`
- Test: `src/lib/server/vintage-network/constants.test.ts`

- [ ] **Step 1: Write the failing constants test**

Create `src/lib/server/vintage-network/constants.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  HUB_INSTANCE_ID,
  NIMBUS_RELEASE_TAG,
  STRATUM_RELEASE_TAG,
  creativeSuperflatHubWorld,
  nimbusPublicAddress,
} from "./constants";

describe("vintage network constants", () => {
  it("pins the approved initial release tags", () => {
    expect(STRATUM_RELEASE_TAG).toBe("v1.22.3-stratum.13");
    expect(NIMBUS_RELEASE_TAG).toBe("0.1.0-dev");
  });

  it("returns the public Nimbus address", () => {
    expect(nimbusPublicAddress()).toBe("play.slutvival.com:42420");
  });

  it("describes the approved hub default world", () => {
    expect(HUB_INSTANCE_ID).toBe("hub");
    expect(creativeSuperflatHubWorld()).toMatchObject({
      playStyle: "creativebuilding",
      gameMode: "creative",
      worldType: "superflat",
      allowCreativeMode: true,
      whitelistMode: false,
    });
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test -- src/lib/server/vintage-network/constants.test.ts
```

Expected: FAIL because `src/lib/server/vintage-network/constants.ts` does not exist.

- [ ] **Step 3: Implement constants and config**

Create `src/lib/server/vintage-network/constants.ts`:

```ts
import path from "node:path";
import { config } from "@/lib/server/config";
import type { VintageStoryWorldGenerationConfig } from "@/lib/vintage-story-world";

export const HUB_INSTANCE_ID = "hub";
export const NIMBUS_PROXY_CONTAINER = "nimbus-proxy";
export const STRATUM_RELEASE_TAG =
  process.env.STRATUM_RELEASE_TAG ?? "v1.22.3-stratum.13";
export const STRATUM_ASSET_NAME =
  process.env.STRATUM_ASSET_NAME ??
  "stratum-1.22.3-stratum.13-linux-x64.zip";
export const NIMBUS_RELEASE_TAG =
  process.env.NIMBUS_RELEASE_TAG ?? "0.1.0-dev";
export const NIMBUS_ASSET_NAME =
  process.env.NIMBUS_ASSET_NAME ?? "Nimbus-v0.1.0.zip";

export function nimbusPublicAddress(): string {
  return `${config.vintageNetwork.publicHost}:${config.vintageNetwork.publicPort}`;
}

export function stratumInstallDir(): string {
  return path.join(config.toolsRoot, "stratum", STRATUM_RELEASE_TAG);
}

export function nimbusInstallDir(): string {
  return path.join(config.toolsRoot, "nimbus", NIMBUS_RELEASE_TAG);
}

export function nimbusRuntimeDir(): string {
  return path.join(config.toolsRoot, "nimbus", "runtime");
}

export function nimbusSecretPath(): string {
  return path.join(config.secretsRoot, "nimbus-registry.secret");
}

export function nimbusProxyConfigPath(): string {
  return path.join(nimbusRuntimeDir(), "nimbus.proxy.toml");
}

export function creativeSuperflatHubWorld(): Partial<VintageStoryWorldGenerationConfig> {
  return {
    playStyle: "creativebuilding",
    gameMode: "creative",
    worldType: "superflat",
    allowCreativeMode: true,
    creatureHostility: "off",
    temporalStorms: "off",
    temporalRifts: "off",
    deathPunishment: "keep",
    allowPvp: false,
    allowFireSpread: false,
    allowFallingBlocks: false,
    passTimeWhenEmpty: false,
    whitelistMode: false,
  };
}
```

Modify `src/lib/server/config.ts`:

```ts
export const config = {
  root: ROOT,
  gamesRoot: path.join(ROOT, "games"),
  vintageStoryRoot: path.join(ROOT, "games", "vintage-story"),
  toolsRoot: path.join(ROOT, "tools"),
  secretsRoot: path.join(ROOT, "secrets"),
```

Inside `domains`, add:

```ts
    play: process.env.PLAY_DOMAIN ?? "play.slutvival.com",
```

After `domains`, add:

```ts
  vintageNetwork: {
    publicHost: process.env.VINTAGE_NETWORK_PUBLIC_HOST ?? "play.slutvival.com",
    publicPort: Number(process.env.VINTAGE_NETWORK_PUBLIC_PORT ?? 42420),
    registryPort: Number(process.env.NIMBUS_REGISTRY_PORT ?? 8765),
  },
```

Modify `src/lib/types.ts` near `RuntimeKind`:

```ts
export type ServerEngine = "stratum" | "vanilla";
```

Add to `Instance` after `runtime`:

```ts
  serverEngine: ServerEngine;
```

Add near the shared response types:

```ts
export interface VintageStoryNetworkStatus {
  publicAddress: string;
  publicHost: string;
  publicPort: number;
  registryPort: number;
  hubExists: boolean;
  stratumInstalled: boolean;
  nimbusInstalled: boolean;
  nimbusConfigured: boolean;
  nimbusProxyRunning: boolean;
}

export interface VintageStoryNetworkSetupResult {
  ok: true;
  status: VintageStoryNetworkStatus;
}
```

Modify `Dockerfile` runner package line:

```dockerfile
RUN apk add --no-cache tar zstd age unzip
```

- [ ] **Step 4: Run the constants test**

Run:

```bash
npm test -- src/lib/server/vintage-network/constants.test.ts
```

Expected: PASS.

- [ ] **Step 5: Typecheck the new type surface**

Run:

```bash
npm run typecheck
```

Expected: FAIL because existing `Instance` construction does not yet set `serverEngine`. This failure is expected at this point and is resolved in Task 4.

- [ ] **Step 6: Commit Task 1**

Run:

```bash
git add Dockerfile src/lib/types.ts src/lib/server/config.ts src/lib/server/vintage-network/constants.ts src/lib/server/vintage-network/constants.test.ts
git commit -m "feat: add vintage network config"
```

---

### Task 2: Add Stratum And Nimbus Artifact Installer

**Files:**
- Create: `src/lib/server/vintage-network/artifacts.ts`
- Test: `src/lib/server/vintage-network/artifacts.test.ts`

- [ ] **Step 1: Write failing artifact tests**

Create `src/lib/server/vintage-network/artifacts.test.ts`:

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertNimbusInstall,
  assertStratumInstall,
  selectReleaseAsset,
  writeArtifactMarker,
} from "./artifacts";

let dir = "";

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "slutvival-artifacts-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("vintage network artifacts", () => {
  it("selects an exact release asset by name", () => {
    const asset = selectReleaseAsset(
      {
        tag_name: "v1.22.3-stratum.13",
        assets: [
          { name: "stratum-1.22.3-stratum.13-win-x64.zip", browser_download_url: "win" },
          { name: "stratum-1.22.3-stratum.13-linux-x64.zip", browser_download_url: "linux" },
        ],
      },
      "stratum-1.22.3-stratum.13-linux-x64.zip",
    );

    expect(asset.browser_download_url).toBe("linux");
  });

  it("throws when a release asset is absent", () => {
    expect(() =>
      selectReleaseAsset({ tag_name: "0.1.0-dev", assets: [] }, "Nimbus-v0.1.0.zip"),
    ).toThrow("Release 0.1.0-dev did not contain asset Nimbus-v0.1.0.zip");
  });

  it("validates the current Stratum Linux zip layout", async () => {
    await fs.writeFile(path.join(dir, "StratumServer"), "");
    await assertStratumInstall(dir);
  });

  it("validates the current Nimbus zip layout", async () => {
    await fs.mkdir(path.join(dir, "release_full", "Nimbus"), { recursive: true });
    await fs.mkdir(path.join(dir, "release_full", "Nimbus.ServerMod"), { recursive: true });
    await fs.writeFile(path.join(dir, "release_full", "Nimbus", "Nimbus.Proxy.dll"), "");
    await fs.writeFile(path.join(dir, "release_full", "Nimbus.ServerMod", "modinfo.json"), "{}");
    await assertNimbusInstall(dir);
  });

  it("writes an install marker without leaking secrets", async () => {
    await writeArtifactMarker(dir, {
      name: "stratum",
      tag: "v1.22.3-stratum.13",
      asset: "stratum-1.22.3-stratum.13-linux-x64.zip",
    });
    const marker = JSON.parse(await fs.readFile(path.join(dir, ".slutvival-artifact.json"), "utf8"));
    expect(marker).toMatchObject({
      name: "stratum",
      tag: "v1.22.3-stratum.13",
      asset: "stratum-1.22.3-stratum.13-linux-x64.zip",
    });
  });
});
```

- [ ] **Step 2: Run the failing artifact tests**

Run:

```bash
npm test -- src/lib/server/vintage-network/artifacts.test.ts
```

Expected: FAIL because `artifacts.ts` does not exist.

- [ ] **Step 3: Implement artifact helpers**

Create `src/lib/server/vintage-network/artifacts.ts` with these exports:

```ts
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import {
  NIMBUS_ASSET_NAME,
  NIMBUS_RELEASE_TAG,
  STRATUM_ASSET_NAME,
  STRATUM_RELEASE_TAG,
  nimbusInstallDir,
  stratumInstallDir,
} from "./constants";

const execFileAsync = promisify(execFile);
const MARKER = ".slutvival-artifact.json";

export type GitHubRelease = {
  tag_name: string;
  assets: Array<{ name: string; browser_download_url: string }>;
};

export type ArtifactMarker = {
  name: "stratum" | "nimbus";
  tag: string;
  asset: string;
  installedAt: number;
};

export function selectReleaseAsset(
  release: GitHubRelease,
  assetName: string,
): { name: string; browser_download_url: string } {
  const asset = release.assets.find((item) => item.name === assetName);
  if (!asset) {
    throw new Error(`Release ${release.tag_name} did not contain asset ${assetName}`);
  }
  return asset;
}

export async function writeArtifactMarker(
  dir: string,
  marker: Omit<ArtifactMarker, "installedAt">,
): Promise<void> {
  await fs.writeFile(
    path.join(dir, MARKER),
    JSON.stringify({ ...marker, installedAt: Date.now() }, null, 2),
    "utf8",
  );
}

export async function readArtifactMarker(dir: string): Promise<ArtifactMarker | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(dir, MARKER), "utf8")) as ArtifactMarker;
  } catch {
    return null;
  }
}

export async function assertStratumInstall(dir: string): Promise<void> {
  const binary = path.join(dir, "StratumServer");
  if (!existsSync(binary)) throw new Error("Stratum install is missing StratumServer");
  await fs.chmod(binary, 0o755);
}

export async function assertNimbusInstall(dir: string): Promise<void> {
  if (!existsSync(path.join(dir, "release_full", "Nimbus", "Nimbus.Proxy.dll"))) {
    throw new Error("Nimbus install is missing release_full/Nimbus/Nimbus.Proxy.dll");
  }
  if (!existsSync(path.join(dir, "release_full", "Nimbus.ServerMod", "modinfo.json"))) {
    throw new Error("Nimbus install is missing release_full/Nimbus.ServerMod/modinfo.json");
  }
}

export async function ensureStratumArtifact(): Promise<string> {
  return ensureGitHubZipArtifact({
    repo: "StratumServer/Stratum",
    tag: STRATUM_RELEASE_TAG,
    asset: STRATUM_ASSET_NAME,
    installDir: stratumInstallDir(),
    name: "stratum",
    validate: assertStratumInstall,
  });
}

export async function ensureNimbusArtifact(): Promise<string> {
  return ensureGitHubZipArtifact({
    repo: "StratumServer/Nimbus",
    tag: NIMBUS_RELEASE_TAG,
    asset: NIMBUS_ASSET_NAME,
    installDir: nimbusInstallDir(),
    name: "nimbus",
    validate: assertNimbusInstall,
  });
}

async function ensureGitHubZipArtifact(input: {
  repo: string;
  tag: string;
  asset: string;
  installDir: string;
  name: "stratum" | "nimbus";
  validate: (dir: string) => Promise<void>;
}): Promise<string> {
  const marker = await readArtifactMarker(input.installDir);
  if (marker?.tag === input.tag && marker.asset === input.asset) {
    await input.validate(input.installDir);
    return input.installDir;
  }

  const tmpRoot = `${input.installDir}.install-${Date.now()}`;
  const zipPath = path.join(tmpRoot, input.asset);
  const extractDir = path.join(tmpRoot, "extract");
  await fs.rm(tmpRoot, { recursive: true, force: true });
  await fs.mkdir(extractDir, { recursive: true });

  try {
    const release = await fetchRelease(input.repo, input.tag);
    const asset = selectReleaseAsset(release, input.asset);
    await downloadFile(asset.browser_download_url, zipPath);
    await execFileAsync("unzip", ["-q", zipPath, "-d", extractDir]);
    await input.validate(extractDir);
    await writeArtifactMarker(extractDir, {
      name: input.name,
      tag: input.tag,
      asset: input.asset,
    });
    await fs.rm(input.installDir, { recursive: true, force: true });
    await fs.mkdir(path.dirname(input.installDir), { recursive: true });
    await fs.rename(extractDir, input.installDir);
    return input.installDir;
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
}

async function fetchRelease(repo: string, tag: string): Promise<GitHubRelease> {
  const response = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${tag}`, {
    cache: "no-store",
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) {
    throw new Error(`GitHub release lookup failed for ${repo}@${tag}: HTTP ${response.status}`);
  }
  return (await response.json()) as GitHubRelease;
}

async function downloadFile(url: string, file: string): Promise<void> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Artifact download failed with HTTP ${response.status}`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, Buffer.from(await response.arrayBuffer()));
}
```

- [ ] **Step 4: Run artifact tests**

Run:

```bash
npm test -- src/lib/server/vintage-network/artifacts.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add src/lib/server/vintage-network/artifacts.ts src/lib/server/vintage-network/artifacts.test.ts
git commit -m "feat: install vintage network artifacts"
```

---

### Task 3: Generate Nimbus Proxy And Backend Config

**Files:**
- Create: `src/lib/server/vintage-network/nimbus-config.ts`
- Test: `src/lib/server/vintage-network/nimbus-config.test.ts`

- [ ] **Step 1: Write failing Nimbus config tests**

Create `src/lib/server/vintage-network/nimbus-config.test.ts`:

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Instance } from "@/lib/types";
import {
  backendAddress,
  backendNimbusConfig,
  installNimbusServerMod,
  nimbusProxyToml,
  readOrCreateNimbusSecret,
} from "./nimbus-config";

let dir = "";

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "slutvival-nimbus-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

function instance(overrides: Partial<Instance> = {}): Instance {
  return {
    id: "hub",
    name: "Hub",
    game: "vintage-story",
    development: false,
    version: "1.22.3",
    port: 42420,
    dataPath: path.join(dir, "hub", "vintage"),
    runtime: "docker",
    serverEngine: "stratum",
    docker: { containerName: "vs-hub", image: "mcr.microsoft.com/dotnet/runtime:10.0", network: "slutvival-net" },
    resources: { memoryLimitMB: 4096, cpuLimit: 2 },
    maxPlayers: 16,
    passwordProtected: false,
    publicAdvertised: false,
    autoRestart: false,
    autoBackup: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("nimbus config", () => {
  it("creates and reuses the shared secret", async () => {
    const file = path.join(dir, "secret");
    const first = await readOrCreateNimbusSecret(file);
    const second = await readOrCreateNimbusSecret(file);
    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(20);
  });

  it("maps backends to private Docker addresses", () => {
    expect(backendAddress(instance())).toBe("vs-hub:42420");
  });

  it("writes proxy TOML with hub as the first route", () => {
    const toml = nimbusProxyToml([instance()], "secret");
    expect(toml).toContain('bind = "0.0.0.0:42420"');
    expect(toml).toContain('embedded_bind = "http://0.0.0.0:8765"');
    expect(toml).toContain('hub = "vs-hub:42420"');
    expect(toml).toContain('try = ["hub"]');
  });

  it("writes backend JSON for reservation-required Nimbus joins", () => {
    expect(backendNimbusConfig(instance(), "secret")).toMatchObject({
      Enabled: true,
      ServerId: "hub",
      PublicHost: "play.slutvival.com",
      PublicPort: 42420,
      RegistryUrl: "http://nimbus-proxy:8765",
      SharedSecret: "secret",
      ReservationRequired: true,
      TransferMode: "redirect",
    });
  });

  it("copies Nimbus.ServerMod into the backend Mods directory", async () => {
    const source = path.join(dir, "release_full", "Nimbus.ServerMod");
    const mods = path.join(dir, "hub", "vintage", "Mods");
    await fs.mkdir(source, { recursive: true });
    await fs.writeFile(path.join(source, "modinfo.json"), "{}");
    await fs.writeFile(path.join(source, "Nimbus.ServerMod.dll"), "dll");
    await installNimbusServerMod(dir, mods);
    expect(await fs.readFile(path.join(mods, "Nimbus.ServerMod", "Nimbus.ServerMod.dll"), "utf8")).toBe("dll");
  });
});
```

- [ ] **Step 2: Run the failing Nimbus config tests**

Run:

```bash
npm test -- src/lib/server/vintage-network/nimbus-config.test.ts
```

Expected: FAIL because `nimbus-config.ts` does not exist.

- [ ] **Step 3: Implement Nimbus config helpers**

Create `src/lib/server/vintage-network/nimbus-config.ts` with these exports:

```ts
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Instance } from "@/lib/types";
import { config, vsPaths } from "@/lib/server/config";
import {
  HUB_INSTANCE_ID,
  NIMBUS_PROXY_CONTAINER,
  nimbusProxyConfigPath,
  nimbusRuntimeDir,
  nimbusSecretPath,
} from "./constants";

export async function readOrCreateNimbusSecret(file = nimbusSecretPath()): Promise<string> {
  const existing = await fs.readFile(file, "utf8").catch(() => "");
  if (existing.trim()) return existing.trim();
  const value = randomBytes(32).toString("base64url");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${value}\n`, { encoding: "utf8", mode: 0o600 });
  return value;
}

export function backendAddress(inst: Instance): string {
  return `${inst.docker.containerName}:${inst.port}`;
}

export function nimbusProxyToml(instances: Instance[], secret: string): string {
  const active = instances.filter((inst) => inst.game === "vintage-story");
  const serverLines = active
    .map((inst) => `${inst.id} = "${backendAddress(inst)}"`)
    .sort();
  const tryRoute = active.some((inst) => inst.id === HUB_INSTANCE_ID)
    ? HUB_INSTANCE_ID
    : active[0]?.id ?? HUB_INSTANCE_ID;

  return [
    `bind = "0.0.0.0:${config.vintageNetwork.publicPort}"`,
    "",
    "[servers]",
    ...serverLines,
    "",
    `try = ["${tryRoute}"]`,
    "",
    "[registry]",
    'mode = "embedded"',
    `embedded_bind = "http://0.0.0.0:${config.vintageNetwork.registryPort}"`,
    `embedded_shared_secret = "${secret}"`,
    "",
  ].join("\n");
}

export function backendNimbusConfig(inst: Instance, secret: string): Record<string, unknown> {
  return {
    Enabled: true,
    ServerId: inst.id,
    DisplayName: inst.name,
    PublicHost: config.vintageNetwork.publicHost,
    PublicPort: config.vintageNetwork.publicPort,
    Tags: [inst.group ?? "Servers"],
    RegistryUrl: `http://${NIMBUS_PROXY_CONTAINER}:${config.vintageNetwork.registryPort}`,
    SharedSecret: secret,
    HeartbeatIntervalSeconds: 15,
    RegistryHttpTimeoutSeconds: 5,
    Maintenance: false,
    ReservationRequired: true,
    AllowPlayerServerCommand: true,
    TransferMode: "redirect",
    SeamlessPrepareAckTimeoutSeconds: 10,
  };
}

export async function activateNimbusRuntime(nimbusInstallDir: string): Promise<string> {
  const source = path.join(nimbusInstallDir, "release_full", "Nimbus");
  const runtime = nimbusRuntimeDir();
  if (!existsSync(path.join(source, "Nimbus.Proxy.dll"))) {
    throw new Error("Nimbus proxy artifact is missing Nimbus.Proxy.dll");
  }
  await fs.rm(runtime, { recursive: true, force: true });
  await fs.mkdir(path.dirname(runtime), { recursive: true });
  await fs.cp(source, runtime, { recursive: true });
  return runtime;
}

export async function installNimbusServerMod(nimbusInstallDir: string, modsDir: string): Promise<void> {
  const source = path.join(nimbusInstallDir, "release_full", "Nimbus.ServerMod");
  const target = path.join(modsDir, "Nimbus.ServerMod");
  if (!existsSync(path.join(source, "modinfo.json"))) {
    throw new Error("Nimbus server mod artifact is missing modinfo.json");
  }
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(modsDir, { recursive: true });
  await fs.cp(source, target, { recursive: true });
}

export async function writeNimbusFiles(instances: Instance[], nimbusInstallDir: string): Promise<void> {
  const secret = await readOrCreateNimbusSecret();
  await activateNimbusRuntime(nimbusInstallDir);
  await atomicWrite(nimbusProxyConfigPath(), nimbusProxyToml(instances, secret));
  for (const inst of instances) {
    const paths = vsPaths(inst.id);
    await installNimbusServerMod(nimbusInstallDir, paths.mods);
    await fs.mkdir(paths.modConfig, { recursive: true });
    await atomicWrite(
      path.join(paths.modConfig, "nimbus-server.json"),
      JSON.stringify(backendNimbusConfig(inst, secret), null, 2),
    );
  }
}

async function atomicWrite(file: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, content, "utf8");
  await fs.rename(tmp, file);
}
```

- [ ] **Step 4: Run Nimbus config tests**

Run:

```bash
npm test -- src/lib/server/vintage-network/nimbus-config.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

Run:

```bash
git add src/lib/server/vintage-network/nimbus-config.ts src/lib/server/vintage-network/nimbus-config.test.ts
git commit -m "feat: generate nimbus config"
```

---

### Task 4: Make Instance Provisioning Server-Engine Aware

**Files:**
- Modify: `src/lib/server/store.ts`
- Modify: `src/lib/server/provisioning.ts`
- Modify: `src/lib/server/runtimes/docker.ts`
- Test: `src/lib/server/provisioning.test.ts`

- [ ] **Step 1: Write failing provisioning tests**

Create `src/lib/server/provisioning.test.ts`:

```ts
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Instance } from "@/lib/types";
import {
  dockerCommand,
  dockerMounts,
  serverInstallMarkerValue,
} from "./provisioning";

function instance(engine: "stratum" | "vanilla"): Instance {
  return {
    id: "hub",
    name: "Hub",
    game: "vintage-story",
    development: false,
    version: "1.22.3",
    port: 42420,
    dataPath: "/tmp/hub/vintage",
    runtime: "docker",
    serverEngine: engine,
    docker: { containerName: "vs-hub", image: "mcr.microsoft.com/dotnet/runtime:10.0", network: "slutvival-net" },
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

describe("provisioning engine support", () => {
  it("uses the Stratum executable for Stratum instances", () => {
    expect(dockerCommand(instance("stratum"))).toEqual(["./StratumServer", "--dataPath", "/data"]);
  });

  it("keeps the vanilla command for fallback instances", () => {
    expect(dockerCommand(instance("vanilla"))).toEqual(["dotnet", "VintagestoryServer.dll", "--dataPath", "/data"]);
  });

  it("mounts Stratum server directories read-write for first-run bootstrap", () => {
    expect(dockerMounts(instance("stratum"))).toContain(
      `${path.join("/opt/slutvival/games/vintage-story/hub", "server")}:/server:rw`,
    );
  });

  it("includes engine and version in install markers", () => {
    expect(serverInstallMarkerValue(instance("stratum"))).toBe("stratum:1.22.3");
  });
});
```

- [ ] **Step 2: Run failing provisioning tests**

Run:

```bash
npm test -- src/lib/server/provisioning.test.ts
```

Expected: FAIL because `dockerCommand` still takes no instance and `serverInstallMarkerValue` does not exist.

- [ ] **Step 3: Update store defaults**

Modify `src/lib/server/store.ts` in `withDefaults`:

```ts
    runtime: normalizeRuntime(partial.runtime),
    serverEngine: partial.serverEngine ?? "stratum",
```

Modify `createInstance` so the Docker object keeps an input override while defaulting to existing values:

```ts
    docker: {
      containerName: input.docker?.containerName ?? `vs-${id}`,
      image: input.docker?.image ?? config.docker.image,
      network: input.docker?.network ?? config.docker.network,
    },
```

- [ ] **Step 4: Update provisioning helpers**

Modify `src/lib/server/provisioning.ts`:

```ts
import { ensureStratumArtifact } from "./vintage-network/artifacts";
```

Replace `dockerCommand`:

```ts
export function dockerCommand(inst: Instance): string[] {
  if (inst.serverEngine === "stratum") {
    return ["./StratumServer", "--dataPath", "/data"];
  }
  return ["dotnet", "VintagestoryServer.dll", "--dataPath", "/data"];
}
```

Add:

```ts
export function serverInstallMarkerValue(inst: Instance): string {
  return `${inst.serverEngine}:${inst.version}`;
}
```

In `ensureServerInstalled`, branch before the vanilla download path:

```ts
  if (inst.serverEngine === "stratum") {
    await ensureStratumServerInstalled(inst, options);
    return;
  }
```

For the vanilla path, replace the existing installed-version check with:

```ts
  if (
    !options.force &&
    (await hasInstalledVersion(
      installDir,
      serverInstallMarkerValue(inst),
      "VintagestoryServer.dll",
    ))
  ) {
    await ensureInstanceDockerFiles(inst);
    return;
  }
```

Add this helper:

```ts
async function ensureStratumServerInstalled(
  inst: Instance,
  options: { force?: boolean; onLog?: (message: string) => void } = {},
): Promise<void> {
  const installDir = instanceServerPath(inst.id);
  if (
    !options.force &&
    (await hasInstalledVersion(
      installDir,
      serverInstallMarkerValue(inst),
      "StratumServer",
    ))
  ) {
    await ensureInstanceDockerFiles(inst);
    return;
  }

  options.onLog?.(`[Install] Installing Stratum ${inst.version}.`);
  const artifactDir = await ensureStratumArtifact();
  const tmpRoot = path.join(instanceDir(inst.id), `.server-install-stratum-${Date.now()}`);
  const extractDir = path.join(tmpRoot, "server");
  await fs.rm(tmpRoot, { recursive: true, force: true });
  await fs.mkdir(extractDir, { recursive: true });

  try {
    await fs.copyFile(path.join(artifactDir, "StratumServer"), path.join(extractDir, "StratumServer"));
    await fs.chmod(path.join(extractDir, "StratumServer"), 0o755);
    await fs.writeFile(path.join(extractDir, VERSION_MARKER), `${serverInstallMarkerValue(inst)}\n`, "utf8");
    await fs.rm(installDir, { recursive: true, force: true });
    await fs.rename(extractDir, installDir);
    await ensureInstanceDockerFiles(inst);
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
}
```

Change vanilla marker writes to use the engine marker:

```ts
    await fs.writeFile(path.join(extractDir, VERSION_MARKER), `${serverInstallMarkerValue(inst)}\n`, "utf8");
```

Change `hasInstalledVersion` signature and checks:

```ts
async function hasInstalledVersion(
  installDir: string,
  markerValue: string,
  requiredFile: string,
): Promise<boolean> {
  if (!existsSync(path.join(installDir, requiredFile))) return false;
  try {
    const marker = await fs.readFile(path.join(installDir, VERSION_MARKER), "utf8");
    return marker.trim() === markerValue;
  } catch {
    return false;
  }
}
```

Before using the vanilla install path, keep the vanilla DLL validation by calling `validateServerInstall`.

Replace compose command line:

```ts
    `    command: ${JSON.stringify(dockerCommand(inst))}`,
```

Replace `dockerMounts`:

```ts
export function dockerMounts(inst: Instance): string[] {
  const serverMode = inst.serverEngine === "stratum" ? "rw" : "ro";
  return [
    `${instanceServerPath(inst.id)}:/server:${serverMode}`,
    `${instanceDataPath(inst.id)}:/data:rw`,
  ];
}
```

Modify `src/lib/server/runtimes/docker.ts` so it passes the instance into the new command helper:

```ts
      Cmd: dockerCommand(this.instance),
```

and:

```ts
      command.join("\0") !== dockerCommand(this.instance).join("\0")
```

- [ ] **Step 5: Run provisioning tests and typecheck**

Run:

```bash
npm test -- src/lib/server/provisioning.test.ts
npm run typecheck
```

Expected: provisioning tests PASS and typecheck PASS.

- [ ] **Step 6: Commit Task 4**

Run:

```bash
git add src/lib/server/store.ts src/lib/server/provisioning.ts src/lib/server/runtimes/docker.ts src/lib/server/provisioning.test.ts
git commit -m "feat: support stratum backend provisioning"
```

---

### Task 5: Keep Stratum Backends Private In Docker

**Files:**
- Modify: `src/lib/server/runtimes/docker.ts`
- Modify: `src/lib/server/runtimes/docker.test.ts`

- [ ] **Step 1: Extend Docker runtime tests**

Modify `src/lib/server/runtimes/docker.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Instance, ServerStats } from "@/lib/types";
import {
  backendPortBindings,
  normalizeDockerRuntimeStats,
} from "./docker";
```

Append:

```ts
function dockerInstance(engine: "stratum" | "vanilla"): Instance {
  return {
    id: "hub",
    name: "Hub",
    game: "vintage-story",
    development: false,
    version: "1.22.3",
    port: 42420,
    dataPath: "/tmp/hub/vintage",
    runtime: "docker",
    serverEngine: engine,
    docker: { containerName: "vs-hub", image: "mcr.microsoft.com/dotnet/runtime:10.0", network: "slutvival-net" },
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

describe("backendPortBindings", () => {
  it("does not publish Stratum backend ports", () => {
    expect(backendPortBindings(dockerInstance("stratum"))).toEqual({});
  });

  it("keeps vanilla fallback ports published", () => {
    expect(backendPortBindings(dockerInstance("vanilla"))).toEqual({
      "42420/tcp": [{ HostPort: "42420" }],
      "42420/udp": [{ HostPort: "42420" }],
    });
  });
});
```

- [ ] **Step 2: Run failing Docker runtime tests**

Run:

```bash
npm test -- src/lib/server/runtimes/docker.test.ts
```

Expected: FAIL because `backendPortBindings` does not exist.

- [ ] **Step 3: Implement private backend port bindings**

Modify `src/lib/server/runtimes/docker.ts`.

Add exported helper near the bottom:

```ts
export function backendPortBindings(
  inst: Instance,
): Record<string, Array<{ HostPort?: string }>> {
  const port = String(inst.port);
  if (inst.game === "vintage-story" && inst.serverEngine === "stratum") return {};
  return {
    [`${port}/tcp`]: [{ HostPort: port }],
    [`${port}/udp`]: [{ HostPort: port }],
  };
}
```

In `ensureContainer`, replace:

```ts
    const portBindings = {
      [`${port}/tcp`]: [{ HostPort: port }],
      [`${port}/udp`]: [{ HostPort: port }],
    };
```

with:

```ts
    const portBindings = backendPortBindings(this.instance);
```

Replace `PortBindings: portBindings,` with:

```ts
        PortBindings: portBindings,
```

Replace the port comparison block inside `needsRecreate` with:

```ts
      JSON.stringify(ports) !== JSON.stringify(backendPortBindings(this.instance)) ||
```

- [ ] **Step 4: Run Docker runtime tests and typecheck**

Run:

```bash
npm test -- src/lib/server/runtimes/docker.test.ts
npm run typecheck
```

Expected: PASS for the Docker runtime tests and typecheck.

- [ ] **Step 5: Commit Task 5**

Run:

```bash
git add src/lib/server/runtimes/docker.ts src/lib/server/runtimes/docker.test.ts
git commit -m "feat: keep stratum backends private"
```

---

### Task 6: Add Nimbus Proxy Docker Control

**Files:**
- Create: `src/lib/server/vintage-network/docker-proxy.ts`
- Test: `src/lib/server/vintage-network/docker-proxy.test.ts`

- [ ] **Step 1: Write failing proxy spec tests**

Create `src/lib/server/vintage-network/docker-proxy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nimbusProxyContainerSpec } from "./docker-proxy";

describe("nimbusProxyContainerSpec", () => {
  it("publishes only the Nimbus public port", () => {
    const spec = nimbusProxyContainerSpec("/opt/slutvival/tools/nimbus/runtime");
    expect(spec.name).toBe("nimbus-proxy");
    expect(spec.HostConfig?.PortBindings).toEqual({
      "42420/tcp": [{ HostPort: "42420" }],
      "42420/udp": [{ HostPort: "42420" }],
    });
    expect(spec.HostConfig?.Binds).toContain("/opt/slutvival/tools/nimbus/runtime:/nimbus:rw");
  });

  it("runs Nimbus.Proxy.dll from the mounted runtime directory", () => {
    const spec = nimbusProxyContainerSpec("/opt/slutvival/tools/nimbus/runtime");
    expect(spec.WorkingDir).toBe("/nimbus");
    expect(spec.Cmd).toEqual(["dotnet", "Nimbus.Proxy.dll"]);
  });
});
```

- [ ] **Step 2: Run failing proxy tests**

Run:

```bash
npm test -- src/lib/server/vintage-network/docker-proxy.test.ts
```

Expected: FAIL because `docker-proxy.ts` does not exist.

- [ ] **Step 3: Implement proxy Docker helpers**

Create `src/lib/server/vintage-network/docker-proxy.ts`:

```ts
import Docker from "dockerode";
import { config } from "@/lib/server/config";
import { NIMBUS_PROXY_CONTAINER } from "./constants";

let dockerClient: Docker | null = null;
function docker(): Docker {
  if (!dockerClient) dockerClient = new Docker({ socketPath: config.docker.socket });
  return dockerClient;
}

export function nimbusProxyContainerSpec(runtimeDir: string): Docker.ContainerCreateOptions {
  const publicPort = String(config.vintageNetwork.publicPort);
  return {
    name: NIMBUS_PROXY_CONTAINER,
    Image: config.docker.image,
    WorkingDir: "/nimbus",
    Cmd: ["dotnet", "Nimbus.Proxy.dll"],
    ExposedPorts: {
      [`${publicPort}/tcp`]: {},
      [`${publicPort}/udp`]: {},
      [`${config.vintageNetwork.registryPort}/tcp`]: {},
    },
    Labels: {
      "slutvival.panel.managed": "true",
      "slutvival.panel.component": "nimbus-proxy",
    },
    HostConfig: {
      Binds: [`${runtimeDir}:/nimbus:rw`],
      NetworkMode: config.docker.network,
      PortBindings: {
        [`${publicPort}/tcp`]: [{ HostPort: publicPort }],
        [`${publicPort}/udp`]: [{ HostPort: publicPort }],
      },
      RestartPolicy: { Name: "unless-stopped" },
    },
  };
}

export async function isNimbusProxyRunning(): Promise<boolean> {
  try {
    const info = await docker().getContainer(NIMBUS_PROXY_CONTAINER).inspect();
    return Boolean(info.State.Running);
  } catch (error) {
    if (isDockerNotFound(error)) return false;
    throw error;
  }
}

export async function ensureNimbusProxy(runtimeDir: string): Promise<void> {
  const container = docker().getContainer(NIMBUS_PROXY_CONTAINER);
  const desired = nimbusProxyContainerSpec(runtimeDir);
  try {
    const info = await container.inspect();
    const currentBinds = info.HostConfig.Binds ?? [];
    const desiredBinds = desired.HostConfig?.Binds ?? [];
    const currentPorts = info.HostConfig.PortBindings ?? {};
    const desiredPorts = desired.HostConfig?.PortBindings ?? {};
    const recreate =
      info.Config.Image !== desired.Image ||
      info.HostConfig.NetworkMode !== config.docker.network ||
      JSON.stringify(currentBinds) !== JSON.stringify(desiredBinds) ||
      JSON.stringify(currentPorts) !== JSON.stringify(desiredPorts);
    if (recreate) {
      if (info.State.Running) await container.stop({ t: 15 });
      await container.remove({ force: true });
    } else {
      if (!info.State.Running) await container.start();
      return;
    }
  } catch (error) {
    if (!isDockerNotFound(error)) throw error;
  }

  await docker().createContainer(desired);
  await container.start();
}

function isDockerNotFound(error: unknown): error is { statusCode: 404 } {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    error.statusCode === 404
  );
}
```

- [ ] **Step 4: Run proxy tests**

Run:

```bash
npm test -- src/lib/server/vintage-network/docker-proxy.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 6**

Run:

```bash
git add src/lib/server/vintage-network/docker-proxy.ts src/lib/server/vintage-network/docker-proxy.test.ts
git commit -m "feat: manage nimbus proxy container"
```

---

### Task 7: Add Network Setup Service And API

**Files:**
- Create: `src/lib/server/vintage-network/service.ts`
- Test: `src/lib/server/vintage-network/service.test.ts`
- Create: `src/app/api/vintage-story/network/route.ts`
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Write failing service tests**

Create `src/lib/server/vintage-network/service.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nimbusPublicAddress } from "./constants";

describe("vintage network service contract", () => {
  it("uses the approved public address", () => {
    expect(nimbusPublicAddress()).toBe("play.slutvival.com:42420");
  });
});
```

- [ ] **Step 2: Run the service contract test**

Run:

```bash
npm test -- src/lib/server/vintage-network/service.test.ts
```

Expected: PASS. This test locks the public address while the service is added.

- [ ] **Step 3: Implement setup service**

Create `src/lib/server/vintage-network/service.ts`:

```ts
import { existsSync } from "node:fs";
import type { CreateInstanceInput, VintageStoryNetworkStatus, VintageStoryNetworkSetupResult } from "@/lib/types";
import { config } from "@/lib/server/config";
import { createInstance, getInstance, listInstances } from "@/lib/server/store";
import { supervisor } from "@/lib/server/supervisor";
import { ensureNimbusArtifact, ensureStratumArtifact, readArtifactMarker } from "./artifacts";
import {
  HUB_INSTANCE_ID,
  NIMBUS_RELEASE_TAG,
  STRATUM_RELEASE_TAG,
  creativeSuperflatHubWorld,
  nimbusInstallDir,
  nimbusProxyConfigPath,
  nimbusPublicAddress,
  nimbusRuntimeDir,
  stratumInstallDir,
} from "./constants";
import { ensureNimbusProxy, isNimbusProxyRunning } from "./docker-proxy";
import { writeNimbusFiles } from "./nimbus-config";

export async function getVintageNetworkStatus(): Promise<VintageStoryNetworkStatus> {
  const hub = await getInstance(HUB_INSTANCE_ID);
  const stratumMarker = await readArtifactMarker(stratumInstallDir());
  const nimbusMarker = await readArtifactMarker(nimbusInstallDir());
  return {
    publicAddress: nimbusPublicAddress(),
    publicHost: config.vintageNetwork.publicHost,
    publicPort: config.vintageNetwork.publicPort,
    registryPort: config.vintageNetwork.registryPort,
    hubExists: Boolean(hub),
    stratumInstalled: stratumMarker?.tag === STRATUM_RELEASE_TAG,
    nimbusInstalled: nimbusMarker?.tag === NIMBUS_RELEASE_TAG,
    nimbusConfigured: existsSync(nimbusProxyConfigPath()),
    nimbusProxyRunning: await isNimbusProxyRunning(),
  };
}

export async function setupVintageNetwork(): Promise<VintageStoryNetworkSetupResult> {
  await ensureStratumArtifact();
  const nimbusDir = await ensureNimbusArtifact();
  const hub = await ensureHubInstance();
  const instances = await listInstances("vintage-story");
  await writeNimbusFiles(instances, nimbusDir);
  for (const inst of instances) {
    await supervisor.power(inst.id === hub.id ? hub : inst, "start");
  }
  await ensureNimbusProxy(nimbusRuntimeDir());
  return { ok: true, status: await getVintageNetworkStatus() };
}

async function ensureHubInstance() {
  const existing = await getInstance(HUB_INSTANCE_ID);
  if (existing) return existing;

  const input: CreateInstanceInput = {
    id: HUB_INSTANCE_ID,
    name: "Hub",
    group: "Servers",
    description: "Creative superflat landing server for the Slutvival Vintage Story network.",
    motd: "Welcome to Slutvival.",
    worldName: "Hub",
    game: "vintage-story",
    runtime: "docker",
    serverEngine: "stratum",
    port: config.vintageNetwork.publicPort,
    maxPlayers: 16,
    passwordProtected: false,
    publicAdvertised: false,
    autoRestart: false,
    autoBackup: true,
    initialWorldConfig: creativeSuperflatHubWorld(),
  };
  return createInstance(input);
}
```

If TypeScript reports that `serverEngine` is not allowed on `CreateInstanceInput`, confirm Task 1 added it through `Partial<Instance>` and rerun typecheck after saving all files.

- [ ] **Step 4: Add API route**

Create `src/app/api/vintage-story/network/route.ts`:

```ts
import { json, serverError } from "@/lib/server/http";
import {
  getVintageNetworkStatus,
  setupVintageNetwork,
} from "@/lib/server/vintage-network/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return json(await getVintageNetworkStatus());
  } catch (error) {
    return serverError(error);
  }
}

export async function POST() {
  try {
    return json(await setupVintageNetwork());
  } catch (error) {
    return serverError(error);
  }
}
```

Modify `src/lib/api.ts` imports:

```ts
  VintageStoryNetworkSetupResult,
  VintageStoryNetworkStatus,
```

Add under `vintageStory`:

```ts
    network: {
      status: () =>
        fetcher<VintageStoryNetworkStatus>("/api/vintage-story/network"),
      setup: () =>
        send<VintageStoryNetworkSetupResult>("/api/vintage-story/network", "POST"),
    },
```

- [ ] **Step 5: Run network tests and typecheck**

Run:

```bash
npm test -- src/lib/server/vintage-network/service.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit Task 7**

Run:

```bash
git add src/lib/server/vintage-network/service.ts src/lib/server/vintage-network/service.test.ts src/app/api/vintage-story/network/route.ts src/lib/api.ts
git commit -m "feat: add vintage network setup api"
```

---

### Task 8: Add Minimal Vintage Network Panel UI

**Files:**
- Create: `src/components/vintage-story/network-panel.tsx`
- Modify: `src/app/(panel)/vintage-story/page.tsx`

- [ ] **Step 1: Create the network panel component**

Create `src/components/vintage-story/network-panel.tsx`:

```tsx
"use client";

import useSWR, { useSWRConfig } from "swr";
import { Loader2Icon, NetworkIcon, PlayIcon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";

export function VintageNetworkPanel() {
  const { mutate } = useSWRConfig();
  const { data, isLoading } = useSWR("vintage-story-network", api.vintageStory.network.status, {
    refreshInterval: 5000,
  });

  async function setup() {
    try {
      await api.vintageStory.network.setup();
      await mutate("vintage-story-network");
      await mutate((key) => Array.isArray(key) && key[0] === "instances");
      toast.success("Vintage Story network setup complete");
    } catch (error) {
      toast.error("Network setup failed", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  const ready =
    data?.hubExists &&
    data.stratumInstalled &&
    data.nimbusInstalled &&
    data.nimbusConfigured &&
    data.nimbusProxyRunning;

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <NetworkIcon className="size-4 text-primary" />
            <h2 className="font-heading text-sm font-semibold text-foreground">
              Vintage Story Network
            </h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {data?.publicAddress ?? "play.slutvival.com:42420"}
          </p>
        </div>
        <Button onClick={setup} disabled={isLoading}>
          {isLoading ? <Loader2Icon className="animate-spin" /> : ready ? <RefreshCwIcon /> : <PlayIcon />}
          {ready ? "Repair Setup" : "Set Up Network"}
        </Button>
      </div>
      <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-5">
        <Status label="Hub" value={Boolean(data?.hubExists)} />
        <Status label="Stratum" value={Boolean(data?.stratumInstalled)} />
        <Status label="Nimbus" value={Boolean(data?.nimbusInstalled)} />
        <Status label="Config" value={Boolean(data?.nimbusConfigured)} />
        <Status label="Proxy" value={Boolean(data?.nimbusProxyRunning)} />
      </div>
    </Card>
  );
}

function Status({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
      <span>{label}</span>
      <span className={value ? "text-emerald-500" : "text-muted-foreground"}>
        {value ? "Ready" : "Missing"}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Render it on the Vintage Story page**

Modify `src/app/(panel)/vintage-story/page.tsx` imports:

```tsx
import { VintageNetworkPanel } from "@/components/vintage-story/network-panel";
```

Render below `PageHeader`:

```tsx
      <VintageNetworkPanel />
```

- [ ] **Step 3: Run typecheck and lint**

Run:

```bash
npm run typecheck
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Commit Task 8**

Run:

```bash
git add src/components/vintage-story/network-panel.tsx 'src/app/(panel)/vintage-story/page.tsx'
git commit -m "feat: add vintage network panel"
```

---

### Task 9: End-To-End Verification And Deployment

**Files:**
- Modify only files changed by fixes from verification failures.

- [ ] **Step 1: Run the full automated suite**

Run:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Expected: all commands PASS.

- [ ] **Step 2: Rebuild and restart the panel container**

Run:

```bash
docker compose -f /opt/slutvival/docker/stacks/slutvival-panel/docker-compose.yml up -d --build
```

Expected: `slutvival-panel` is recreated and running.

- [ ] **Step 3: Trigger setup through the API**

Run:

```bash
curl -fsS -X POST http://127.0.0.1:3000/api/vintage-story/network | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>console.log(JSON.stringify(JSON.parse(s), null, 2)))'
```

Expected JSON includes:

```json
{
  "ok": true,
  "status": {
    "publicAddress": "play.slutvival.com:42420",
    "hubExists": true,
    "stratumInstalled": true,
    "nimbusInstalled": true,
    "nimbusConfigured": true,
    "nimbusProxyRunning": true
  }
}
```

- [ ] **Step 4: Verify Docker exposure**

Run:

```bash
docker ps --format '{{.Names}}\t{{.Ports}}' | rg 'nimbus-proxy|vs-hub'
```

Expected:

```text
nimbus-proxy    0.0.0.0:42420->42420/tcp, 0.0.0.0:42420->42420/udp
vs-hub
```

The `vs-hub` line must not show a host port mapping.

- [ ] **Step 5: Verify generated files exist without printing secrets**

Run:

```bash
test -x /opt/slutvival/games/vintage-story/hub/server/StratumServer
test -f /opt/slutvival/tools/nimbus/runtime/nimbus.proxy.toml
test -f /opt/slutvival/games/vintage-story/hub/vintage/ModConfig/nimbus-server.json
test -d /opt/slutvival/games/vintage-story/hub/vintage/Mods/Nimbus.ServerMod
```

Expected: all commands exit with status `0`.

- [ ] **Step 6: Commit verification fixes**

If verification required code fixes, run `git status --short`, stage the exact files changed by the verification fix, and commit with:

```bash
git commit -m "fix: stabilize vintage network setup"
```

If verification required no code fixes, leave the repository unchanged.
