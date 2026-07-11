export const CLOTHING_TARGETS = [
  { value: "mask", label: "Mask", installGroup: "Masks" },
  { value: "hair", label: "Hair", installGroup: "Hair" },
  { value: "arms", label: "Arms / Sleeves", installGroup: "Arms" },
  { value: "shirt", label: "Top / Shirt", installGroup: "Tops_dresses" },
  { value: "jacket", label: "Jacket / Torso", installGroup: "Tops_dresses" },
  { value: "dress", label: "Dress", installGroup: "Tops_dresses" },
  { value: "undershirt", label: "Undershirt / T-Shirt", installGroup: "Tops_dresses" },
  { value: "armor", label: "Body Armor", installGroup: "Body Armor" },
  { value: "decals", label: "Decals", installGroup: "Decals" },
  { value: "pants", label: "Pants", installGroup: "Pants_Skirts" },
  { value: "skirt", label: "Skirt", installGroup: "Pants_Skirts" },
  { value: "shoes", label: "Shoes", installGroup: "Shoes" },
  { value: "socks", label: "Socks", installGroup: "Socks" },
  { value: "accessory", label: "Chain / Accessory", installGroup: "Accessories" },
  { value: "backpack", label: "Backpack", installGroup: "Accessories" },
  { value: "hat", label: "Hat / Helmet", installGroup: "Hats" },
  { value: "glasses", label: "Glasses", installGroup: "Glasses" },
  { value: "ears", label: "Ears", installGroup: "Ear Accessories" },
  { value: "watches", label: "Watches", installGroup: "Watches" },
  { value: "bracelets", label: "Bracelets", installGroup: "Bracelets" },
  { value: "body", label: "Body", installGroup: "Body Types" },
  { value: "maybe", label: "Maybe", installGroup: "Review" },
  { value: "reject", label: "Reject", installGroup: "Rejected" },
  { value: "broken", label: "Broken", installGroup: "Broken" },
] as const;

export const CLOTHING_AUDIT_TAGS = [
  { value: "mask", label: "Mask" },
  { value: "hair", label: "Hair" },
  { value: "arms", label: "Arms / Sleeves" },
  { value: "pants", label: "Pants" },
  { value: "backpack", label: "Backpack / Bag" },
  { value: "shoes", label: "Shoes" },
  { value: "accessory", label: "Chain / Accessory" },
  { value: "underlayer", label: "Undershirt / T-Shirt" },
  { value: "armor", label: "Body Armor" },
  { value: "decals", label: "Decals" },
  { value: "jacket", label: "Jacket / Torso" },
  { value: "shirt", label: "Top / Shirt" },
  { value: "dress", label: "Dress" },
  { value: "skirt", label: "Skirt" },
  { value: "socks", label: "Socks" },
  { value: "hat", label: "Hat / Helmet" },
  { value: "glasses", label: "Glasses" },
  { value: "ears", label: "Ears" },
  { value: "watches", label: "Watches" },
  { value: "bracelets", label: "Bracelets" },
  { value: "body", label: "Body" },
  { value: "reject", label: "Reject" },
  { value: "broken", label: "Broken / Hide" },
  { value: "maybe", label: "Maybe / Recheck" },
] as const;

export type ClothingTarget = (typeof CLOTHING_TARGETS)[number]["value"];
export type ClothingInstallGroup = (typeof CLOTHING_TARGETS)[number]["installGroup"];
export type ClothingAuditTag = (typeof CLOTHING_AUDIT_TAGS)[number]["value"];

export interface ClothingFileCounts {
  drawables: number;
  textures: number;
  images: number;
  other: number;
}

export interface ClothingDecision {
  assetId: string;
  assetRelativePath: string;
  target: ClothingTarget;
  installGroup: ClothingInstallGroup;
  decidedAt: number;
  notes?: string;
}

export type ClothingGender = "female" | "male" | "unisex" | "unknown";
export type ClothingRenderStatus = "ready" | "rendering" | "pending" | "failed";
export type ClothingRendererState =
  | "idle"
  | "queued"
  | "running"
  | "complete"
  | "complete_with_errors"
  | "failed";

export interface ClothingPreviewVariant {
  id: string;
  label: string;
  previewUrl: string;
  formId?: string;
  formLabel?: string;
  textureId?: string;
  textureLabel?: string;
  isEmpty?: boolean;
}

export interface ClothingAsset {
  id: string;
  name: string;
  relativePath: string;
  sourceFolder: string;
  sourceCategory: string;
  drawableName: string | null;
  gender: ClothingGender;
  fileCounts: ClothingFileCounts;
  componentHints: string[];
  suggestedTarget: ClothingTarget;
  previewUrl: string | null;
  previewVariants: ClothingPreviewVariant[];
  previewMimeType: string | null;
  renderStatus: ClothingRenderStatus;
  renderError?: string;
  decision?: ClothingDecision;
}

export interface ClothingLibraryTotals {
  total: number;
  reviewed: number;
  remaining: number;
  byTarget: Partial<Record<ClothingTarget, number>>;
}

export interface ClothingLibraryPayload {
  items: ClothingAsset[];
  totals: ClothingLibraryTotals;
  manifestPath: string;
  assetRoot: string;
  renderer: {
    state: ClothingRendererState;
    startedAt: number | null;
    completedAt: number | null;
    currentAssetId: string | null;
    error: string | null;
    totals: {
      assets: number;
      ready: number;
      failed: number;
      variants: number;
      renderedVariants: number;
    };
  };
}

export interface ClothingAuditItem {
  id: string;
  model: string;
  modelHash: number;
  componentKey: string;
  componentLabel: string;
  component: number;
  drawable: number;
  texture: number;
  tag: ClothingAuditTag | null;
  tagLabel: string | null;
  updatedAt: string | null;
  previewUrl: string | null;
  hasPreview: boolean;
  source: "audit" | "screenshot";
}

export interface ClothingAuditTotals {
  total: number;
  captured: number;
  tagged: number;
  byTag: Partial<Record<ClothingAuditTag, number>>;
}

export interface ClothingAuditPayload {
  items: ClothingAuditItem[];
  totals: ClothingAuditTotals;
  auditPath: string;
  screenshotDir: string;
}

export function isClothingTarget(value: unknown): value is ClothingTarget {
  return (
    typeof value === "string" &&
    CLOTHING_TARGETS.some((target) => target.value === value)
  );
}

export function isSortableClothingTarget(target: ClothingTarget): boolean {
  return target !== "body";
}

export function clothingTargetMeta(target: ClothingTarget) {
  return CLOTHING_TARGETS.find((candidate) => candidate.value === target) ?? CLOTHING_TARGETS[0];
}

export function isClothingAuditTag(value: unknown): value is ClothingAuditTag {
  return (
    typeof value === "string" &&
    CLOTHING_AUDIT_TAGS.some((target) => target.value === value)
  );
}

export function clothingAuditTagMeta(tag: ClothingAuditTag) {
  return CLOTHING_AUDIT_TAGS.find((candidate) => candidate.value === tag) ?? CLOTHING_AUDIT_TAGS[0];
}
