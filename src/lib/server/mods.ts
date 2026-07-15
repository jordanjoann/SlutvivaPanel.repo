import fs from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { InstalledMod, ModSearchResult } from "@/lib/types";
import { FALLBACK_VINTAGE_STORY_VERSIONS } from "@/lib/vintage-story-versions";
import { vsPaths } from "./config";
import { consoleBus } from "./console-bus";

const MAX_MOD_ARCHIVE_BYTES = 256 * 1024 * 1024;
const MOD_DB_CDN_HOST = "moddbcdn.vintagestory.at";

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
  const temporary = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(mods, null, 2), "utf8");
  await fs.rename(temporary, file);
}

export async function listInstalled(serverId: string): Promise<InstalledMod[]> {
  const mods = await readManifest(serverId);
  const paths = vsPaths(serverId);
  const installed = await Promise.all(
    mods.map(async (mod) => {
      const fileName = safeArchiveFileName(mod.fileName ?? `${mod.id}_${mod.installedVersion}.zip`);
      if (!fileName) return null;
      const enabled = await fileExists(path.join(paths.mods, fileName));
      const disabled = await fileExists(path.join(paths.managedMods, fileName));
      return enabled || disabled ? { ...mod, fileName, enabled } : null;
    }),
  );
  return installed.filter((mod): mod is InstalledMod => mod !== null);
}

export async function setModEnabled(
  serverId: string,
  modId: string,
  enabled: boolean,
): Promise<InstalledMod | null> {
  const mods = await readManifest(serverId);
  const mod = mods.find((m) => m.id === modId);
  if (!mod) return null;
  const fileName = safeArchiveFileName(mod.fileName);
  if (!fileName) throw new Error(`Mod '${mod.name}' has an invalid archive name.`);

  const paths = vsPaths(serverId);
  const source = path.join(enabled ? paths.managedMods : paths.mods, fileName);
  const destinationDir = enabled ? paths.mods : paths.managedMods;
  const destination = path.join(destinationDir, fileName);
  if (!(await fileExists(source))) {
    if (!(await fileExists(destination))) {
      throw new Error(`Mod archive '${fileName}' is missing.`);
    }
  } else {
    await fs.mkdir(destinationDir, { recursive: true });
    await fs.rm(destination, { force: true });
    await fs.rename(source, destination);
  }

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
  const official = await fetchModById(mod.id);
  const version = official.latestVersion;
  await installResolvedMod(serverId, mods, mod, official, version);
  consoleBus.push(
    serverId,
    `Mod '${mod.name}' updated to ${version}. Active after the next restart.`,
    "system",
  );
  return mod;
}

export async function removeMod(
  serverId: string,
  modId: string,
): Promise<boolean> {
  const mods = await readManifest(serverId);
  const mod = mods.find((item) => item.id === modId);
  const next = mods.filter((item) => item.id !== modId);
  if (next.length === mods.length) return false;
  const fileName = safeArchiveFileName(mod?.fileName);
  if (fileName) await removeArchiveCopies(serverId, fileName);
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
  const official = await fetchModById(result.id);
  const existing = mods.find((m) => m.id === result.id);
  const mod = existing ?? {
    id: official.id,
    name: official.name,
    installedVersion: v,
    enabled: true,
    fileName: "",
  };
  if (!existing) mods.push(mod);
  await installResolvedMod(serverId, mods, mod, official, v);
  consoleBus.push(
    serverId,
    `Installed '${official.name}' v${v}. This mod will become active after the next restart.`,
    "system",
  );
  return mod;
}

/** Register a mod archive that was uploaded via drag-and-drop. */
export async function installFile(
  serverId: string,
  fileName: string,
): Promise<InstalledMod> {
  const safeFileName = safeArchiveFileName(fileName);
  if (!safeFileName) throw new Error("A valid .zip, .cs, or .dll mod file is required.");
  if (!(await fileExists(path.join(vsPaths(serverId).mods, safeFileName)))) {
    throw new Error(`Uploaded mod archive '${safeFileName}' was not found in the Mods directory.`);
  }

  const mods = await readManifest(serverId);
  const id = safeFileName.replace(/\.(zip|cs|dll)$/i, "").toLowerCase();
  const name = safeFileName
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
      fileName: safeFileName,
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

async function installResolvedMod(
  serverId: string,
  mods: InstalledMod[],
  mod: InstalledMod,
  official: ModSearchResult,
  version: string,
): Promise<void> {
  const release = official.versions.find((candidate) => candidate.version === version);
  if (!release?.downloadUrl) {
    throw new Error(`Vintage Story ModDB has no downloadable archive for ${official.name} v${version}.`);
  }

  const downloadUrl = officialModDownloadUrl(release.downloadUrl);
  const fileName = archiveFileName(downloadUrl, official.id, version);
  const previousFileName = safeArchiveFileName(mod.fileName);
  const enabled = mod.enabled !== false;
  const destinationDir = enabled ? vsPaths(serverId).mods : vsPaths(serverId).managedMods;
  await downloadModArchive(downloadUrl, destinationDir, fileName);
  if (previousFileName && previousFileName !== fileName) {
    await removeArchiveCopies(serverId, previousFileName);
  }

  Object.assign(mod, {
    id: official.id,
    name: official.name,
    author: official.author,
    description: official.summary,
    iconUrl: official.iconUrl,
    installedVersion: version,
    latestVersion: official.latestVersion,
    enabled,
    side: official.side,
    fileName,
    dependencies: official.dependencies,
  });
  await writeManifest(serverId, mods);
}

async function downloadModArchive(url: URL, destinationDir: string, fileName: string): Promise<void> {
  await fs.mkdir(destinationDir, { recursive: true });
  const destination = path.join(destinationDir, fileName);
  const temporary = path.join(destinationDir, `.${fileName}.${randomUUID()}.part`);
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/zip", "User-Agent": "Slutvival Panel Mod Installer" },
    redirect: "error",
  });
  if (!response.ok || !response.body) {
    throw new Error(`Mod archive download failed: ${response.status} ${response.statusText}`);
  }

  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_MOD_ARCHIVE_BYTES) {
    throw new Error("Mod archive exceeds the 256 MiB download limit.");
  }

  let handle: FileHandle | undefined;
  try {
    handle = await fs.open(temporary, "wx");
    const reader = response.body.getReader();
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_MOD_ARCHIVE_BYTES) {
        await reader.cancel();
        throw new Error("Mod archive exceeds the 256 MiB download limit.");
      }
      await handle.write(value);
    }
    await handle.sync();
    await handle.close();
    handle = undefined;
    await assertZipArchive(temporary);
    await fs.rename(temporary, destination);
  } catch (error) {
    await handle?.close().catch(() => {});
    await fs.rm(temporary, { force: true });
    throw error;
  }
}

async function assertZipArchive(file: string): Promise<void> {
  const handle = await fs.open(file, "r");
  try {
    const header = Buffer.alloc(4);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead < 4 || header[0] !== 0x50 || header[1] !== 0x4b) {
      throw new Error("Downloaded mod is not a valid ZIP archive.");
    }
  } finally {
    await handle.close();
  }
}

async function removeArchiveCopies(serverId: string, fileName: string): Promise<void> {
  const paths = vsPaths(serverId);
  await Promise.all([
    fs.rm(path.join(paths.mods, fileName), { force: true }),
    fs.rm(path.join(paths.managedMods, fileName), { force: true }),
  ]);
}

function officialModDownloadUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== MOD_DB_CDN_HOST) {
    throw new Error("ModDB returned an untrusted archive URL.");
  }
  return url;
}

function archiveFileName(url: URL, modId: string, version: string): string {
  const requestedName = url.searchParams.get("dl");
  return safeArchiveFileName(requestedName) ?? `${safeToken(modId)}_${safeToken(version)}.zip`;
}

function safeArchiveFileName(value?: string | null): string | null {
  if (!value) return null;
  const base = path.basename(value);
  if (base !== value || !/^[a-z0-9][a-z0-9._+ -]*\.(zip|cs|dll)$/i.test(base)) return null;
  return base;
}

function safeToken(value: string): string {
  const token = value.trim().replace(/[^a-z0-9._-]+/gi, "-");
  if (!token) throw new Error("Invalid mod identifier or version.");
  return token;
}

async function fileExists(file: string): Promise<boolean> {
  try {
    return (await fs.stat(file)).isFile();
  } catch {
    return false;
  }
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

async function fetchModById(id: string): Promise<ModSearchResult> {
  const safeId = safeToken(id).toLowerCase();
  const detail = await fetchJson<ModDbDetailResponse>(
    `${MOD_DB_API_BASE}/mod/${encodeURIComponent(safeId)}`,
  );
  const result = detail.mod ? mapModDbResult(detail.mod) : null;
  if (!result) throw new Error(`Mod '${id}' was not found in Vintage Story ModDB.`);
  return { ...result, id: safeId };
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
