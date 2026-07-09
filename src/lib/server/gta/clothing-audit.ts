import fs from "node:fs/promises";
import path from "node:path";
import {
  clothingAuditTagMeta,
  isClothingAuditTag,
  type ClothingAuditItem,
  type ClothingAuditPayload,
  type ClothingAuditTag,
} from "@/lib/gta-clothing";
import type { Instance } from "@/lib/types";

type RawAuditItem = {
  model?: unknown;
  modelHash?: unknown;
  componentKey?: unknown;
  componentLabel?: unknown;
  component?: unknown;
  drawable?: unknown;
  texture?: unknown;
  tag?: unknown;
  tagLabel?: unknown;
  updatedAt?: unknown;
};

type RawAuditData = {
  items?: RawAuditItem[];
  updatedAt?: unknown;
};

type ScreenshotFile = {
  itemId: string;
  absolutePath: string;
  mimeType: string;
};

const AUDIT_RESOURCE_PATH = path.join(
  "resources",
  "[mods]",
  "slutvival-clothing-audit",
);
const AUDIT_DATA_FILE = "clothing_audit.json";
const AUDIT_SCREENSHOT_DIR = "screenshots";
const SCREENSHOT_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const COMPONENTS = [
  { key: "masks", label: "Masks", component: 1 },
  { key: "hair", label: "Hair", component: 2 },
  { key: "arms", label: "Arms / Sleeves", component: 3 },
  { key: "pants", label: "Pants / Lower Body", component: 4 },
  { key: "bags", label: "Bags / Back Items", component: 5 },
  { key: "shoes", label: "Shoes", component: 6 },
  { key: "accessories", label: "Chains / Neckwear", component: 7 },
  { key: "underlayers", label: "Undershirts / T-Shirts", component: 8 },
  { key: "armor", label: "Body Armor", component: 9 },
  { key: "decals", label: "Decals / Overlays", component: 10 },
  { key: "tops", label: "Tops / Jackets", component: 11 },
  { key: "hats", label: "Hats / Helmets", component: 100 },
  { key: "glasses", label: "Glasses", component: 101 },
  { key: "ears", label: "Ears", component: 102 },
  { key: "watches", label: "Watches", component: 106 },
  { key: "bracelets", label: "Bracelets", component: 107 },
] as const;

export function clothingAuditPath(instance: Instance): string {
  return path.join(instance.dataPath, AUDIT_RESOURCE_PATH, "data", AUDIT_DATA_FILE);
}

export function clothingAuditScreenshotDir(instance: Instance): string {
  return path.join(instance.dataPath, AUDIT_RESOURCE_PATH, "data", AUDIT_SCREENSHOT_DIR);
}

export async function listClothingAudit(
  instance: Instance,
  previewUrlFor: (itemId: string) => string | null = () => null,
): Promise<ClothingAuditPayload> {
  const [rawData, screenshotFiles] = await Promise.all([
    loadRawAuditData(instance),
    listScreenshotFiles(clothingAuditScreenshotDir(instance)),
  ]);
  const screenshotById = new Map(screenshotFiles.map((file) => [file.itemId, file]));
  const itemsById = new Map<string, ClothingAuditItem>();

  for (const rawItem of rawData.items ?? []) {
    const normalized = normalizeRawAuditItem(rawItem);
    if (!normalized) continue;
    const screenshot = screenshotById.get(normalized.id);
    itemsById.set(normalized.id, {
      ...normalized,
      previewUrl: screenshot ? previewUrlFor(normalized.id) : null,
      hasPreview: Boolean(screenshot),
      source: "audit",
    });
  }

  for (const screenshot of screenshotFiles) {
    if (itemsById.has(screenshot.itemId)) continue;
    const parsed = parseAuditItemId(screenshot.itemId);
    if (!parsed) continue;
    const component = componentMeta(parsed.component);
    itemsById.set(screenshot.itemId, {
      id: screenshot.itemId,
      model: parsed.model,
      modelHash: 0,
      componentKey: component.key,
      componentLabel: component.label,
      component: parsed.component,
      drawable: parsed.drawable,
      texture: parsed.texture,
      tag: null,
      tagLabel: null,
      updatedAt: null,
      previewUrl: previewUrlFor(screenshot.itemId),
      hasPreview: true,
      source: "screenshot",
    });
  }

  const items = [...itemsById.values()].sort(sortAuditItems);
  return {
    items,
    totals: summarizeAuditItems(items),
    auditPath: clothingAuditPath(instance),
    screenshotDir: clothingAuditScreenshotDir(instance),
  };
}

export async function readClothingAuditPreview(instance: Instance, itemId: string) {
  const file = await screenshotFileForItem(instance, itemId);
  if (!file) return null;
  return {
    body: await fs.readFile(file.absolutePath),
    mimeType: file.mimeType,
  };
}

export async function saveClothingAuditTag(
  instance: Instance,
  itemId: string,
  tag: ClothingAuditTag,
): Promise<void> {
  const parsed = parseAuditItemId(itemId);
  if (!parsed) throw new Error(`Invalid clothing audit item '${itemId}'`);

  const auditPath = clothingAuditPath(instance);
  const data = await loadRawAuditData(instance);
  const items = Array.isArray(data.items) ? data.items : [];
  const tagMeta = clothingAuditTagMeta(tag);
  const component = componentMeta(parsed.component);
  const updatedAt = new Date().toISOString();
  let found = false;

  for (const item of items) {
    const normalized = normalizeRawAuditItem(item);
    if (!normalized || normalized.id !== itemId) continue;
    item.model = parsed.model;
    item.componentKey = component.key;
    item.componentLabel = component.label;
    item.component = parsed.component;
    item.drawable = parsed.drawable;
    item.texture = parsed.texture;
    item.tag = tag;
    item.tagLabel = tagMeta.label;
    item.updatedAt = updatedAt;
    found = true;
    break;
  }

  if (!found) {
    items.push({
      model: parsed.model,
      modelHash: 0,
      componentKey: component.key,
      componentLabel: component.label,
      component: parsed.component,
      drawable: parsed.drawable,
      texture: parsed.texture,
      tag,
      tagLabel: tagMeta.label,
      updatedAt,
    });
  }

  data.items = items;
  data.updatedAt = updatedAt;
  await fs.mkdir(path.dirname(auditPath), { recursive: true });
  const tempPath = `${auditPath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, auditPath);
}

export function auditItemId(
  model: string,
  component: number,
  drawable: number,
  texture: number,
): string {
  return `${safeIdPart(model)}_${component}_${drawable}_${texture}`;
}

export function parseAuditItemId(itemId: string) {
  if (!/^[A-Za-z0-9_-]+_\d+_\d+_\d+$/.test(itemId)) return null;
  const match = itemId.match(/^(.+)_(\d+)_(\d+)_(\d+)$/);
  if (!match) return null;
  return {
    model: match[1],
    component: Number(match[2]),
    drawable: Number(match[3]),
    texture: Number(match[4]),
  };
}

async function loadRawAuditData(instance: Instance): Promise<RawAuditData> {
  try {
    const raw = await fs.readFile(clothingAuditPath(instance), "utf8");
    const parsed = JSON.parse(raw) as RawAuditData;
    return {
      ...parsed,
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return { items: [] };
    throw error;
  }
}

function normalizeRawAuditItem(rawItem: RawAuditItem): ClothingAuditItem | null {
  const model = safeString(rawItem.model, "unknown");
  const component = safeInt(rawItem.component);
  const drawable = safeInt(rawItem.drawable);
  const texture = safeInt(rawItem.texture);
  if (component === null || drawable === null || texture === null) return null;

  const componentFallback = componentMeta(component);
  const tag = isClothingAuditTag(rawItem.tag) ? rawItem.tag : null;
  return {
    id: auditItemId(model, component, drawable, texture),
    model,
    modelHash: safeInt(rawItem.modelHash) ?? 0,
    componentKey: safeString(rawItem.componentKey, componentFallback.key),
    componentLabel: safeString(rawItem.componentLabel, componentFallback.label),
    component,
    drawable,
    texture,
    tag,
    tagLabel: tag ? safeString(rawItem.tagLabel, clothingAuditTagMeta(tag).label) : null,
    updatedAt: safeString(rawItem.updatedAt, null),
    previewUrl: null,
    hasPreview: false,
    source: "audit",
  };
}

async function listScreenshotFiles(root: string): Promise<ScreenshotFile[]> {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const files: ScreenshotFile[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const extension = path.extname(entry.name).toLowerCase();
    if (!SCREENSHOT_EXTENSIONS.has(extension)) continue;
    const itemId = path.basename(entry.name, extension);
    if (!parseAuditItemId(itemId)) continue;
    files.push({
      itemId,
      absolutePath: path.join(root, entry.name),
      mimeType: contentTypeForExtension(extension),
    });
  }

  return files;
}

async function screenshotFileForItem(
  instance: Instance,
  itemId: string,
): Promise<ScreenshotFile | null> {
  if (!parseAuditItemId(itemId)) return null;
  const files = await listScreenshotFiles(clothingAuditScreenshotDir(instance));
  return files.find((file) => file.itemId === itemId) ?? null;
}

function summarizeAuditItems(items: ClothingAuditItem[]) {
  const byTag: Partial<Record<ClothingAuditTag, number>> = {};
  let captured = 0;
  let tagged = 0;

  for (const item of items) {
    if (item.hasPreview) captured += 1;
    if (!item.tag) continue;
    tagged += 1;
    byTag[item.tag] = (byTag[item.tag] ?? 0) + 1;
  }

  return {
    total: items.length,
    captured,
    tagged,
    byTag,
  };
}

function sortAuditItems(a: ClothingAuditItem, b: ClothingAuditItem) {
  const component = a.component - b.component;
  if (component !== 0) return component;
  const drawable = a.drawable - b.drawable;
  if (drawable !== 0) return drawable;
  const texture = a.texture - b.texture;
  if (texture !== 0) return texture;
  return a.model.localeCompare(b.model);
}

function componentMeta(component: number) {
  const match = COMPONENTS.find((entry) => entry.component === component);
  if (match) return { key: match.key, label: match.label };
  return { key: `component_${component}`, label: `Component ${component}` };
}

function safeString(value: unknown, fallback: string): string;
function safeString(value: unknown, fallback: null): string | null;
function safeString(value: unknown, fallback: string | null) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value.trim();
}

function safeInt(value: unknown): number | null {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.floor(number);
}

function safeIdPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}

function contentTypeForExtension(extension: string): string {
  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return "image/png";
  }
}

function isNodeError(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === code
  );
}
