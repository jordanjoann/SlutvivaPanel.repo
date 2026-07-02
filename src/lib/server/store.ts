import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { nanoid } from "nanoid";
import type { GameId, Instance } from "@/lib/types";
import {
  config,
  instanceDir,
  instanceDataPath,
  serverYmlPath,
  vsPaths,
  VS_DATA_SUBDIRS,
} from "./config";
import { seedInstanceContent, DEMO_INSTANCES } from "./seed";
import { DEFAULT_VINTAGE_STORY_VERSION } from "@/lib/vintage-story-versions";

/* ------------------------------------------------------------------ */
/* Defaults & (de)serialization                                       */
/* ------------------------------------------------------------------ */

function withDefaults(partial: Partial<Instance> & { id: string; name: string }): Instance {
  const id = partial.id;
  const now = Date.now();
  const development =
    partial.development ??
    (partial.group === "Development" || id === "development");
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
    runtime: partial.runtime ?? "simulated",
    docker: partial.docker ?? {
      containerName: `vs-${id}`,
      image: config.docker.image,
      network: config.docker.network,
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
    return refreshSeededDemoVersion(inst);
  } catch {
    return null;
  }
}

async function writeInstance(inst: Instance): Promise<void> {
  await fs.mkdir(instanceDir(inst.id), { recursive: true });
  const yml = YAML.stringify(inst);
  await fs.writeFile(serverYmlPath(inst.id), yml, "utf8");
}

const SEEDED_DEMO_IDS = new Set(DEMO_INSTANCES.map((inst) => inst.id));
const STALE_DEMO_VERSIONS = new Set(["1.20.7", "1.20.6", "1.20.5", "1.20.4"]);

async function refreshSeededDemoVersion(inst: Instance): Promise<Instance> {
  if (
    !config.demoSeed ||
    !SEEDED_DEMO_IDS.has(inst.id) ||
    !STALE_DEMO_VERSIONS.has(inst.version)
  ) {
    return inst;
  }

  const next = {
    ...inst,
    version: DEFAULT_VINTAGE_STORY_VERSION,
    updatedAt: Date.now(),
  };
  await writeInstance(next);
  return next;
}

/* ------------------------------------------------------------------ */
/* Scaffolding                                                        */
/* ------------------------------------------------------------------ */

export async function ensureInstanceDirs(id: string): Promise<void> {
  const dir = instanceDir(id);
  await fs.mkdir(dir, { recursive: true });
  await fs.mkdir(path.join(dir, "notes"), { recursive: true });
  const data = instanceDataPath(id);
  await fs.mkdir(data, { recursive: true });
  for (const sub of VS_DATA_SUBDIRS) {
    await fs.mkdir(path.join(data, sub), { recursive: true });
  }
}

/* ------------------------------------------------------------------ */
/* Seeding                                                            */
/* ------------------------------------------------------------------ */

let seeded = false;

async function seedIfNeeded(): Promise<void> {
  if (seeded) return;
  seeded = true;
  await fs.mkdir(config.vintageStoryRoot, { recursive: true });
  const entries = await fs.readdir(config.vintageStoryRoot).catch(() => []);
  const hasAny = entries.some((e) => existsSync(serverYmlPath(e)));
  if (hasAny || !config.demoSeed) return;

  for (const demo of DEMO_INSTANCES) {
    const inst = withDefaults(demo);
    await ensureInstanceDirs(inst.id);
    await writeInstance(inst);
    await seedInstanceContent(inst);
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                         */
/* ------------------------------------------------------------------ */

export async function listInstances(game?: GameId): Promise<Instance[]> {
  await seedIfNeeded();
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
  await seedIfNeeded();
  return readInstance(id);
}

export async function createInstance(
  input: Partial<Instance> & { name: string },
): Promise<Instance> {
  await seedIfNeeded();
  const id = input.id ?? slugId(input.name);
  const used = await listInstances();
  const port =
    input.port ?? Math.max(42419, ...used.map((i) => i.port)) + 1;
  const inst = withDefaults({
    ...input,
    id,
    port,
    dataPath: instanceDataPath(id),
    docker: {
      containerName: `vs-${id}`,
      image: config.docker.image,
      network: config.docker.network,
    },
  });
  await ensureInstanceDirs(id);
  await writeInstance(inst);
  await seedInstanceContent(inst);
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

export { vsPaths };
