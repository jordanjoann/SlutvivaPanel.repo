import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { InstalledMod, ModSearchResult } from "@/lib/types";
import { FALLBACK_VINTAGE_STORY_VERSIONS } from "@/lib/vintage-story-versions";
import { vsPaths } from "./config";
import { consoleBus } from "./console-bus";

function manifestPath(serverId: string): string {
  return path.join(vsPaths(serverId).modConfig, "panel-mods.json");
}

async function readManifest(serverId: string): Promise<InstalledMod[]> {
  const file = manifestPath(serverId);
  if (existsSync(file)) {
    try {
      return JSON.parse(await fs.readFile(file, "utf8")) as InstalledMod[];
    } catch {
      /* fall through to disk scan */
    }
  }
  // Fall back to scanning the Mods directory for archives.
  const modsDir = vsPaths(serverId).mods;
  if (!existsSync(modsDir)) return [];
  const files = await fs.readdir(modsDir).catch(() => []);
  return files
    .filter((f) => /\.(zip|cs|dll)$/i.test(f))
    .map((f) => ({
      id: f.replace(/\.(zip|cs|dll)$/i, "").toLowerCase(),
      name: f.replace(/\.(zip|cs|dll)$/i, ""),
      installedVersion: "unknown",
      enabled: true,
      fileName: f,
      side: "Universal" as const,
    }));
}

async function writeManifest(serverId: string, mods: InstalledMod[]) {
  const file = manifestPath(serverId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(mods, null, 2), "utf8");
}

export async function listInstalled(serverId: string): Promise<InstalledMod[]> {
  const mods = await readManifest(serverId);
  return mods.map((m) => ({
    ...m,
    fileName: m.fileName ?? `${m.id}_${m.installedVersion}.zip`,
  }));
}

export async function setModEnabled(
  serverId: string,
  modId: string,
  enabled: boolean,
): Promise<InstalledMod | null> {
  const mods = await readManifest(serverId);
  const mod = mods.find((m) => m.id === modId);
  if (!mod) return null;
  mod.enabled = enabled;
  await writeManifest(serverId, mods);
  consoleBus.push(
    serverId,
    `Mod '${mod.name}' ${enabled ? "enabled" : "disabled"} (active after restart).`,
    "system",
  );
  return mod;
}

export async function updateMod(
  serverId: string,
  modId: string,
): Promise<InstalledMod | null> {
  const mods = await readManifest(serverId);
  const mod = mods.find((m) => m.id === modId);
  if (!mod) return null;
  if (mod.latestVersion) mod.installedVersion = mod.latestVersion;
  await writeManifest(serverId, mods);
  consoleBus.push(
    serverId,
    `Mod '${mod.name}' updated to ${mod.installedVersion}.`,
    "system",
  );
  return mod;
}

export async function removeMod(
  serverId: string,
  modId: string,
): Promise<boolean> {
  const mods = await readManifest(serverId);
  const next = mods.filter((m) => m.id !== modId);
  if (next.length === mods.length) return false;
  await writeManifest(serverId, next);
  consoleBus.push(serverId, `Mod '${modId}' removed.`, "system");
  return true;
}

export async function installMod(
  serverId: string,
  result: ModSearchResult,
  version?: string,
): Promise<InstalledMod> {
  const mods = await readManifest(serverId);
  const v = version ?? result.latestVersion;
  const existing = mods.find((m) => m.id === result.id);
  if (existing) {
    existing.installedVersion = v;
    existing.enabled = true;
  } else {
    mods.push({
      id: result.id,
      name: result.name,
      author: result.author,
      description: result.summary,
      iconUrl: result.iconUrl,
      installedVersion: v,
      latestVersion: result.latestVersion,
      enabled: true,
      side: result.side,
      fileName: `${result.id}_${v}.zip`,
      dependencies: result.dependencies,
    });
  }
  await writeManifest(serverId, mods);
  consoleBus.push(
    serverId,
    `Installed '${result.name}' v${v}. This mod will become active after the next restart.`,
    "system",
  );
  return mods.find((m) => m.id === result.id)!;
}

/** Register a mod archive that was uploaded via drag-and-drop. */
export async function installFile(
  serverId: string,
  fileName: string,
): Promise<InstalledMod> {
  const mods = await readManifest(serverId);
  const id = fileName.replace(/\.(zip|cs|dll)$/i, "").toLowerCase();
  const name = fileName
    .replace(/\.(zip|cs|dll)$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const existing = mods.find((m) => m.id === id);
  if (!existing) {
    mods.push({
      id,
      name,
      installedVersion: "manual",
      enabled: true,
      fileName,
      side: "Universal",
    });
    await writeManifest(serverId, mods);
  }
  consoleBus.push(
    serverId,
    `Installed mod archive '${fileName}'. Active after the next restart.`,
    "system",
  );
  return mods.find((m) => m.id === id)!;
}

/* ------------------------------------------------------------------ */
/* Vintage Story Mod Database                                         */
/* ------------------------------------------------------------------ */

const MOD_DB_API_BASE = "https://mods.vintagestory.at/api";
const MOD_DB_RESULT_LIMIT = 24;

interface ModDbListResponse {
  mods?: ModDbListItem[];
}

interface ModDbDetailResponse {
  mod?: ModDbDetail;
}

interface ModDbListItem {
  modid?: number | string;
  assetid?: number | string;
  downloads?: number | string;
  follows?: number | string;
  name?: string;
  summary?: string;
  modidstrs?: string[];
  author?: string;
  side?: string;
  logo?: string | null;
  tags?: string[];
  lastreleased?: string;
}

interface ModDbDetail extends ModDbListItem {
  text?: string;
  releases?: ModDbRelease[];
}

interface ModDbRelease {
  releaseid?: number | string;
  mainfile?: string;
  fileid?: number | string;
  downloads?: number | string;
  tags?: string[];
  modidstr?: string;
  modversion?: string;
  created?: string;
}

export async function searchModDatabase(query: string): Promise<ModSearchResult[]> {
  try {
    return await fetchModDatabase(query);
  } catch {
    return searchCatalog(query);
  }
}

async function fetchModDatabase(query: string): Promise<ModSearchResult[]> {
  const params = new URLSearchParams({
    orderby: "lastreleased",
    orderdirection: "desc",
  });
  const q = query.trim();
  if (q) params.set("text", q);

  const list = await fetchJson<ModDbListResponse>(`${MOD_DB_API_BASE}/mods?${params}`);
  const mods = (list.mods ?? []).slice(0, MOD_DB_RESULT_LIMIT);

  const results = await Promise.all(
    mods.map(async (mod) => {
      const id = modId(mod);
      if (!id) return null;

      try {
        const detail = await fetchJson<ModDbDetailResponse>(
          `${MOD_DB_API_BASE}/mod/${encodeURIComponent(id)}`,
        );
        return mapModDbResult({ ...mod, ...detail.mod });
      } catch {
        return mapModDbResult(mod);
      }
    }),
  );

  return results.filter((result): result is ModSearchResult => result !== null);
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "User-Agent": "Slutvival Panel Mod Browser",
    },
  });
  if (!res.ok) throw new Error(`Mod Database request failed: ${res.status}`);
  return (await res.json()) as T;
}

function mapModDbResult(mod: ModDbDetail): ModSearchResult | null {
  const id = modId(mod);
  const name = mod.name?.trim();
  if (!id || !name) return null;

  const versions = mapVersions(mod.releases, mod.lastreleased);
  const latestVersion = versions[0]?.version ?? "latest";

  return {
    id,
    name,
    author: mod.author,
    summary: mod.summary?.trim() || stripHtml(mod.text) || "No description available.",
    iconUrl: mod.logo ?? undefined,
    downloads: toNumber(mod.downloads),
    follows: toNumber(mod.follows),
    side: mapSide(mod.side),
    latestVersion,
    tags: (mod.tags ?? []).filter(Boolean),
    versions,
  };
}

function mapVersions(releases?: ModDbRelease[], lastReleased?: string): ModSearchResult["versions"] {
  const mapped = (releases ?? [])
    .filter((release) => release.modversion)
    .map((release) => ({
      version: release.modversion!,
      releasedAt: parseModDbDate(release.created),
      gameVersions: release.tags ?? [],
      downloadUrl: release.mainfile,
      fileId: release.fileid === undefined ? undefined : String(release.fileid),
    }));

  if (mapped.length > 0) return mapped;

  return [
    {
      version: "latest",
      releasedAt: parseModDbDate(lastReleased),
      gameVersions: [],
    },
  ];
}

function modId(mod: ModDbListItem): string | undefined {
  const id = mod.modidstrs?.find(Boolean) ?? mod.modid;
  if (id === undefined || id === null) return undefined;
  return String(id).trim().toLowerCase();
}

function mapSide(side?: string): ModSearchResult["side"] {
  switch (side?.toLowerCase()) {
    case "client":
      return "Client";
    case "server":
      return "Server";
    case "both":
      return "Universal";
    default:
      return undefined;
  }
}

function parseModDbDate(value?: string): number {
  if (!value) return Date.now();
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function stripHtml(value?: string): string | undefined {
  const text = value
    ?.replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

function toNumber(value?: number | string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/* ------------------------------------------------------------------ */
/* Offline fallback catalog                                           */
/* ------------------------------------------------------------------ */

const now = Date.now();
const day = 86400000;
const FALLBACK_MOD_GAME_VERSIONS = FALLBACK_VINTAGE_STORY_VERSIONS.slice(0, 3).map(
  (version) => version.version,
);

export const MOD_CATALOG: ModSearchResult[] = [
  { id: "prospectorinfo", name: "Prospector Info", author: "JakeCool19", summary: "Displays propick reading results as an on-screen overlay.", downloads: 812345, follows: 4210, side: "Universal", latestVersion: "4.7.0", tags: ["QoL", "Prospecting"], versions: v(["4.7.0", "4.6.0", "4.5.0", "4.4.0"]) },
  { id: "carrycapacity", name: "Carry Capacity", author: "Zdena", summary: "Pick up and carry blocks, chests, crates and more.", downloads: 640221, follows: 3890, side: "Universal", latestVersion: "0.7.3", tags: ["QoL"], versions: v(["0.7.3", "0.7.2", "0.7.0"]) },
  { id: "xskills", name: "XSkills", author: "Xenophps", summary: "Adds an RPG-like skill and ability progression system.", downloads: 934120, follows: 6120, side: "Universal", latestVersion: "0.8.9", tags: ["Gameplay", "RPG"], versions: v(["0.8.9", "0.8.7", "0.8.5"]), dependencies: [{ modId: "xlib", version: ">=0.8.0", satisfied: false }] },
  { id: "xlib", name: "XLib", author: "Xenophps", summary: "Shared library required by XSkills and related mods.", downloads: 951002, follows: 2100, side: "Universal", latestVersion: "0.8.9", tags: ["Library"], versions: v(["0.8.9", "0.8.7"]) },
  { id: "medievalexpansion", name: "Medieval Expansion", author: "Novocain", summary: "Adds medieval blocks, mechanics, mobs and structures.", downloads: 588930, follows: 3320, side: "Universal", latestVersion: "3.11.0", tags: ["Content"], versions: v(["3.11.0", "3.10.0"]) },
  { id: "primitivesurvival", name: "Primitive Survival", author: "SpearAndFang", summary: "Trapping, fishing, tanning and primitive technology.", downloads: 701233, follows: 4530, side: "Universal", latestVersion: "3.6.0", tags: ["Content", "Survival"], versions: v(["3.6.0", "3.5.1", "3.5.0"]) },
  { id: "wildcraft", name: "Wildcraft: Fruits & Nuts", author: "Cheekygamer", summary: "Adds dozens of wild edible plants, fruits and trees.", downloads: 420981, follows: 2870, side: "Universal", latestVersion: "1.4.2", tags: ["Content", "Farming"], versions: v(["1.4.2", "1.4.0"]) },
  { id: "necessaries", name: "Necessaries", author: "Craluminum", summary: "Small quality-of-life tweaks and utility blocks.", downloads: 210344, follows: 1560, side: "Universal", latestVersion: "1.2.4", tags: ["QoL"], versions: v(["1.2.4", "1.2.0"]) },
  { id: "petai", name: "Pet AI", author: "JujuTheBear", summary: "Tameable and breedable animals with improved AI.", downloads: 355900, follows: 3010, side: "Universal", latestVersion: "1.8.6", tags: ["Content", "Animals"], versions: v(["1.8.6", "1.8.4"]) },
  { id: "th3essentials", name: "TH3 Essentials", author: "Th3Dilli", summary: "Home teleport, back command, RTP and admin utilities.", downloads: 288120, follows: 1980, side: "Server", latestVersion: "2.4.1", tags: ["Admin", "Utility"], versions: v(["2.4.1", "2.4.0"]) },
];

function v(versions: string[]) {
  return versions.map((version, i) => ({
    version,
    releasedAt: now - (i + 1) * 21 * day,
    gameVersions: FALLBACK_MOD_GAME_VERSIONS,
  }));
}

export function searchCatalog(query: string): ModSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return MOD_CATALOG;
  return MOD_CATALOG.filter(
    (m) =>
      m.name.toLowerCase().includes(q) ||
      m.id.includes(q) ||
      (m.author ?? "").toLowerCase().includes(q) ||
      (m.summary ?? "").toLowerCase().includes(q) ||
      (m.tags ?? []).some((t) => t.toLowerCase().includes(q)),
  );
}

export function getCatalogMod(id: string): ModSearchResult | undefined {
  return MOD_CATALOG.find((m) => m.id === id);
}
