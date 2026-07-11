import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import {
  CLOTHING_TARGETS,
  clothingTargetMeta,
  isClothingTarget,
  isSortableClothingTarget,
  type ClothingAsset,
  type ClothingDecision,
  type ClothingFileCounts,
  type ClothingGender,
  type ClothingInstallGroup,
  type ClothingLibraryPayload,
  type ClothingRendererState,
  type ClothingTarget,
} from "@/lib/gta-clothing";
import { gameRoot } from "@/lib/server/config";

export type ArchiveEntry = {
  path: string;
  extension: string;
};

type AssetCandidate = Omit<
  ClothingAsset,
  "previewUrl" | "previewVariants" | "previewMimeType" | "renderStatus" | "renderError" | "decision"
> & {
  sourceType: "archive" | "native" | "stream" | "loose";
  archivePath: string | null;
  previewEntry: string | null;
  legacyDecisionIds: string[];
};

type NativeClothingIndex = {
  version: 1;
  archiveRelativePath: string;
  items: NativeClothingIndexItem[];
};

type NativeClothingIndexItem = {
  id: string;
  relativePath: string;
  canonicalPath: string;
  gender: ClothingGender;
  collection: string;
  component: string;
  drawableIndex: number;
  forms: Array<{ path: string }>;
  textures: Array<{ path: string }>;
};

type LoadedNativeClothingIndex = {
  index: NativeClothingIndex;
  archivePath: string;
};

type RenderVariant = {
  id: string;
  label: string;
  fileName: string;
  formId?: string;
  formLabel?: string;
  textureId?: string;
  textureLabel?: string;
  isEmpty?: boolean;
};

type RenderAssetEntry = {
  status: "ready" | "failed";
  relativePath: string;
  updatedAt: number;
  variants: RenderVariant[];
  error?: string;
};

type RenderManifest = ClothingLibraryPayload["renderer"] & {
  version: 1;
  assets: Record<string, RenderAssetEntry>;
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
const CLOTHING_UPLOAD_EXTENSIONS = new Set([
  ".zip",
  ".ydd",
  ".ytd",
  ".ymt",
  ".yft",
]);
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
export const CLOTHING_RENDER_MANIFEST_PATH = path.join(
  CLOTHING_RENDER_ROOT,
  "render-manifest.json",
);
export const NATIVE_CLOTHING_INDEX_PATH = path.join(
  CLOTHING_ASSET_ROOT,
  "Native",
  "native-clothing-index.json",
);
let nativeClothingIndexCache: (LoadedNativeClothingIndex & { mtimeMs: number }) | null = null;

export async function listClothingLibrary(
  previewUrlFor: (assetId: string) => string | null = () => null,
): Promise<ClothingLibraryPayload> {
  const [assets, manifest, renderManifest] = await Promise.all([
    listAssetCandidates(),
    loadClothingManifest(),
    loadRenderManifest(),
  ]);

  const items: ClothingAsset[] = assets.filter(
    (asset) => isSortableClothingTarget(asset.suggestedTarget),
  ).map((asset) => {
    const render = renderManifest.assets[asset.id];
    const basePreviewUrl = previewUrlFor(asset.id);
    const previewVariants =
      render?.status === "ready" && basePreviewUrl
        ? render.variants.map((variant) => ({
            id: variant.id,
            label: variant.label,
            previewUrl: appendPreviewVariant(basePreviewUrl, variant.id, render.updatedAt),
            ...(variant.formId ? { formId: variant.formId } : {}),
            ...(variant.formLabel ? { formLabel: variant.formLabel } : {}),
            ...(variant.textureId ? { textureId: variant.textureId } : {}),
            ...(variant.textureLabel ? { textureLabel: variant.textureLabel } : {}),
            ...(variant.isEmpty ? { isEmpty: true } : {}),
          }))
        : [];
    const inheritedDecision = asset.legacyDecisionIds
      .map((legacyId) => manifest.decisions[legacyId])
      .find(Boolean);
    const decision = manifest.decisions[asset.id] ?? (inheritedDecision
      ? {
          ...inheritedDecision,
          assetId: asset.id,
          assetRelativePath: asset.relativePath,
        }
      : undefined);

    return {
      id: asset.id,
      name: asset.name,
      relativePath: asset.relativePath,
      sourceFolder: asset.sourceFolder,
      sourceCategory: asset.sourceCategory,
      drawableName: asset.drawableName,
      gender: asset.gender,
      fileCounts: asset.fileCounts,
      componentHints: asset.componentHints,
      suggestedTarget: asset.suggestedTarget,
      previewMimeType: previewVariants.length
        ? "image/png"
        : asset.previewEntry
          ? contentTypeForPath(asset.previewEntry)
          : null,
      previewUrl: previewVariants[0]?.previewUrl ?? (asset.previewEntry ? basePreviewUrl : null),
      previewVariants,
      renderStatus: renderStatusFor(render, renderManifest.state),
      ...(render?.error ? { renderError: render.error } : {}),
      decision,
    };
  });

  return {
    items,
    totals: summarizeClothingAssets(items),
    manifestPath: CLOTHING_MANIFEST_PATH,
    assetRoot: CLOTHING_ASSET_ROOT,
    renderer: publicRendererStatus(renderManifest),
  };
}

export async function readClothingPreview(assetId: string, variantId?: string | null) {
  const [assets, renderManifest] = await Promise.all([
    listAssetCandidates(),
    loadRenderManifest(),
  ]);
  const asset = assets.find((candidate) => candidate.id === assetId);
  if (!asset) return null;

  const render = renderManifest.assets[assetId];
  const variant = render?.variants.find((candidate) => candidate.id === variantId) ?? render?.variants[0];
  if (
    render?.status === "ready" &&
    variant &&
    safeRenderFileName(variant.fileName) &&
    await exists(path.join(CLOTHING_RENDER_ROOT, variant.fileName))
  ) {
    return {
      body: await fs.readFile(path.join(CLOTHING_RENDER_ROOT, variant.fileName)),
      mimeType: "image/png",
    };
  }

  if (!asset.archivePath || !asset.previewEntry) return null;
  return {
    body: await unzipEntryBuffer(asset.archivePath, asset.previewEntry),
    mimeType: contentTypeForPath(asset.previewEntry),
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

export async function resolveClothingRawUploadDir(label: string): Promise<string> {
  await fs.mkdir(CLOTHING_UPLOAD_DIR, { recursive: true });
  const base = `${new Date().toISOString().replace(/[:.]/g, "-")}-${sanitizeNamePart(label)}`;
  let candidate = base;
  let index = 2;
  while (await exists(path.join(CLOTHING_UPLOAD_DIR, candidate))) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  const absolutePath = path.join(CLOTHING_UPLOAD_DIR, candidate);
  await fs.mkdir(absolutePath, { recursive: true });
  return absolutePath;
}

export function sanitizeClothingUploadFileName(originalName: string): string {
  const name = path.basename(originalName).replace(/[\u0000-\u001f\u007f]/g, "").trim();
  const extension = clothingAssetExtension(name);
  if (!CLOTHING_UPLOAD_EXTENSIONS.has(extension)) {
    throw new Error("Upload .zip, .ydd, .ytd, .ymt, or .yft GTA clothing files");
  }
  const suffixLength = extension.length;
  const stem = name.slice(0, -suffixLength).replace(/[^a-zA-Z0-9._^ -]+/g, "_").slice(0, 180);
  return `${stem || "clothing-asset"}${extension}`;
}

export function isSupportedClothingUpload(fileName: string): boolean {
  return CLOTHING_UPLOAD_EXTENSIONS.has(clothingAssetExtension(fileName));
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
  if (components.includes("head")) {
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
  if (components.includes("uppr")) return "arms";

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
  const [archivePaths, nativeIndex, streamAssets, looseAssets] = await Promise.all([
    findZipArchives(CLOTHING_ASSET_ROOT),
    loadNativeClothingIndex(),
    listStreamAssetCandidates(),
    listLooseAssetCandidates(),
  ]);
  const nativeArchivePath = nativeIndex?.archivePath ?? null;
  const archiveAssets = await Promise.all(
    archivePaths
      .filter((archivePath) => archivePath !== nativeArchivePath)
      .map(async (archivePath) => buildArchiveAssetCandidates(archivePath)),
  );
  const nativeAssets = nativeIndex
    ? buildNativeAssetCandidates(nativeIndex.index, nativeIndex.archivePath)
    : [];
  const assets = [...archiveAssets.flat(), ...nativeAssets, ...looseAssets, ...streamAssets];

  return assets.sort((a, b) => {
    const category = a.sourceCategory.localeCompare(b.sourceCategory);
    if (category !== 0) return category;
    return a.name.localeCompare(b.name);
  });
}

function buildNativeAssetCandidates(
  index: NativeClothingIndex,
  archivePath: string,
): AssetCandidate[] {
  return index.items.map((item) => {
    const collectionName = item.collection
      .replace(/--[a-f0-9]{10}$/i, "")
      .replace(/[_-]+/g, " ");
    const componentLabel = item.component.toUpperCase().replace("P_", "P-");
    const drawableLabel = String(item.drawableIndex).padStart(3, "0");
    const genderLabel = item.gender === "unknown" ? "" : ` · ${item.gender}`;
    const relatedPaths = [
      ...item.forms.map((form) => form.path),
      ...item.textures.map((texture) => texture.path),
    ];

    return {
      id: item.id,
      name: `${collectionName} · ${componentLabel} ${drawableLabel}${genderLabel}`,
      sourceType: "native",
      archivePath,
      relativePath: item.relativePath,
      sourceFolder: index.archiveRelativePath,
      sourceCategory: `Native / ${item.gender} / ${collectionName}`,
      drawableName: item.canonicalPath,
      gender: item.gender,
      fileCounts: {
        drawables: item.forms.length,
        textures: item.textures.length,
        images: 0,
        other: 0,
      },
      componentHints: [item.component],
      suggestedTarget: inferClothingTarget(item.relativePath, relatedPaths),
      previewEntry: null,
      legacyDecisionIds: [
        clothingAssetId(index.archiveRelativePath),
        ...item.forms.map((form) => clothingAssetId(`${index.archiveRelativePath}#${form.path}`)),
      ],
    };
  });
}

async function loadNativeClothingIndex(): Promise<LoadedNativeClothingIndex | null> {
  try {
    const stat = await fs.stat(NATIVE_CLOTHING_INDEX_PATH);
    if (nativeClothingIndexCache?.mtimeMs === stat.mtimeMs) {
      return nativeClothingIndexCache;
    }
    const parsed = JSON.parse(
      await fs.readFile(NATIVE_CLOTHING_INDEX_PATH, "utf8"),
    ) as Partial<NativeClothingIndex>;
    if (parsed.version !== 1 || !Array.isArray(parsed.items)) return null;
    if (typeof parsed.archiveRelativePath !== "string") return null;

    const archivePath = path.resolve(CLOTHING_ASSET_ROOT, parsed.archiveRelativePath);
    const assetRootPrefix = `${path.resolve(CLOTHING_ASSET_ROOT)}${path.sep}`;
    if (!archivePath.startsWith(assetRootPrefix) || !(await exists(archivePath))) return null;

    nativeClothingIndexCache = {
      index: parsed as NativeClothingIndex,
      archivePath,
      mtimeMs: stat.mtimeMs,
    };
    return nativeClothingIndexCache;
  } catch (error) {
    if (isNodeError(error, "ENOENT") || error instanceof SyntaxError) {
      nativeClothingIndexCache = null;
      return null;
    }
    throw error;
  }
}

async function buildArchiveAssetCandidates(archivePath: string): Promise<AssetCandidate[]> {
  const archiveRelativePath = toPosixRelative(archivePath);
  const entries = await listArchiveEntries(archivePath);
  const packageName = path.basename(archivePath, path.extname(archivePath)).replace(/[_-]+/g, " ");
  const drawableEntries = entries.filter((entry) => isDrawableExtension(entry.extension));
  if (drawableEntries.length === 0) {
    const previewEntry = previewEntryFromEntries(entries.map((entry) => entry.path), packageName);
    return [{
      id: clothingAssetId(archiveRelativePath),
      name: packageName,
      sourceType: "archive",
      archivePath,
      relativePath: archiveRelativePath,
      sourceFolder: path.posix.dirname(archiveRelativePath),
      sourceCategory: sourceCategoryFromPath(archiveRelativePath),
      drawableName: null,
      gender: "unknown",
      fileCounts: countArchiveFiles(entries),
      componentHints: componentHintsFromEntries(entries.map((entry) => entry.path)),
      suggestedTarget: inferClothingTarget(archiveRelativePath, entries.map((entry) => entry.path)),
      previewEntry,
      legacyDecisionIds: [],
    }];
  }

  const assets: AssetCandidate[] = [];
  const seenDrawables = new Set<string>();
  for (const [index, drawable] of drawableEntries.entries()) {
    const gender = clothingGender(drawable.path);
    const fingerprint = `${gender}:${crypto.createHash("sha1").update(await unzipEntryBuffer(archivePath, drawable.path)).digest("hex")}`;
    if (seenDrawables.has(fingerprint)) continue;
    seenDrawables.add(fingerprint);

    const textureEntries = matchingTextureEntries(drawable.path, entries);
    const relatedPaths = [drawable.path, ...textureEntries.map((entry) => entry.path)];
    const relativePath = `${archiveRelativePath}#${drawable.path}`;
    assets.push({
      id: clothingAssetId(relativePath),
      name: clothingItemName(packageName, drawable.path, gender, index, drawableEntries.length),
      sourceType: "archive",
      archivePath,
      relativePath,
      sourceFolder: archiveRelativePath,
      sourceCategory: sourceCategoryFromPath(archiveRelativePath),
      drawableName: drawable.path,
      gender,
      fileCounts: itemFileCounts(textureEntries.length),
      componentHints: componentHintsFromEntries(relatedPaths),
      suggestedTarget: inferClothingTarget(archiveRelativePath, relatedPaths),
      previewEntry: null,
      legacyDecisionIds: [clothingAssetId(archiveRelativePath)],
    });
  }
  return assets;
}

async function listStreamAssetCandidates(): Promise<AssetCandidate[]> {
  if (!(await exists(CLOTHING_STREAM_ROOT))) return [];

  const entries = await findStreamAssetFiles(CLOTHING_STREAM_ROOT);
  return entries
    .filter((entry) => isDrawableExtension(entry.extension))
    .map((drawable, index, drawables) => buildLooseAssetCandidate(
      drawable,
      entries,
      "Installed/slutvival-clothing/stream/",
      "Installed / slutvival clothing",
      "Installed/slutvival-clothing/stream",
      index,
      drawables.length,
      "stream",
    ));
}

async function listLooseAssetCandidates(): Promise<AssetCandidate[]> {
  if (!(await exists(CLOTHING_UPLOAD_DIR))) return [];
  const entries = await findStreamAssetFiles(CLOTHING_UPLOAD_DIR);
  return entries
    .filter((entry) => isDrawableExtension(entry.extension))
    .map((drawable, index, drawables) => buildLooseAssetCandidate(
      drawable,
      entries,
      "Inbox/",
      "Inbox / uploaded files",
      "Inbox",
      index,
      drawables.length,
      "loose",
    ));
}

function buildLooseAssetCandidate(
  drawable: ArchiveEntry,
  entries: ArchiveEntry[],
  relativePrefix: string,
  sourceCategory: string,
  sourceFolder: string,
  index: number,
  total: number,
  sourceType: "stream" | "loose",
): AssetCandidate {
  const textureEntries = matchingTextureEntries(drawable.path, entries);
  const relatedPaths = [drawable.path, ...textureEntries.map((entry) => entry.path)];
  const relativePath = `${relativePrefix}${drawable.path}`;
  const packageName = loosePackageName(drawable.path);
  const gender = clothingGender(drawable.path);
  const legacyRelativePath = sourceType === "stream"
    ? `Installed/slutvival-clothing/stream/${streamAssetKey(drawable.path)}`
    : path.posix.dirname(relativePath);

  return {
    id: clothingAssetId(relativePath),
    name: clothingItemName(packageName, drawable.path, gender, index, total),
    sourceType,
    archivePath: null,
    relativePath,
    sourceFolder,
    sourceCategory,
    drawableName: drawable.path,
    gender,
    fileCounts: itemFileCounts(textureEntries.length),
    componentHints: componentHintsFromEntries(relatedPaths),
    suggestedTarget: inferClothingTarget(relativePath, relatedPaths),
    previewEntry: null,
    legacyDecisionIds: [clothingAssetId(legacyRelativePath)],
  };
}

export function matchingTextureEntries(
  drawablePath: string,
  entries: ArchiveEntry[],
): ArchiveEntry[] {
  const candidates = entries.filter(
    (entry) => isTextureExtension(entry.extension) && textureMatchesDrawable(drawablePath, entry.path),
  );
  if (candidates.length === 0) return [];
  const bestScore = Math.max(
    ...candidates.map((entry) => commonParentScore(drawablePath, entry.path)),
  );
  return candidates.filter((entry) => commonParentScore(drawablePath, entry.path) === bestScore);
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
      extension: clothingAssetExtension(entry),
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

export function clothingAssetId(relativePath: string): string {
  return crypto.createHash("sha1").update(relativePath).digest("hex").slice(0, 16);
}

function appendPreviewVariant(baseUrl: string, variantId: string, updatedAt: number): string {
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}variant=${encodeURIComponent(variantId)}&v=${updatedAt}`;
}

function renderStatusFor(
  render: RenderAssetEntry | undefined,
  rendererState: ClothingRendererState,
): ClothingAsset["renderStatus"] {
  if (render?.status === "ready") return "ready";
  if (render?.status === "failed") return "failed";
  if (rendererState === "queued" || rendererState === "running") return "rendering";
  return "pending";
}

function publicRendererStatus(manifest: RenderManifest): ClothingLibraryPayload["renderer"] {
  return {
    state: manifest.state,
    startedAt: manifest.startedAt,
    completedAt: manifest.completedAt,
    currentAssetId: manifest.currentAssetId,
    error: manifest.error,
    totals: { ...manifest.totals },
  };
}

async function loadRenderManifest(): Promise<RenderManifest> {
  const empty = emptyRenderManifest();
  try {
    const parsed = JSON.parse(
      await fs.readFile(CLOTHING_RENDER_MANIFEST_PATH, "utf8"),
    ) as Partial<RenderManifest>;
    const state = isRendererState(parsed.state) ? parsed.state : "idle";
    const assets: Record<string, RenderAssetEntry> = {};

    for (const [assetId, entry] of Object.entries(parsed.assets ?? {})) {
      if (!entry || (entry.status !== "ready" && entry.status !== "failed")) continue;
      assets[assetId] = {
        status: entry.status,
        relativePath: String(entry.relativePath ?? ""),
        updatedAt: Number(entry.updatedAt) || 0,
        variants: Array.isArray(entry.variants)
          ? entry.variants.filter(isRenderVariant).map((variant) => ({ ...variant }))
          : [],
        ...(entry.error ? { error: String(entry.error) } : {}),
      };
    }

    return {
      version: 1,
      state,
      startedAt: numericTimestamp(parsed.startedAt),
      completedAt: numericTimestamp(parsed.completedAt),
      currentAssetId: typeof parsed.currentAssetId === "string" ? parsed.currentAssetId : null,
      error: typeof parsed.error === "string" ? parsed.error : null,
      totals: {
        assets: nonNegativeNumber(parsed.totals?.assets),
        ready: nonNegativeNumber(parsed.totals?.ready),
        failed: nonNegativeNumber(parsed.totals?.failed),
        variants: nonNegativeNumber(parsed.totals?.variants),
        renderedVariants: nonNegativeNumber(parsed.totals?.renderedVariants),
      },
      assets,
    };
  } catch (error) {
    if (isNodeError(error, "ENOENT") || error instanceof SyntaxError) return empty;
    throw error;
  }
}

function emptyRenderManifest(): RenderManifest {
  return {
    version: 1,
    state: "idle",
    startedAt: null,
    completedAt: null,
    currentAssetId: null,
    error: null,
    totals: { assets: 0, ready: 0, failed: 0, variants: 0, renderedVariants: 0 },
    assets: {},
  };
}

function isRendererState(value: unknown): value is ClothingRendererState {
  return (
    value === "idle" ||
    value === "queued" ||
    value === "running" ||
    value === "complete" ||
    value === "complete_with_errors" ||
    value === "failed"
  );
}

function isRenderVariant(value: unknown): value is RenderVariant {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RenderVariant>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.label === "string" &&
    typeof candidate.fileName === "string" &&
    safeRenderFileName(candidate.fileName)
  );
}

function numericTimestamp(value: unknown): number | null {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

function nonNegativeNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function safeRenderFileName(fileName: string): boolean {
  return (
    path.basename(fileName) === fileName &&
    /^[a-f0-9]{16}--[a-zA-Z0-9._-]+\.png$/.test(fileName)
  );
}

function isDrawableExtension(extension: string): boolean {
  return extension === ".ydd" || extension === ".ydd.xml";
}

function isTextureExtension(extension: string): boolean {
  return extension === ".ytd" || extension === ".ytd.xml";
}

export function clothingGender(value: string): ClothingGender {
  const lower = value.toLowerCase().replaceAll("\\", "/");
  if (
    lower.includes("mp_f_freemode_01") ||
    `/${lower}/`.includes("/female/") ||
    `/${lower}/`.includes("/femme/")
  ) {
    return "female";
  }
  if (lower.includes("mp_m_freemode_01") || `/${lower}/`.includes("/male/")) {
    return "male";
  }
  return "unknown";
}

function clothingItemName(
  packageName: string,
  drawablePath: string,
  gender: ClothingGender,
  index: number,
  total: number,
): string {
  if (total === 1) return packageName;
  const stem = stripClothingAssetExtension(path.posix.basename(drawablePath));
  const component = (stem.split("^").pop() ?? stem)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const genderLabel = gender === "unknown" ? "" : ` · ${gender}`;
  return `${packageName} · ${component || `Item ${index + 1}`}${genderLabel}`;
}

function loosePackageName(drawablePath: string): string {
  const parts = drawablePath.split("/").filter(Boolean);
  const parent = parts.length > 1 ? parts.at(-2) : null;
  const name = parent ?? stripClothingAssetExtension(parts.at(-1) ?? drawablePath);
  return name.replace(/[_-]+/g, " ");
}

function itemFileCounts(textureCount: number): ClothingFileCounts {
  return { drawables: 1, textures: textureCount, images: 0, other: 0 };
}

function textureMatchesDrawable(drawablePath: string, texturePath: string): boolean {
  const drawableStem = stripClothingAssetExtension(path.posix.basename(drawablePath)).toLowerCase();
  const textureStem = stripClothingAssetExtension(path.posix.basename(texturePath)).toLowerCase();
  if (
    drawableStem.includes("^") &&
    textureStem.includes("^") &&
    drawableStem.split("^", 1)[0] !== textureStem.split("^", 1)[0]
  ) {
    return false;
  }
  if (clothingSignature(drawablePath) !== clothingSignature(texturePath)) return false;
  const drawableGender = clothingGender(drawablePath);
  const textureGender = clothingGender(texturePath);
  return (
    drawableGender === "unknown" ||
    textureGender === "unknown" ||
    drawableGender === textureGender
  );
}

function clothingSignature(filePath: string): string {
  const stem = stripClothingAssetExtension(path.posix.basename(filePath)).toLowerCase();
  return (stem.split("^").pop() ?? stem)
    .replace(/_diff_(\d{3}).*$/, "_$1")
    .replace(/_(\d{3})_[a-z]+$/, "_$1");
}

function stripClothingAssetExtension(fileName: string): string {
  const extension = clothingAssetExtension(fileName);
  return extension ? fileName.slice(0, -extension.length) : fileName;
}

function commonParentScore(left: string, right: string): number {
  const leftParts = path.posix.dirname(left).toLowerCase().split("/");
  const rightParts = path.posix.dirname(right).toLowerCase().split("/");
  let score = 0;
  while (score < leftParts.length && leftParts[score] === rightParts[score]) score += 1;
  return score;
}

function sanitizeNamePart(value: string): string {
  return (
    stripClothingAssetExtension(path.basename(value))
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "clothing-assets"
  );
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
