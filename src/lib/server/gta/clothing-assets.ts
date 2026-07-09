import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import {
  CLOTHING_TARGETS,
  clothingTargetMeta,
  isClothingTarget,
  type ClothingAsset,
  type ClothingDecision,
  type ClothingFileCounts,
  type ClothingInstallGroup,
  type ClothingLibraryPayload,
  type ClothingTarget,
} from "@/lib/gta-clothing";
import { gameRoot } from "@/lib/server/config";

type ArchiveEntry = {
  path: string;
  extension: string;
};

type AssetCandidate = Omit<ClothingAsset, "previewUrl" | "decision"> & {
  sourceType: "archive" | "stream";
  archivePath: string | null;
  previewEntry: string | null;
  previewPath: string | null;
};

type ClothingManifest = {
  version: 1;
  updatedAt: number;
  decisions: Record<string, ClothingDecision>;
};

export type ClothingUploadResult = {
  fileName: string;
  relativePath: string;
  size: number;
};

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"]);
const COMPONENT_NAMES = new Set([
  "accs",
  "berd",
  "decl",
  "feet",
  "hair",
  "hand",
  "head",
  "jbib",
  "lowr",
  "p_ears",
  "p_eyes",
  "p_head",
  "p_lwrist",
  "p_rwrist",
  "task",
  "teef",
  "uppr",
]);

export const CLOTHING_ASSET_ROOT = path.join(
  gameRoot("gta"),
  "MODS",
  "CharacterCreation",
);
export const CLOTHING_STREAM_ROOT = path.join(
  gameRoot("gta"),
  "los-santos",
  "server-data",
  "resources",
  "[mods]",
  "slutvival-clothing",
  "stream",
);
export const CLOTHING_RENDER_ROOT = path.join(
  gameRoot("gta"),
  "los-santos",
  "server-data",
  "resources",
  "[mods]",
  "slutvival-clothing-audit",
  "data",
  "asset-renders",
);
export const CLOTHING_MANIFEST_PATH = path.join(
  CLOTHING_ASSET_ROOT,
  "clothing-organizer.json",
);
export const CLOTHING_UPLOAD_DIR = path.join(CLOTHING_ASSET_ROOT, "Inbox");

export async function listClothingLibrary(
  previewUrlFor: (assetId: string) => string | null = () => null,
): Promise<ClothingLibraryPayload> {
  const [assets, manifest] = await Promise.all([
    listAssetCandidates(),
    loadClothingManifest(),
  ]);

  const items: ClothingAsset[] = assets.map((asset) => ({
    id: asset.id,
    name: asset.name,
    relativePath: asset.relativePath,
    sourceFolder: asset.sourceFolder,
    sourceCategory: asset.sourceCategory,
    fileCounts: asset.fileCounts,
    componentHints: asset.componentHints,
    suggestedTarget: asset.suggestedTarget,
    previewMimeType: asset.previewMimeType,
    previewUrl: asset.previewEntry ? previewUrlFor(asset.id) : null,
    decision: manifest.decisions[asset.id],
  }));

  return {
    items,
    totals: summarizeClothingAssets(items),
    manifestPath: CLOTHING_MANIFEST_PATH,
    assetRoot: CLOTHING_ASSET_ROOT,
  };
}

export async function readClothingPreview(assetId: string) {
  const assets = await listAssetCandidates();
  const asset = assets.find((candidate) => candidate.id === assetId);
  if (!asset || !asset.previewEntry || !asset.previewMimeType) return null;

  if (asset.sourceType === "stream" && asset.previewPath) {
    return {
      body: await fs.readFile(asset.previewPath),
      mimeType: asset.previewMimeType,
    };
  }

  if (!asset.archivePath) return null;
  return {
    body: await unzipEntryBuffer(asset.archivePath, asset.previewEntry),
    mimeType: asset.previewMimeType,
  };
}

export async function saveClothingDecision(
  assetId: string,
  target: ClothingTarget,
  notes?: string,
): Promise<ClothingDecision> {
  const assets = await listAssetCandidates();
  const asset = assets.find((candidate) => candidate.id === assetId);
  if (!asset) throw new Error(`Unknown clothing asset '${assetId}'`);

  const manifest = await loadClothingManifest();
  const targetMeta = clothingTargetMeta(target);
  const decision: ClothingDecision = {
    assetId,
    assetRelativePath: asset.relativePath,
    target,
    installGroup: targetMeta.installGroup,
    decidedAt: Date.now(),
    ...(notes?.trim() ? { notes: notes.trim() } : {}),
  };

  manifest.decisions[assetId] = decision;
  manifest.updatedAt = Date.now();
  await saveClothingManifest(manifest);
  return decision;
}

export async function clearClothingDecision(assetId: string): Promise<void> {
  const manifest = await loadClothingManifest();
  delete manifest.decisions[assetId];
  manifest.updatedAt = Date.now();
  await saveClothingManifest(manifest);
}

export async function resolveClothingUploadPath(
  originalName: string,
): Promise<{ fileName: string; absolutePath: string; relativePath: string }> {
  const fileName = sanitizeZipFileName(originalName);
  await fs.mkdir(CLOTHING_UPLOAD_DIR, { recursive: true });

  const parsed = path.parse(fileName);
  let candidate = fileName;
  let index = 2;
  while (await exists(path.join(CLOTHING_UPLOAD_DIR, candidate))) {
    candidate = `${parsed.name}-${index}${parsed.ext}`;
    index += 1;
  }

  const absolutePath = path.join(CLOTHING_UPLOAD_DIR, candidate);
  return {
    fileName: candidate,
    absolutePath,
    relativePath: toPosixRelative(absolutePath),
  };
}

export function inferClothingTarget(
  relativePath: string,
  entries: string[],
): ClothingTarget {
  const lowerPath = relativePath.toLowerCase();
  const name = path.basename(relativePath, path.extname(relativePath)).toLowerCase();
  const components = componentHintsFromEntries(entries);

  if (lowerPath.includes("/socks/") || name.includes("sock") || name.includes("stocking")) {
    return "socks";
  }
  if (lowerPath.includes("/hats/") || lowerPath.includes("/helmets/") || components.includes("p_head") || name.includes("hat") || name.includes("helmet")) {
    return "hat";
  }
  if (lowerPath.includes("/glasses/") || components.includes("p_eyes") || name.includes("glasses") || name.includes("sunglasses")) {
    return "glasses";
  }
  if (lowerPath.includes("/ears/") || components.includes("p_ears") || name.includes("earring") || name.includes("earrings")) {
    return "ears";
  }
  if (lowerPath.includes("/watches/") || components.includes("p_lwrist") || name.includes("watch")) {
    return "watches";
  }
  if (lowerPath.includes("/bracelets/") || components.includes("p_rwrist") || name.includes("bracelet") || name.includes("bangle")) {
    return "bracelets";
  }
  if (lowerPath.includes("/shoes/") || components.includes("feet")) {
    return "shoes";
  }
  if (lowerPath.includes("/undershirts/") || name.includes("undershirt") || name.includes("tshirt") || name.includes("t-shirt")) {
    return "undershirt";
  }
  if (lowerPath.includes("/body types/") || name.includes("body")) {
    return "body";
  }
  if (lowerPath.includes("/masks/") || components.includes("berd") || name.includes("mask")) {
    return "mask";
  }
  if (lowerPath.includes("/hair/") || components.includes("hair")) {
    return "hair";
  }
  if (lowerPath.includes("/armor/") || lowerPath.includes("/body armor/") || components.includes("task")) {
    return "armor";
  }
  if (lowerPath.includes("/decals/") || components.includes("decl")) {
    return "decals";
  }
  if (lowerPath.includes("/pants_skirts/") || components.includes("lowr")) {
    if (name.includes("skirt")) return "skirt";
    return "pants";
  }
  if (name.includes("skirt")) return "skirt";
  if (lowerPath.includes("/tops_dresses/") || components.includes("jbib")) {
    if (name.includes("dress")) return "dress";
    if (name.includes("jacket") || name.includes("coat")) return "jacket";
    return "shirt";
  }
  if (lowerPath.includes("/backpacks/") || isBackpackName(name) || components.includes("hand")) {
    return "backpack";
  }
  if (lowerPath.includes("/accessories/") || components.some(isAccessoryComponent)) {
    return "accessory";
  }
  if (components.includes("uppr")) return "body";

  return "maybe";
}

export function componentHintsFromEntries(entries: string[]): string[] {
  const hints = new Set<string>();
  for (const entry of entries) {
    const basename = path.posix.basename(entry).toLowerCase();
    const componentSide = basename.includes("^") ? basename.split("^").pop() ?? basename : basename;
    const withoutModel = componentSide.replace(/^mp_[fm]_freemode_01_/, "");
    const match = withoutModel.match(/^(p_[a-z]+|[a-z]+)_/);
    if (match && COMPONENT_NAMES.has(match[1])) hints.add(match[1]);
  }
  return [...hints].sort();
}

export function previewEntryFromEntries(entries: string[], assetName: string): string | null {
  const normalizedName = normalizeComparable(assetName);
  const candidates = entries
    .map((entry) => ({ entry, extension: path.posix.extname(entry).toLowerCase() }))
    .filter((entry) => IMAGE_EXTENSIONS.has(entry.extension));

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const aScore = previewScore(a.entry, normalizedName);
    const bScore = previewScore(b.entry, normalizedName);
    if (aScore !== bScore) return bScore - aScore;
    return a.entry.localeCompare(b.entry);
  });

  return candidates[0].entry;
}

async function listAssetCandidates(): Promise<AssetCandidate[]> {
  const [archivePaths, streamAssets] = await Promise.all([
    findZipArchives(CLOTHING_ASSET_ROOT),
    listStreamAssetCandidates(),
  ]);
  const archiveAssets = await Promise.all(
    archivePaths.map(async (archivePath) => buildArchiveAssetCandidate(archivePath)),
  );
  const assets = [...archiveAssets, ...streamAssets];

  return assets.sort((a, b) => {
    const category = a.sourceCategory.localeCompare(b.sourceCategory);
    if (category !== 0) return category;
    return a.name.localeCompare(b.name);
  });
}

async function buildArchiveAssetCandidate(archivePath: string): Promise<AssetCandidate> {
  const relativePath = toPosixRelative(archivePath);
  const entries = await listArchiveEntries(archivePath);
  const assetName = path.basename(archivePath, path.extname(archivePath)).replace(/[_-]+/g, " ");
  const previewEntry = previewEntryFromEntries(entries.map((entry) => entry.path), assetName);

  return {
    id: clothingAssetId(relativePath),
    name: assetName,
    sourceType: "archive",
    archivePath,
    relativePath,
    sourceFolder: path.posix.dirname(relativePath),
    sourceCategory: sourceCategoryFromPath(relativePath),
    fileCounts: countArchiveFiles(entries),
    componentHints: componentHintsFromEntries(entries.map((entry) => entry.path)),
    suggestedTarget: inferClothingTarget(relativePath, entries.map((entry) => entry.path)),
    previewEntry,
    previewPath: null,
    previewMimeType: previewEntry ? contentTypeForPath(previewEntry) : null,
  };
}

async function listStreamAssetCandidates(): Promise<AssetCandidate[]> {
  if (!(await exists(CLOTHING_STREAM_ROOT))) return [];

  const entries = await findStreamAssetFiles(CLOTHING_STREAM_ROOT);
  const groups = new Map<string, ArchiveEntry[]>();
  for (const entry of entries) {
    const key = streamAssetKey(entry.path);
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }

  return Promise.all(
    [...groups.entries()].map(([key, entries]) => buildStreamAssetCandidate(key, entries)),
  );
}

async function buildStreamAssetCandidate(key: string, entries: ArchiveEntry[]): Promise<AssetCandidate> {
  const entryPaths = entries.map((entry) => entry.path);
  const assetName = key.replace(/[_-]+/g, " ");
  const relativePath = `Installed/slutvival-clothing/stream/${key}`;
  const generatedPreviewPath = await existingRenderPreviewPath(key);
  const embeddedPreviewEntry = previewEntryFromEntries(entryPaths, assetName);
  const previewEntry = generatedPreviewPath
    ? path.posix.join("asset-renders", path.basename(generatedPreviewPath))
    : embeddedPreviewEntry;

  return {
    id: clothingAssetId(relativePath),
    name: assetName,
    sourceType: "stream",
    archivePath: null,
    relativePath,
    sourceFolder: "Installed/slutvival-clothing/stream",
    sourceCategory: "Installed / slutvival clothing",
    fileCounts: countArchiveFiles(entries),
    componentHints: componentHintsFromEntries(entryPaths),
    suggestedTarget: inferClothingTarget(relativePath, entryPaths),
    previewEntry,
    previewPath: generatedPreviewPath ?? (embeddedPreviewEntry ? path.join(CLOTHING_STREAM_ROOT, embeddedPreviewEntry) : null),
    previewMimeType: previewEntry ? contentTypeForPath(previewEntry) : null,
  };
}

async function existingRenderPreviewPath(key: string): Promise<string | null> {
  const renderPath = path.join(CLOTHING_RENDER_ROOT, `${renderFileNameForStreamKey(key)}.png`);
  return (await exists(renderPath)) ? renderPath : null;
}

function renderFileNameForStreamKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

async function findStreamAssetFiles(root: string, prefix = ""): Promise<ArchiveEntry[]> {
  const entries = await fs.readdir(path.join(root, prefix), { withFileTypes: true });
  const files: ArchiveEntry[] = [];

  for (const entry of entries) {
    const relativePath = prefix ? path.posix.join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await findStreamAssetFiles(root, relativePath)));
      continue;
    }
    if (!entry.isFile()) continue;

    const extension = clothingAssetExtension(entry.name);
    if (
      extension === ".ydd" ||
      extension === ".ydd.xml" ||
      extension === ".ytd" ||
      extension === ".ytd.xml" ||
      IMAGE_EXTENSIONS.has(extension)
    ) {
      files.push({ path: relativePath, extension });
    }
  }

  return files;
}

async function findZipArchives(root: string): Promise<string[]> {
  if (!(await exists(root))) return [];

  const out: string[] = [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await findZipArchives(absolutePath)));
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".zip")) {
      out.push(absolutePath);
    }
  }
  return out;
}

async function listArchiveEntries(archivePath: string): Promise<ArchiveEntry[]> {
  const output = await execFileText("unzip", ["-Z1", archivePath], 1024 * 1024 * 4);
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((entry) => !entry.endsWith("/"))
    .map((entry) => ({
      path: entry,
      extension: path.posix.extname(entry).toLowerCase(),
    }));
}

function countArchiveFiles(entries: ArchiveEntry[]): ClothingFileCounts {
  const counts: ClothingFileCounts = {
    drawables: 0,
    textures: 0,
    images: 0,
    other: 0,
  };

  for (const entry of entries) {
    if (entry.extension === ".ydd" || entry.extension === ".ydd.xml") counts.drawables += 1;
    else if (entry.extension === ".ytd" || entry.extension === ".ytd.xml") counts.textures += 1;
    else if (IMAGE_EXTENSIONS.has(entry.extension)) counts.images += 1;
    else counts.other += 1;
  }

  return counts;
}

async function loadClothingManifest(): Promise<ClothingManifest> {
  try {
    const raw = await fs.readFile(CLOTHING_MANIFEST_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<ClothingManifest>;
    const decisions: Record<string, ClothingDecision> = {};

    for (const [assetId, decision] of Object.entries(parsed.decisions ?? {})) {
      if (!decision || !isClothingTarget(decision.target)) continue;
      const installGroup = isKnownInstallGroup(decision.installGroup)
        ? decision.installGroup
        : clothingTargetMeta(decision.target).installGroup;
      decisions[assetId] = {
        assetId,
        assetRelativePath: decision.assetRelativePath,
        target: decision.target,
        installGroup,
        decidedAt: Number(decision.decidedAt) || Date.now(),
        ...(decision.notes ? { notes: String(decision.notes) } : {}),
      };
    }

    return {
      version: 1,
      updatedAt: Number(parsed.updatedAt) || Date.now(),
      decisions,
    };
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      return { version: 1, updatedAt: Date.now(), decisions: {} };
    }
    throw error;
  }
}

async function saveClothingManifest(manifest: ClothingManifest): Promise<void> {
  await fs.mkdir(CLOTHING_ASSET_ROOT, { recursive: true });
  const tempPath = `${CLOTHING_MANIFEST_PATH}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, CLOTHING_MANIFEST_PATH);
}

function summarizeClothingAssets(items: ClothingAsset[]) {
  const byTarget: Partial<Record<ClothingTarget, number>> = {};
  let reviewed = 0;

  for (const item of items) {
    if (!item.decision) continue;
    reviewed += 1;
    byTarget[item.decision.target] = (byTarget[item.decision.target] ?? 0) + 1;
  }

  return {
    total: items.length,
    reviewed,
    remaining: Math.max(0, items.length - reviewed),
    byTarget,
  };
}

function clothingAssetId(relativePath: string): string {
  return crypto.createHash("sha1").update(relativePath).digest("hex").slice(0, 16);
}

function streamAssetKey(fileName: string): string {
  const stem = path.basename(fileName, path.extname(fileName));
  const leftSide = stem.split("^")[0] ?? stem;
  const withoutModel = leftSide
    .replace(/^mp_[fm]_freemode_01_/, "")
    .replace(/^mp_[fm]_freemode_01$/, "freemode");
  const base = withoutModel || leftSide || stem;
  return base
    .replace(/_diff_\d{3}(?:_[a-z])?(?:_[a-z]+)?$/i, "")
    .replace(/_\d{3}(?:_[a-z])?(?:_[a-z]+)?$/i, "");
}

function sourceCategoryFromPath(relativePath: string): string {
  const parts = relativePath.split("/");
  if (parts[0] === "Femme" && parts[1]) return `Femme / ${parts[1].replace(/_/g, " ")}`;
  if (parts[0]) return parts[0].replace(/_/g, " ");
  return "Unsorted";
}

function toPosixRelative(absolutePath: string): string {
  return path.relative(CLOTHING_ASSET_ROOT, absolutePath).split(path.sep).join("/");
}

function contentTypeForPath(filePath: string): string {
  switch (path.posix.extname(filePath).toLowerCase()) {
    case ".gif":
      return "image/gif";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".bmp":
      return "image/bmp";
    default:
      return "image/png";
  }
}

function clothingAssetExtension(fileName: string): string {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".ydd.xml")) return ".ydd.xml";
  if (lowerName.endsWith(".ytd.xml")) return ".ytd.xml";
  return path.extname(fileName).toLowerCase();
}

function previewScore(entry: string, normalizedName: string): number {
  const basename = path.posix.basename(entry, path.posix.extname(entry));
  const normalizedEntry = normalizeComparable(basename);
  const depth = entry.split("/").length - 1;
  let score = 100 - depth * 6;
  if (normalizedEntry === normalizedName) score += 80;
  if (normalizedEntry.includes(normalizedName) || normalizedName.includes(normalizedEntry)) {
    score += 40;
  }
  if (entry.toLowerCase().endsWith(".gif")) score += 12;
  if (entry.toLowerCase().endsWith(".png")) score += 8;
  return score;
}

function normalizeComparable(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isAccessoryComponent(component: string): boolean {
  return component === "accs" || component === "teef";
}

function isBackpackName(name: string): boolean {
  return (
    name.includes("backpack") ||
    name.includes("bag") ||
    name.includes("satchel") ||
    name.includes("duffel")
  );
}

function sanitizeZipFileName(originalName: string): string {
  const basename = path.basename(originalName).replace(/[^a-zA-Z0-9._ -]+/g, "_").trim();
  const candidate = basename || "clothing-asset.zip";
  if (!candidate.toLowerCase().endsWith(".zip")) {
    throw new Error("Only .zip clothing archives can be uploaded");
  }
  return candidate;
}

function isKnownInstallGroup(value: unknown): value is ClothingInstallGroup {
  return (
    typeof value === "string" &&
    CLOTHING_TARGETS.some((target) => target.installGroup === value)
  );
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function execFileText(
  file: string,
  args: string[],
  maxBuffer: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { maxBuffer }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${file} ${args.join(" ")} failed: ${stderr || error.message}`));
        return;
      }
      resolve(stdout);
    });
  });
}

function unzipEntryBuffer(archivePath: string, entry: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      "unzip",
      ["-p", archivePath, entry],
      { encoding: "buffer", maxBuffer: 1024 * 1024 * 64 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`unzip preview failed: ${String(stderr) || error.message}`));
          return;
        }
        resolve(Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout));
      },
    );
  });
}

function isNodeError(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === code
  );
}
