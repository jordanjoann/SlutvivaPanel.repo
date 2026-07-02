import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { nanoid } from "nanoid";
import type { CreateInstanceInput, GameId, Instance } from "@/lib/types";
import {
  config,
  instanceDir,
  instanceDataPath,
  serverYmlPath,
  vsPaths,
  VS_DATA_SUBDIRS,
} from "./config";
import { seedInstanceContent } from "./seed";
import { DEFAULT_VINTAGE_STORY_VERSION } from "@/lib/vintage-story-versions";
import { ensureInstanceDockerFiles, normalizeDockerImage } from "./provisioning";

/* ------------------------------------------------------------------ */
/* Defaults & (de)serialization                                       */
/* ------------------------------------------------------------------ */

function withDefaults(partial: Partial<Instance> & { id: string; name: string }): Instance {
  const id = partial.id;
  const now = Date.now();
  const development =
    partial.development ??
    (partial.group === "Development" || id === "development");
  const docker = partial.docker ?? {
    containerName: `vs-${id}`,
    image: config.docker.image,
    network: config.docker.network,
  };
  return {
    id,
    name: partial.name,
    game: partial.game ?? "vintage-story",
    description: partial.description ?? "",
    group: partial.group ?? (development ? "Development" : "Servers"),
    development,
    version: partial.version ?? DEFAULT_VINTAGE_STORY_VERSION,
    port: partial.port ?? 42420,
    dataPath: partial.dataPath ?? instanceDataPath(id),
    runtime: normalizeRuntime(partial.runtime),
    docker: {
      containerName: docker.containerName ?? `vs-${id}`,
      image: normalizeDockerImage(docker.image),
      network: docker.network ?? config.docker.network,
    },
    resources: partial.resources ?? { memoryLimitMB: 4096, cpuLimit: 2 },
    motd: partial.motd ?? "Welcome to the server!",
    worldName: partial.worldName ?? "New World",
    seed: partial.seed ?? "",
    maxPlayers: partial.maxPlayers ?? 16,
    passwordProtected: partial.passwordProtected ?? false,
    publicAdvertised: partial.publicAdvertised ?? false,
    autoRestart: partial.autoRestart ?? false,
    autoBackup: partial.autoBackup ?? true,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

async function readInstance(id: string): Promise<Instance | null> {
  const file = serverYmlPath(id);
  if (!existsSync(file)) return null;
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = (YAML.parse(raw) ?? {}) as Partial<Instance>;
    const inst = withDefaults({ ...parsed, id, name: parsed.name ?? id });
    return refreshLegacyInstance(inst, parsed);
  } catch {
    return null;
  }
}

async function writeInstance(inst: Instance): Promise<void> {
  await fs.mkdir(instanceDir(inst.id), { recursive: true });
  const yml = YAML.stringify(inst);
  await fs.writeFile(serverYmlPath(inst.id), yml, "utf8");
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

export async function ensureInstanceDirs(id: string): Promise<void> {
  const dir = instanceDir(id);
  await fs.mkdir(dir, { recursive: true });
  const data = instanceDataPath(id);
  await fs.mkdir(data, { recursive: true });
  for (const sub of VS_DATA_SUBDIRS) {
    await fs.mkdir(path.join(data, sub), { recursive: true });
  }
}

/* ------------------------------------------------------------------ */
/* Initialization                                                     */
/* ------------------------------------------------------------------ */

let seeded = false;

async function initializeIfNeeded(): Promise<void> {
  if (seeded) return;
  seeded = true;
  await fs.mkdir(config.vintageStoryRoot, { recursive: true });
}

/* ------------------------------------------------------------------ */
/* Public API                                                         */
/* ------------------------------------------------------------------ */

export async function listInstances(game?: GameId): Promise<Instance[]> {
  await initializeIfNeeded();
  const dirs = await fs.readdir(config.vintageStoryRoot).catch(() => []);
  const out: Instance[] = [];
  for (const id of dirs) {
    const inst = await readInstance(id);
    if (inst && (!game || inst.game === game)) out.push(inst);
  }
  out.sort((a, b) => a.createdAt - b.createdAt);
  return out;
}

export async function getInstance(id: string): Promise<Instance | null> {
  await initializeIfNeeded();
  return readInstance(id);
}

export async function createInstance(
  input: CreateInstanceInput,
): Promise<Instance> {
  await initializeIfNeeded();
  const id = input.id ?? slugId(input.name);
  const used = await listInstances();
  const port =
    input.port ?? Math.max(42419, ...used.map((i) => i.port)) + 1;
  const inst = withDefaults({
    ...input,
    id,
    port,
    autoRestart: false,
    dataPath: instanceDataPath(id),
    docker: {
      containerName: `vs-${id}`,
      image: config.docker.image,
      network: config.docker.network,
    },
  });
  await ensureInstanceDirs(id);
  await writeInstance(inst);
  await ensureInstanceDockerFiles(inst);
  await seedInstanceContent(inst, input);
  return inst;
}

export async function updateInstance(
  id: string,
  patch: Partial<Instance>,
): Promise<Instance | null> {
  const current = await readInstance(id);
  if (!current) return null;
  const next: Instance = {
    ...current,
    ...patch,
    id: current.id,
    docker: { ...current.docker, ...patch.docker },
    resources: { ...current.resources, ...patch.resources },
    updatedAt: Date.now(),
  };
  await writeInstance(next);
  await ensureInstanceDockerFiles(next);
  return next;
}

export async function deleteInstance(id: string): Promise<boolean> {
  const dir = instanceDir(id);
  if (!existsSync(dir)) return false;
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
