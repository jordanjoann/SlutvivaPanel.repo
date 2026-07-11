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
  BoxIcon,
  CircleHelpIcon,
  CircleIcon,
  DramaIcon,
  EarIcon,
  FootprintsIcon,
  GemIcon,
  GlassesIcon,
  HardHatIcon,
  PackageIcon,
  PlayIcon,
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
  type ClothingLibraryPayload,
  type ClothingTarget,
} from "@/lib/gta-clothing";
import { PageHeader } from "@/components/panel/page-header";
import { SectionCard } from "@/components/panel/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type ClothingFilter = "remaining" | "reviewed" | "all" | ClothingTarget;
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
];
const REVIEW_TARGETS: ClothingTarget[] = ["maybe", "reject", "broken"];
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
const FILTERS: { value: ClothingFilter; label: string }[] = [
  { value: "remaining", label: "Remaining" },
  { value: "reviewed", label: "Reviewed" },
  { value: "all", label: "All" },
  { value: "maybe", label: "Maybe" },
  { value: "reject", label: "Reject" },
];
const QUEUE_BATCH_SIZE = 100;

export function ClothingOrganizer({ id }: { id: string }) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const dragStart = React.useRef<DragState | null>(null);
  const [filter, setFilter] = React.useState<ClothingFilter>("remaining");
  const [selectedId, setSelectedId] = React.useState("");
  const [busyTarget, setBusyTarget] = React.useState<ClothingTarget | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [startingRender, setStartingRender] = React.useState(false);
  const [selectedVariantId, setSelectedVariantId] = React.useState("");
  const [queueLimit, setQueueLimit] = React.useState(QUEUE_BATCH_SIZE);
  const [drag, setDrag] = React.useState({ active: false, x: 0, y: 0 });

  const { data, isLoading, mutate } = useSWR(
    ["gta-clothing", id],
    () => api.gta.clothing.list(id),
    {
      keepPreviousData: true,
      refreshInterval: 0,
    },
  );

  const items = React.useMemo(() => data?.items ?? [], [data?.items]);
  const visibleItems = React.useMemo(
    () => filterClothingItems(items, filter),
    [items, filter],
  );
  const queueItems = visibleItems.slice(0, queueLimit);
  const selected =
    (selectedId ? visibleItems.find((item) => item.id === selectedId) : null) ??
    visibleItems[0] ??
    items[0] ??
    null;
  const selectedVariant = selected?.previewVariants.find(
    (variant) => variant.id === selectedVariantId,
  ) ?? selected?.previewVariants[0] ?? null;
  const dragTarget = selected ? targetFromDrag(drag.x, drag.y, selected.suggestedTarget) : null;

  React.useEffect(() => {
    setQueueLimit(QUEUE_BATCH_SIZE);
  }, [filter]);

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
    await mutate();
  }

  async function decide(item: ClothingAsset, target: ClothingTarget) {
    try {
      setBusyTarget(target);
      const nextData = await api.gta.clothing.decide(id, item.id, target);
      mutate(nextData, false);
      selectNextItem(item.id, nextData.items);
      toast.success(`${item.name} saved as ${clothingTargetMeta(target).label}`);
    } catch (error) {
      toast.error("Failed to save clothing decision", {
        description: errorDescription(error),
      });
    } finally {
      setBusyTarget(null);
    }
  }

  async function clearDecision(item: ClothingAsset) {
    try {
      const nextData = await api.gta.clothing.clear(id, item.id);
      mutate(nextData, false);
      toast.success(`${item.name} moved back to remaining`);
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
      mutate(result.library, false);
      const totalBytes = Array.from(files).reduce((total, file) => total + file.size, 0);
      toast.success(`${result.uploaded.length} clothing asset file uploaded`, {
        description: `${formatBytes(totalBytes)} · item renders queued`,
      });
    } catch (error) {
      toast.error("Upload failed", { description: errorDescription(error) });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function renderCatalog(force = false) {
    try {
      setStartingRender(true);
      const nextData = await api.gta.clothing.render(id, force);
      mutate(nextData, false);
      toast.success(force ? "Catalog rebuild queued" : "Missing item renders queued");
    } catch (error) {
      toast.error("Failed to start item renderer", {
        description: errorDescription(error),
      });
    } finally {
      setStartingRender(false);
    }
  }

  function selectNextItem(currentId: string, nextItems: ClothingAsset[]) {
    const currentIndex = nextItems.findIndex((item) => item.id === currentId);
    const afterCurrent = nextItems
      .slice(Math.max(0, currentIndex + 1))
      .find((item) => !item.decision);
    const beforeCurrent = nextItems.slice(0, Math.max(0, currentIndex)).find((item) => !item.decision);
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
        title="Clothing"
        description="Sort stable, item-only renders from GTA clothing assets."
        icon={ArchiveIcon}
        actions={
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,.ydd,.ytd,.ymt,.yft"
              multiple
              className="hidden"
              onChange={(event) => void upload(event.currentTarget.files)}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => void renderCatalog()}
              disabled={startingRender || data?.renderer.state === "queued" || data?.renderer.state === "running"}
            >
              <PlayIcon /> {startingRender ? "Starting" : "Render missing"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void refresh()}
              disabled={isLoading || uploading}
            >
              <RefreshCwIcon /> Refresh
            </Button>
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <UploadIcon /> {uploading ? "Uploading" : "Upload assets"}
            </Button>
          </>
        }
      />

      {isLoading && !data ? (
        <ClothingOrganizerSkeleton />
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ClothingStat label="Pieces" value={data.totals.total} />
            <ClothingStat label="Reviewed" value={data.totals.reviewed} />
            <ClothingStat label="Remaining" value={data.totals.remaining} />
            <ClothingStat
              label="Rendered"
              value={`${data.renderer.totals.ready}/${data.renderer.totals.assets || data.totals.total}`}
            />
          </div>

          <RendererStatus renderer={data.renderer} onRebuild={() => void renderCatalog(true)} />

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <SectionCard
              title={selected ? selected.name : "Review deck"}
              description={selected ? selected.sourceCategory : data.assetRoot}
              icon={ArchiveIcon}
              action={
                selected?.decision ? (
                  <Badge variant="secondary">
                    {clothingTargetMeta(selected.decision.target).label}
                  </Badge>
                ) : selected ? (
                  <Badge variant="outline">
                    Suggested {clothingTargetMeta(selected.suggestedTarget).label}
                  </Badge>
                ) : undefined
              }
              bodyClassName="p-0"
            >
              {selected ? (
                <div className="grid min-h-[40rem] lg:grid-cols-[minmax(0,1fr)_18rem]">
                  <div className="flex min-h-[28rem] flex-col items-center justify-center gap-3 overflow-hidden bg-background p-4">
                    <div
                      className="relative flex aspect-[4/5] w-full max-w-[34rem] touch-none select-none items-center justify-center rounded-lg border border-border bg-muted/25 shadow-panel"
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
                      <ClothingPreview
                        item={selected}
                        previewUrl={selectedVariant?.previewUrl ?? selected.previewUrl}
                      />
                      {dragTarget && (
                        <div className="absolute left-4 top-4 rounded-lg border border-primary/30 bg-background/90 px-3 py-2 text-sm font-semibold text-foreground shadow-panel backdrop-blur">
                          {clothingTargetMeta(dragTarget).label}
                        </div>
                      )}
                    </div>
                    {selected.previewVariants.length > 1 && (
                      <>
                        <TextureVariantPicker
                          item={selected}
                          selectedId={selectedVariant?.id ?? ""}
                          onSelect={setSelectedVariantId}
                        />
                        {(selectedVariant?.formLabel || selectedVariant?.textureLabel) && (
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            {selectedVariant.formLabel && (
                              <Badge variant="secondary">{selectedVariant.formLabel}</Badge>
                            )}
                            {selectedVariant.textureLabel && (
                              <Badge variant="outline">{selectedVariant.textureLabel}</Badge>
                            )}
                            {selectedVariant.isEmpty && (
                              <Badge variant="outline">Invisible / context-only</Badge>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex flex-col border-t border-border lg:border-l lg:border-t-0">
                    <div className="grid gap-3 border-b border-border p-4">
                      <AssetMetadata item={selected} />
                      {selected.decision && (
                        <div className="rounded-lg border border-border bg-muted/20 p-3">
                          <div className="text-xs font-medium text-muted-foreground">Saved</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <Badge>{clothingTargetMeta(selected.decision.target).label}</Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatRelative(selected.decision.decidedAt)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="grid gap-3 p-4">
                      <TargetButtonGrid
                        targets={PRIMARY_TARGETS}
                        busyTarget={busyTarget}
                        suggestedTarget={selected.suggestedTarget}
                        onSelect={(target) => void decide(selected, target)}
                      />
                      <div className="h-px bg-border" />
                      <TargetButtonGrid
                        targets={REVIEW_TARGETS}
                        busyTarget={busyTarget}
                        suggestedTarget={selected.suggestedTarget}
                        onSelect={(target) => void decide(selected, target)}
                      />
                      {selected.decision && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void clearDecision(selected)}
                        >
                          Move back
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <EmptyClothingState />
              )}
            </SectionCard>

            <SectionCard
              title={`${visibleItems.length} in queue`}
              description={filterLabel(filter)}
              icon={TagsIcon}
              bodyClassName="p-0"
            >
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
              <div className="max-h-[38rem] overflow-y-auto">
                {visibleItems.length ? (
                  <>
                    {queueItems.map((item) => (
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
                            <img
                              src={item.previewUrl}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-contain p-1"
                            />
                          ) : (
                            <ArchiveIcon className="size-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-foreground">
                            {item.name}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            <Badge variant={item.decision ? "secondary" : "outline"}>
                              {clothingTargetMeta(
                                item.decision?.target ?? item.suggestedTarget,
                              ).label}
                            </Badge>
                            {item.componentHints.slice(0, 2).map((hint) => (
                              <Badge key={hint} variant="outline" className="font-mono">
                                {hint}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </button>
                    ))}
                    {queueItems.length < visibleItems.length && (
                      <div className="p-3">
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={() => setQueueLimit((limit) => limit + QUEUE_BATCH_SIZE)}
                        >
                          Load {Math.min(QUEUE_BATCH_SIZE, visibleItems.length - queueItems.length)} more
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-6 text-sm text-muted-foreground">No clothing pieces here.</div>
                )}
              </div>
            </SectionCard>
          </div>
        </>
      ) : (
        <EmptyClothingState />
      )}
    </div>
  );
}

function ClothingPreview({
  item,
  previewUrl,
}: {
  item: ClothingAsset;
  previewUrl: string | null;
}) {
  if (!previewUrl) {
    return (
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        {item.renderStatus === "rendering" ? (
          <RefreshCwIcon className="size-12 animate-spin" />
        ) : item.renderStatus === "failed" ? (
          <AlertTriangleIcon className="size-12 text-destructive" />
        ) : (
          <BoxIcon className="size-12" />
        )}
        <span className="max-w-72 text-center text-sm">
          {item.renderStatus === "rendering"
            ? "Rendering item"
            : item.renderStatus === "failed"
              ? item.renderError ?? "Item render failed"
              : "Item render pending"}
        </span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={previewUrl}
      alt={`${item.name} preview`}
      draggable={false}
      className="h-full max-h-[38rem] w-full object-contain p-2"
    />
  );
}

function TextureVariantPicker({
  item,
  selectedId,
  onSelect,
}: {
  item: ClothingAsset;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex w-full max-w-[34rem] gap-2 overflow-x-auto pb-1">
      {item.previewVariants.map((variant) => (
        <button
          key={variant.id}
          type="button"
          title={variant.label}
          aria-label={variant.label}
          aria-pressed={variant.id === selectedId}
          className={cn(
            "size-14 shrink-0 overflow-hidden rounded-md border bg-muted/20 p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            variant.id === selectedId ? "border-primary" : "border-border hover:border-foreground/35",
          )}
          onClick={() => onSelect(variant.id)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={variant.previewUrl} alt="" className="size-full object-contain" />
        </button>
      ))}
    </div>
  );
}

function RendererStatus({
  renderer,
  onRebuild,
}: {
  renderer: ClothingLibraryPayload["renderer"];
  onRebuild: () => void;
}) {
  const active = renderer.state === "queued" || renderer.state === "running";
  const hasErrors = renderer.state === "failed" || renderer.state === "complete_with_errors";
  return (
    <div className="flex min-h-12 flex-wrap items-center gap-3 border-y border-border bg-muted/15 px-4 py-2.5">
      {active ? (
        <RefreshCwIcon className="size-4 animate-spin text-muted-foreground" />
      ) : hasErrors ? (
        <AlertTriangleIcon className="size-4 text-destructive" />
      ) : (
        <BoxIcon className="size-4 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1 text-sm">
        <span className="font-medium text-foreground">{rendererStateLabel(renderer.state)}</span>
        {active && (
          <span className="ml-2 text-muted-foreground">
            {renderer.totals.ready + renderer.totals.failed}/{renderer.totals.assets || "…"} pieces
          </span>
        )}
        {renderer.error && <span className="ml-2 text-destructive">{renderer.error}</span>}
      </div>
      {!active && renderer.state !== "idle" && (
        <Button type="button" size="sm" variant="ghost" onClick={onRebuild}>
          <RefreshCwIcon /> Rebuild all
        </Button>
      )}
    </div>
  );
}

function rendererStateLabel(state: ClothingLibraryPayload["renderer"]["state"]): string {
  if (state === "queued") return "Item renderer queued";
  if (state === "running") return "Rendering item catalog";
  if (state === "complete") return "Item catalog ready";
  if (state === "complete_with_errors") return "Catalog ready with render errors";
  if (state === "failed") return "Item renderer failed";
  return "Item catalog has not been rendered";
}

function TargetButtonGrid({
  targets,
  busyTarget,
  suggestedTarget,
  onSelect,
}: {
  targets: ClothingTarget[];
  busyTarget: ClothingTarget | null;
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
            variant={target === suggestedTarget ? "secondary" : "outline"}
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

function AssetMetadata({ item }: { item: ClothingAsset }) {
  return (
    <div className="grid gap-2 text-xs text-muted-foreground">
      <div className="truncate font-mono">{item.relativePath}</div>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="outline">{item.gender}</Badge>
        <Badge variant="outline">
          {item.fileCounts.drawables} {item.fileCounts.drawables === 1 ? "fit form" : "fit forms"}
        </Badge>
        <Badge variant="outline">
          {item.fileCounts.textures} {item.fileCounts.textures === 1 ? "color" : "colors"}
        </Badge>
        <Badge variant="outline">{item.previewVariants.length || 0} renders</Badge>
      </div>
      {item.componentHints.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {item.componentHints.map((hint) => (
            <Badge key={hint} variant="secondary" className="font-mono">
              {hint}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function ClothingStat({
  label,
  value,
  compact,
}: {
  label: string;
  value: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 truncate font-heading font-semibold text-foreground",
          compact ? "text-sm" : "text-2xl",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function ClothingOrganizerSkeleton() {
  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[86px] rounded-lg" />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-[44rem] rounded-lg" />
        <Skeleton className="h-[44rem] rounded-lg" />
      </div>
    </div>
  );
}

function EmptyClothingState() {
  return (
    <div className="flex min-h-[22rem] items-center justify-center p-6 text-sm text-muted-foreground">
      No clothing pieces found.
    </div>
  );
}

function filterClothingItems(items: ClothingAsset[], filter: ClothingFilter) {
  if (filter === "all") return items;
  if (filter === "remaining") return items.filter((item) => !item.decision);
  if (filter === "reviewed") return items.filter((item) => item.decision);
  return items.filter((item) => item.decision?.target === filter);
}

function filterLabel(filter: ClothingFilter) {
  if (filter === "all") return "All pieces";
  if (filter === "remaining") return "Unreviewed pieces";
  if (filter === "reviewed") return "Saved decisions";
  return CLOTHING_TARGETS.find((target) => target.value === filter)?.label ?? filter;
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
