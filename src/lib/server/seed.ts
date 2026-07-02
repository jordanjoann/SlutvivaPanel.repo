import fs from "node:fs/promises";
import path from "node:path";
import type { Instance } from "@/lib/types";
import { instanceDir, vsPaths } from "./config";
import { DEFAULT_VINTAGE_STORY_VERSION } from "@/lib/vintage-story-versions";

/** Demo instances seeded on first run (matches the spec's example list). */
export const DEMO_INSTANCES: Array<Partial<Instance> & { id: string; name: string }> = [
  {
    id: "testing",
    name: "Testing",
    group: "Servers",
    description: "Throwaway world for trying mods and configs.",
    version: DEFAULT_VINTAGE_STORY_VERSION,
    port: 42420,
    worldName: "Testbed",
    seed: "482913",
    maxPlayers: 8,
    autoRestart: true,
    autoBackup: true,
    resources: { memoryLimitMB: 3072, cpuLimit: 1.5 },
  },
  {
    id: "development",
    name: "Development",
    group: "Development",
    development: true,
    description: "Staging server mirroring Main for mod development.",
    version: DEFAULT_VINTAGE_STORY_VERSION,
    port: 42421,
    worldName: "DevWorld",
    seed: "seed-dev-01",
    maxPlayers: 12,
    autoRestart: false,
    resources: { memoryLimitMB: 4096, cpuLimit: 2 },
  },
  {
    id: "main",
    name: "Main",
    group: "Servers",
    description: "The primary community survival server.",
    version: DEFAULT_VINTAGE_STORY_VERSION,
    port: 42422,
    worldName: "Aurora",
    seed: "1337-aurora",
    maxPlayers: 24,
    passwordProtected: false,
    publicAdvertised: true,
    autoRestart: true,
    autoBackup: true,
    resources: { memoryLimitMB: 8192, cpuLimit: 4 },
  },
  {
    id: "skyblock",
    name: "Skyblock",
    group: "Servers",
    description: "Curated skyblock challenge modpack.",
    version: DEFAULT_VINTAGE_STORY_VERSION,
    port: 42423,
    worldName: "SkyIslands",
    seed: "sky-9921",
    passwordProtected: true,
    maxPlayers: 16,
    autoBackup: true,
    resources: { memoryLimitMB: 6144, cpuLimit: 3 },
  },
];

const DEMO_MODS = [
  { id: "prospectorinfo", name: "Prospector Info", author: "JakeCool19", installedVersion: "4.5.0", latestVersion: "4.7.0", enabled: true, side: "Universal", description: "Displays reading results of the propick as an overlay." },
  { id: "carrycapacity", name: "Carry Capacity", author: "Zdena", installedVersion: "0.7.3", latestVersion: "0.7.3", enabled: true, side: "Universal", description: "Pick up and carry blocks, chests and more." },
  { id: "xskills", name: "XSkills", author: "Xenophps", installedVersion: "0.8.7", latestVersion: "0.8.9", enabled: true, side: "Universal", description: "Adds an RPG-like skill and ability system." },
  { id: "medievalexpansion", name: "Medieval Expansion", author: "Novocain", installedVersion: "3.11.0", latestVersion: "3.11.0", enabled: true, side: "Universal", description: "Adds medieval blocks, mechanics and mobs." },
  { id: "primitivesurvival", name: "Primitive Survival", author: "SpearAndFang", installedVersion: "3.5.1", latestVersion: "3.6.0", enabled: false, side: "Universal", description: "Trapping, fishing, tanning and primitive tech." },
  { id: "wildcraft", name: "Wildcraft: Fruits & Nuts", author: "Cheekygamer", installedVersion: "1.4.2", latestVersion: "1.4.2", enabled: true, side: "Universal", description: "Adds dozens of wild edible plants and trees." },
];

function serverConfig(inst: Instance) {
  return {
    ServerName: inst.name,
    ServerDescription: inst.description ?? "",
    ServerUrl: "",
    ServerLanguage: "en",
    Upnp: false,
    AdvertiseServer: inst.publicAdvertised,
    MaxClients: inst.maxPlayers,
    Port: inst.port,
    Password: inst.passwordProtected ? "********" : "",
    MapSizeX: 1024000,
    MapSizeY: 256,
    MapSizeZ: 1024000,
    WorldConfig: {
      Seed: inst.seed,
      SaveFileLocation: `Saves/${inst.worldName}.vcdbs`,
      WorldName: inst.worldName,
      PlayStyle: "surviveandbuild",
      PlayStyleLangCode: "preset-surviveandbuild",
      WorldType: "standard",
      AllowCreativeMode: false,
    },
    RoleByCode: { admin: {}, member: {} },
    StartupCommands: "",
    ModIds: DEMO_MODS.filter((m) => m.enabled).map((m) => m.id),
    ModConfig: {},
    OnlyWhitelisted: inst.development,
    Motd: inst.motd ?? "",
  };
}

async function writeJson(file: string, data: unknown) {
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

/** Lay down realistic per-instance content so every tab has real data. */
export async function seedInstanceContent(inst: Instance): Promise<void> {
  const dir = instanceDir(inst.id);
  const p = vsPaths(inst.id);
  const now = Date.now();

  await writeJson(p.serverConfig, serverConfig(inst));

  // Panel-managed mod manifest (source of truth for the Mods tab)
  await writeJson(path.join(p.modConfig, "panel-mods.json"), DEMO_MODS);

  // World metadata
  await writeJson(path.join(p.saves, "world.json"), {
    name: inst.worldName,
    seed: inst.seed,
    playStyle: "Survive and Build",
    worldType: "Standard",
    sizeBytes: 380 * 1024 * 1024,
    createdAt: inst.createdAt,
    lastPlayed: now,
    settings: {
      "Climate": "Realistic",
      "Landform Scale": "1.0",
      "Deposit Density": "1.0",
      "Temporal Storms": "Sometimes",
      "Server Chunk Radius": "12",
      "Days per Month": "9",
    },
  });
  await fs.writeFile(
    path.join(p.saves, `${inst.worldName}.vcdbs`),
    `# Placeholder save file for ${inst.worldName}. Real saves are SQLite (.vcdbs).\n`,
    "utf8",
  );

  // Backups index + a couple of placeholder archives
  const backups = [
    { id: "bk-auto-1", name: `auto-${inst.worldName}-daily`, kind: "auto", sizeBytes: 210 * 1024 * 1024, createdAt: now - 86400000, worldName: inst.worldName, note: "Legacy auto backup" },
    { id: "bk-manual-1", name: `manual-preupdate`, kind: "pre-update", sizeBytes: 205 * 1024 * 1024, createdAt: now - 3 * 86400000, worldName: inst.worldName, note: `Before ${DEFAULT_VINTAGE_STORY_VERSION} update` },
  ];
  await writeJson(path.join(p.backups, "index.json"), backups);

  // Sample logs
  await fs.writeFile(
    path.join(p.logs, "server-main.log"),
    [
      `${new Date(now - 5000).toISOString()} [Server Notification] Server startup complete.`,
      `${new Date(now - 4000).toISOString()} [Server Event] Loaded world '${inst.worldName}'.`,
      `${new Date(now - 3000).toISOString()} [Server Notification] Dedicated Server now running on Port ${inst.port}!`,
    ].join("\n") + "\n",
    "utf8",
  );

  // README + notes at the instance root
  await fs.writeFile(
    path.join(dir, "README.md"),
    `# ${inst.name}\n\n${inst.description ?? ""}\n\n- **Game:** Vintage Story ${inst.version}\n- **Port:** ${inst.port}\n- **Data path:** \`${inst.dataPath}\`\n- **World:** ${inst.worldName} (seed \`${inst.seed}\`)\n\nManaged by Slutvival Panel.\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(dir, "notes", "todo.md"),
    `# Notes — ${inst.name}\n\n- [ ] Review mod updates\n- [ ] Check temporal storm settings\n- [x] Set up rolling restore points\n`,
    "utf8",
  );
}
