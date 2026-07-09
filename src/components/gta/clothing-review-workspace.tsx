"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangleIcon,
  ArchiveIcon,
  BackpackIcon,
  BanIcon,
  CircleHelpIcon,
  CircleIcon,
  DramaIcon,
  EarIcon,
  FootprintsIcon,
  GemIcon,
  GlassesIcon,
  HardHatIcon,
  ImageOffIcon,
  PackageIcon,
  RefreshCwIcon,
  ScissorsIcon,
  ShieldIcon,
  ShirtIcon,
  TagsIcon,
  UploadIcon,
  WatchIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatBytes, formatRelative } from "@/lib/format";
import {
  CLOTHING_TARGETS,
  clothingTargetMeta,
  type ClothingAsset,
  type ClothingTarget,
} from "@/lib/gta-clothing";
import { PageHeader } from "@/components/panel/page-header";
import { SectionCard } from "@/components/panel/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type ReviewFilter =
  | "remaining"
  | "reviewed"
  | "all"
  | "assets"
  | "missing"
  | ClothingTarget;
type ReviewItem = {
  id: string;
  title: string;
  sourceLabel: string;
  previewUrl: string | null;
  suggestedTarget: ClothingTarget;
  currentTarget: ClothingTarget | null;
  reviewed: boolean;
  reviewedAt: number | null;
  asset: ClothingAsset;
};
type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
};

const PRIMARY_TARGETS: ClothingTarget[] = [
  "mask",
  "hair",
  "arms",
  "shirt",
  "jacket",
  "dress",
  "undershirt",
  "armor",
  "decals",
  "pants",
  "skirt",
  "shoes",
  "socks",
  "accessory",
  "backpack",
  "hat",
  "glasses",
  "ears",
  "watches",
  "bracelets",
  "body",
];
const REVIEW_TARGETS: ClothingTarget[] = ["maybe", "reject", "broken"];
const FILTERS: { value: ReviewFilter; label: string }[] = [
  { value: "remaining", label: "Remaining" },
  { value: "reviewed", label: "Reviewed" },
  { value: "all", label: "All" },
  { value: "assets", label: "Assets" },
  { value: "missing", label: "No image" },
  { value: "maybe", label: "Maybe" },
  { value: "reject", label: "Reject" },
  { value: "broken", label: "Broken" },
];
const TARGET_ICONS: Record<ClothingTarget, LucideIcon> = {
  mask: DramaIcon,
  hair: ScissorsIcon,
  arms: ShirtIcon,
  shirt: ShirtIcon,
  jacket: ShirtIcon,
  dress: ShirtIcon,
  undershirt: ShirtIcon,
  armor: ShieldIcon,
  decals: TagsIcon,
  pants: TagsIcon,
  skirt: TagsIcon,
  shoes: FootprintsIcon,
  socks: FootprintsIcon,
  accessory: GemIcon,
  backpack: BackpackIcon,
  hat: HardHatIcon,
  glasses: GlassesIcon,
  ears: EarIcon,
  watches: WatchIcon,
  bracelets: CircleIcon,
  body: PackageIcon,
  maybe: CircleHelpIcon,
  reject: BanIcon,
  broken: AlertTriangleIcon,
};

export function ClothingReviewWorkspace({ id }: { id: string }) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const dragStart = React.useRef<DragState | null>(null);
  const [filter, setFilter] = React.useState<ReviewFilter>("remaining");
  const [selectedId, setSelectedId] = React.useState("");
  const [busyTarget, setBusyTarget] = React.useState<ClothingTarget | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [drag, setDrag] = React.useState({ active: false, x: 0, y: 0 });

  const {
    data: library,
    isLoading: libraryLoading,
    mutate: mutateLibrary,
  } = useSWR(["gta-clothing", id], () => api.gta.clothing.list(id), {
    keepPreviousData: true,
  });

  const assetItems = React.useMemo(() => library?.items ?? [], [library?.items]);
  const reviewItems = React.useMemo(
    () => buildReviewItems(assetItems),
    [assetItems],
  );
  const visibleItems = React.useMemo(
    () => filterReviewItems(reviewItems, filter),
    [reviewItems, filter],
  );
  const selected =
    (selectedId ? visibleItems.find((item) => item.id === selectedId) : null) ??
    visibleItems[0] ??
    reviewItems[0] ??
    null;
  const dragTarget = selected
    ? targetFromDrag(drag.x, drag.y, selected.suggestedTarget)
    : null;
  const totals = summarizeReviewItems(reviewItems);
  const loading = libraryLoading && !library;
  const renderedAssets = assetItems.filter((item) => item.previewUrl).length;

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const tagName = document.activeElement?.tagName.toLowerCase();
      if (tagName === "input" || tagName === "textarea" || tagName === "select") return;
      if (!selected || busyTarget || uploading) return;

      if (event.key === "ArrowRight") {
        event.preventDefault();
        void decide(selected, selected.suggestedTarget);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        void decide(selected, "reject");
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        void decide(selected, "maybe");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  async function refresh() {
    await mutateLibrary();
  }

  async function decide(item: ReviewItem, target: ClothingTarget) {
    try {
      setBusyTarget(target);
      const nextData = await api.gta.clothing.decide(id, item.asset.id, target);
      mutateLibrary(nextData, false);
      selectNextItem(item.id, visibleItems);
      toast.success(`${item.title} saved as ${clothingTargetMeta(target).label}`);
    } catch (error) {
      toast.error("Failed to save clothing decision", {
        description: errorDescription(error),
      });
    } finally {
      setBusyTarget(null);
    }
  }

  async function clearDecision(item: ReviewItem) {
    try {
      const nextData = await api.gta.clothing.clear(id, item.asset.id);
      mutateLibrary(nextData, false);
      toast.success(`${item.title} moved back to remaining`);
    } catch (error) {
      toast.error("Failed to clear clothing decision", {
        description: errorDescription(error),
      });
    }
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;

    try {
      setUploading(true);
      const result = await api.gta.clothing.upload(id, files);
      mutateLibrary(result.library, false);
      const totalBytes = Array.from(files).reduce((total, file) => total + file.size, 0);
      toast.success(`${result.uploaded.length} clothing archive uploaded`, {
        description: formatBytes(totalBytes),
      });
    } catch (error) {
      toast.error("Upload failed", { description: errorDescription(error) });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function selectNextItem(currentId: string, nextItems: ReviewItem[]) {
    const currentIndex = nextItems.findIndex((item) => item.id === currentId);
    const afterCurrent = nextItems
      .slice(Math.max(0, currentIndex + 1))
      .find((item) => !item.reviewed);
    const beforeCurrent = nextItems
      .slice(0, Math.max(0, currentIndex))
      .find((item) => !item.reviewed);
    const next = afterCurrent ?? beforeCurrent ?? nextItems.find((item) => item.id !== currentId);
    setSelectedId(next?.id ?? "");
  }

  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!selected || busyTarget) return;
    dragStart.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
    setDrag({ active: true, x: 0, y: 0 });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
    const start = dragStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    setDrag({
      active: true,
      x: event.clientX - start.startX,
      y: event.clientY - start.startY,
    });
  }

  function stopDrag(event: React.PointerEvent<HTMLDivElement>) {
    const start = dragStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    dragStart.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const target = selected ? targetFromDrag(drag.x, drag.y, selected.suggestedTarget) : null;
    setDrag({ active: false, x: 0, y: 0 });
    if (selected && target) void decide(selected, target);
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Clothing Renderer"
        description="Review uploaded and installed clothing assets in one queue."
        icon={ArchiveIcon}
        actions={
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              multiple
              className="hidden"
              onChange={(event) => void upload(event.currentTarget.files)}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => void refresh()}
              disabled={loading || uploading}
            >
              <RefreshCwIcon /> Refresh
            </Button>
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <UploadIcon /> {uploading ? "Uploading" : "Upload zips"}
            </Button>
          </>
        }
      />

      <SectionCard
        title="Render workspace"
        description={filterLabel(filter)}
        icon={TagsIcon}
        action={selected ? <ReviewStatusBadge item={selected} /> : undefined}
        bodyClassName="p-0"
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/15 px-3 py-3">
          <div className="ml-auto grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ReviewStat label="Items" value={reviewItems.length} />
            <ReviewStat label="Assets" value={assetItems.length} />
            <ReviewStat label="Renders" value={`${renderedAssets} / ${assetItems.length}`} />
            <ReviewStat label="Remaining" value={totals.remaining} />
          </div>
        </div>

        {loading ? (
          <ClothingWorkspaceSkeleton />
        ) : reviewItems.length ? (
          <div className="grid min-h-[44rem] xl:grid-cols-[21rem_minmax(0,1fr)_20rem]">
            <aside className="flex min-h-[18rem] flex-col border-b border-border xl:border-b-0 xl:border-r">
              <div className="flex flex-wrap gap-2 border-b border-border p-3">
                {FILTERS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    size="sm"
                    variant={filter === option.value ? "secondary" : "ghost"}
                    onClick={() => setFilter(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {visibleItems.length ? (
                  visibleItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={cn(
                        "flex w-full items-start gap-3 border-b border-border px-3 py-3 text-left transition-colors hover:bg-muted/35 focus-visible:bg-muted/35 focus-visible:outline-none",
                        item.id === selected?.id && "bg-muted/45",
                      )}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background">
                        {item.previewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <ArchiveIcon className="size-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">
                          {item.title}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <Badge variant={item.reviewed ? "secondary" : "outline"}>
                            {clothingTargetMeta(item.currentTarget ?? item.suggestedTarget).label}
                          </Badge>
                          <Badge variant="outline">Asset</Badge>
                          {!item.previewUrl && <Badge variant="outline">No image</Badge>}
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="p-6 text-sm text-muted-foreground">No clothing items here.</div>
                )}
              </div>
            </aside>

            <section className="relative flex min-h-[36rem] items-center justify-center overflow-hidden bg-[#07080b] p-4">
              {selected ? (
                <>
                  <div className="absolute left-4 top-4 z-10 flex min-w-0 max-w-[calc(100%-2rem)] flex-wrap items-center gap-2">
                    <Badge variant="secondary">Asset</Badge>
                    <Badge variant="outline" className="max-w-full truncate">
                      {selected.title}
                    </Badge>
                  </div>
                  <div
                    className="relative flex aspect-[4/5] w-full max-w-[34rem] touch-none select-none items-center justify-center"
                    style={{
                      transform: drag.active
                        ? `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 28}deg)`
                        : undefined,
                      transition: drag.active ? "none" : "transform 180ms ease",
                    }}
                    onPointerDown={startDrag}
                    onPointerMove={moveDrag}
                    onPointerUp={stopDrag}
                    onPointerCancel={stopDrag}
                  >
                    <ReviewPreview item={selected} />
                    {dragTarget && (
                      <div className="absolute left-4 top-12 rounded-lg border border-primary/30 bg-background/90 px-3 py-2 text-sm font-semibold text-foreground shadow-panel backdrop-blur">
                        {clothingTargetMeta(dragTarget).label}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <EmptyClothingState />
              )}
            </section>

            <aside className="flex flex-col border-t border-border xl:border-l xl:border-t-0">
              {selected ? (
                <>
                  <div className="grid gap-3 border-b border-border p-4">
                    <ReviewMetadata item={selected} />
                    {selected.currentTarget && (
                      <div className="rounded-lg border border-border bg-muted/20 p-3">
                        <div className="text-xs font-medium text-muted-foreground">Saved</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <Badge>{clothingTargetMeta(selected.currentTarget).label}</Badge>
                          {selected.reviewedAt && (
                            <span className="text-xs text-muted-foreground">
                              {formatRelative(selected.reviewedAt)}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid gap-3 p-4">
                    <TargetButtonGrid
                      targets={PRIMARY_TARGETS}
                      busyTarget={busyTarget}
                      selectedTarget={selected.currentTarget}
                      suggestedTarget={selected.suggestedTarget}
                      onSelect={(target) => void decide(selected, target)}
                    />
                    <div className="h-px bg-border" />
                    <TargetButtonGrid
                      targets={REVIEW_TARGETS}
                      busyTarget={busyTarget}
                      selectedTarget={selected.currentTarget}
                      suggestedTarget={selected.suggestedTarget}
                      onSelect={(target) => void decide(selected, target)}
                    />
                    {selected.currentTarget && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void clearDecision(selected)}
                      >
                        Move back
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <EmptyClothingState />
              )}
            </aside>
          </div>
        ) : (
          <EmptyClothingState />
        )}
      </SectionCard>
    </div>
  );
}

function buildReviewItems(assets: ClothingAsset[]) {
  return assets.map(assetReviewItem).sort(sortReviewItems);
}

function assetReviewItem(asset: ClothingAsset): ReviewItem {
  return {
    id: `asset:${asset.id}`,
    title: asset.name,
    sourceLabel: asset.sourceCategory,
    previewUrl: asset.previewUrl,
    suggestedTarget: asset.suggestedTarget,
    currentTarget: asset.decision?.target ?? null,
    reviewed: Boolean(asset.decision),
    reviewedAt: asset.decision?.decidedAt ?? null,
    asset,
  };
}

function sortReviewItems(a: ReviewItem, b: ReviewItem) {
  const reviewed = Number(a.reviewed) - Number(b.reviewed);
  if (reviewed !== 0) return reviewed;
  const preview = Number(Boolean(b.previewUrl)) - Number(Boolean(a.previewUrl));
  if (preview !== 0) return preview;
  const source = a.sourceLabel.localeCompare(b.sourceLabel);
  if (source !== 0) return source;
  return a.title.localeCompare(b.title);
}

function summarizeReviewItems(items: ReviewItem[]) {
  let reviewed = 0;
  for (const item of items) {
    if (item.reviewed) reviewed += 1;
  }
  return {
    reviewed,
    remaining: Math.max(0, items.length - reviewed),
  };
}

function filterReviewItems(items: ReviewItem[], filter: ReviewFilter) {
  if (filter === "all") return items;
  if (filter === "remaining") return items.filter((item) => !item.reviewed);
  if (filter === "reviewed") return items.filter((item) => item.reviewed);
  if (filter === "assets") return items;
  if (filter === "missing") return items.filter((item) => !item.previewUrl);
  return items.filter((item) => item.currentTarget === filter);
}

function filterLabel(filter: ReviewFilter) {
  if (filter === "all") return "All clothing items";
  if (filter === "remaining") return "Unreviewed items";
  if (filter === "reviewed") return "Saved decisions";
  if (filter === "assets") return "Uploaded and installed assets";
  if (filter === "missing") return "Items without preview images";
  return CLOTHING_TARGETS.find((target) => target.value === filter)?.label ?? filter;
}

function ReviewPreview({ item }: { item: ReviewItem }) {
  if (!item.previewUrl) {
    return (
      <div className="grid justify-items-center gap-3 px-6 text-center text-muted-foreground">
        <ImageOffIcon className="size-12" />
        <div className="text-sm font-medium text-foreground">No asset render</div>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.previewUrl}
      alt={`${item.title} preview`}
      draggable={false}
      className="h-full max-h-[46rem] w-full object-contain p-2"
    />
  );
}

function ReviewMetadata({ item }: { item: ReviewItem }) {
  return (
    <div className="grid gap-2 text-xs text-muted-foreground">
      <div className="truncate font-mono">{item.asset.relativePath}</div>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="outline">{item.asset.fileCounts.drawables} ydd</Badge>
        <Badge variant="outline">{item.asset.fileCounts.textures} ytd</Badge>
        <Badge variant="outline">{item.asset.fileCounts.images} preview</Badge>
      </div>
      {item.asset.componentHints.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {item.asset.componentHints.map((hint) => (
            <Badge key={hint} variant="secondary" className="font-mono">
              {hint}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewStatusBadge({ item }: { item: ReviewItem }) {
  if (item.currentTarget) {
    return <Badge variant="secondary">{clothingTargetMeta(item.currentTarget).label}</Badge>;
  }
  return (
    <Badge variant="outline">
      Suggested {clothingTargetMeta(item.suggestedTarget).label}
    </Badge>
  );
}

function TargetButtonGrid({
  targets,
  busyTarget,
  selectedTarget,
  suggestedTarget,
  onSelect,
}: {
  targets: ClothingTarget[];
  busyTarget: ClothingTarget | null;
  selectedTarget: ClothingTarget | null;
  suggestedTarget: ClothingTarget;
  onSelect: (target: ClothingTarget) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {targets.map((target) => {
        const meta = clothingTargetMeta(target);
        const Icon = TARGET_ICONS[target];
        return (
          <Button
            key={target}
            type="button"
            variant={target === selectedTarget || target === suggestedTarget ? "secondary" : "outline"}
            disabled={busyTarget !== null}
            onClick={() => onSelect(target)}
            className="justify-start"
          >
            <Icon />
            <span className="min-w-0 truncate">{busyTarget === target ? "Saving" : meta.label}</span>
          </Button>
        );
      })}
    </div>
  );
}

function ReviewStat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="min-w-20 rounded-md border border-border bg-background/60 px-3 py-2">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate font-heading text-sm font-semibold text-foreground">
        {value}
      </div>
    </div>
  );
}

function ClothingWorkspaceSkeleton() {
  return (
    <div className="grid min-h-[44rem] xl:grid-cols-[21rem_minmax(0,1fr)_20rem]">
      <Skeleton className="min-h-[18rem] rounded-none" />
      <Skeleton className="min-h-[36rem] rounded-none" />
      <Skeleton className="min-h-[18rem] rounded-none" />
    </div>
  );
}

function EmptyClothingState() {
  return (
    <div className="flex min-h-[22rem] items-center justify-center p-6 text-sm text-muted-foreground">
      No clothing items found.
    </div>
  );
}

function targetFromDrag(
  x: number,
  y: number,
  suggestedTarget: ClothingTarget,
): ClothingTarget | null {
  if (x > 110) return suggestedTarget;
  if (x < -110) return "reject";
  if (y < -100) return "maybe";
  return null;
}

function errorDescription(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
