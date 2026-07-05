import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { nanoid } from "nanoid";
import type { CreateInstanceInput, GameId, Instance } from "@/lib/types";
import {
  config,
  gameRoot,
  instanceDataPathForGame,
  instanceDirForGame,
  instanceServerPathForGame,
  MANAGED_GAMES,
  serverYmlPathForGame,
  vsPaths,
  GTA_DATA_SUBDIRS,
  VS_DATA_SUBDIRS,
} from "./config";
import { seedInstanceContent } from "./seed";
import { DEFAULT_VINTAGE_STORY_VERSION } from "@/lib/vintage-story-versions";
import { ensureInstanceDockerFiles, normalizeDockerImage } from "./provisioning";
import {
  GTA_DOCKER_IMAGE,
  GTA_INSTANCE_DESCRIPTION,
  GTA_INSTANCE_ID,
  GTA_INSTANCE_NAME,
} from "@/lib/gta";

/* ------------------------------------------------------------------ */
/* Defaults & (de)serialization                                       */
/* ------------------------------------------------------------------ */

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
      image: GTA_DOCKER_IMAGE,
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
      image: normalizeDockerImage(docker.image, game),
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

async function writeInstance(inst: Instance): Promise<void> {
  await fs.mkdir(instanceDirForGame(inst.game, inst.id), { recursive: true });
  const yml = YAML.stringify(inst);
  await fs.writeFile(serverYmlPathForGame(inst.game, inst.id), yml, "utf8");
}

async function refreshLegacyInstance(
  inst: Instance,
  parsed: Partial<Instance>,
): Promise<Instance> {
  const parsedImage = parsed.docker?.image;
  if (parsed.runtime === inst.runtime && parsedImage === inst.docker.image) {
    return inst;
  }
  await writeInstance(inst);
  await ensureInstanceDockerFiles(inst);
  return inst;
}

/* ------------------------------------------------------------------ */
/* Scaffolding                                                        */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Initialization                                                     */
/* ------------------------------------------------------------------ */

let seeded = false;

async function initializeIfNeeded(): Promise<void> {
  if (seeded) return;
  seeded = true;
  await Promise.all(MANAGED_GAMES.map((game) => fs.mkdir(gameRoot(game), { recursive: true })));
}

/* ------------------------------------------------------------------ */
/* Public API                                                         */
/* ------------------------------------------------------------------ */

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

export async function createInstance(
  input: CreateInstanceInput,
): Promise<Instance> {
  await initializeIfNeeded();
  const game = input.game ?? "vintage-story";
  if (game === "gta") {
    throw new Error("GTA 5 is managed as a single Los Santos server");
  }
  if (game !== "vintage-story") {
    throw new Error(`Game '${game}' is not supported for server creation`);
  }
  const id = input.id ?? slugId(input.name);
  if (id === GTA_INSTANCE_ID) {
    throw new Error(`Server id '${GTA_INSTANCE_ID}' is reserved for GTA 5`);
  }
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

export async function ensureGtaInstance(): Promise<Instance> {
  await initializeIfNeeded();
  const existing = await readInstance("gta", GTA_INSTANCE_ID);
  if (existing) {
    await ensureInstanceDirs(existing);
    await ensureInstanceDockerFiles(existing);
    await seedInstanceContent(existing);
    return existing;
  }

  const inst = withDefaults({
    id: GTA_INSTANCE_ID,
    name: GTA_INSTANCE_NAME,
    game: "gta",
    description: GTA_INSTANCE_DESCRIPTION,
    port: 30120,
    version: "recommended",
    runtime: "docker",
    serverEngine: "fxserver",
    dataPath: instanceDataPathForGame("gta", GTA_INSTANCE_ID),
    docker: defaultDockerForGame("gta", GTA_INSTANCE_ID),
    resources: { memoryLimitMB: 4096, cpuLimit: 2 },
    maxPlayers: 48,
    autoRestart: false,
    autoBackup: false,
  });
  await ensureInstanceDirs(inst);
  await writeInstance(inst);
  await ensureInstanceDockerFiles(inst);
  await seedInstanceContent(inst);
  return inst;
}

export async function updateInstance(
  id: string,
  patch: Partial<Instance>,
): Promise<Instance | null> {
  const current = await getInstance(id);
  if (!current) return null;
  const next: Instance = {
    ...current,
    ...patch,
    id: current.id,
    game: current.game,
    docker: { ...current.docker, ...patch.docker },
    resources: { ...current.resources, ...patch.resources },
    updatedAt: Date.now(),
  };
  await writeInstance(next);
  await ensureInstanceDockerFiles(next);
  return next;
}

export async function deleteInstance(id: string): Promise<boolean> {
  const inst = await getInstance(id);
  if (!inst) return false;
  const dir = instanceDirForGame(inst.game, inst.id);
  await fs.rm(dir, { recursive: true, force: true });
  return true;
}

/* ------------------------------------------------------------------ */

function slugId(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return base ? `${base}-${nanoid(4).toLowerCase()}` : nanoid(8).toLowerCase();
}

function normalizeRuntime(runtime?: Instance["runtime"]): Instance["runtime"] {
  if (config.preferredRuntime === "simulated") return "simulated";
  if (config.preferredRuntime === "process") return "process";
  if (runtime === "process") return "process";
  return "docker";
}

export { vsPaths };
