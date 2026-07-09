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
import { ClothingAuditViewer } from "@/components/gta/clothing-audit-viewer";
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
  "body",
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

export function ClothingOrganizer({ id }: { id: string }) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const dragStart = React.useRef<DragState | null>(null);
  const [filter, setFilter] = React.useState<ClothingFilter>("remaining");
  const [selectedId, setSelectedId] = React.useState("");
  const [busyTarget, setBusyTarget] = React.useState<ClothingTarget | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [drag, setDrag] = React.useState({ active: false, x: 0, y: 0 });

  const { data, isLoading, mutate } = useSWR(
    ["gta-clothing", id],
    () => api.gta.clothing.list(id),
    { keepPreviousData: true },
  );

  const items = React.useMemo(() => data?.items ?? [], [data?.items]);
  const visibleItems = React.useMemo(
    () => filterClothingItems(items, filter),
    [items, filter],
  );
  const selected =
    (selectedId ? visibleItems.find((item) => item.id === selectedId) : null) ??
    visibleItems[0] ??
    items[0] ??
    null;
  const dragTarget = selected ? targetFromDrag(drag.x, drag.y, selected.suggestedTarget) : null;

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
        description="Review captured GTA clothing previews, then organize archive install targets."
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
              disabled={isLoading || uploading}
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

      <ClothingAuditViewer id={id} />

      {isLoading && !data ? (
        <ClothingOrganizerSkeleton />
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ClothingStat label="Assets" value={data.totals.total} />
            <ClothingStat label="Reviewed" value={data.totals.reviewed} />
            <ClothingStat label="Remaining" value={data.totals.remaining} />
            <ClothingStat label="Manifest" value={shortPath(data.manifestPath)} compact />
          </div>

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
                  <div className="flex min-h-[28rem] items-center justify-center overflow-hidden bg-background p-4">
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
                      <ClothingPreview item={selected} />
                      {dragTarget && (
                        <div className="absolute left-4 top-4 rounded-lg border border-primary/30 bg-background/90 px-3 py-2 text-sm font-semibold text-foreground shadow-panel backdrop-blur">
                          {clothingTargetMeta(dragTarget).label}
                        </div>
                      )}
                    </div>
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
                          <img
                            src={item.previewUrl}
                            alt=""
                            className="h-full w-full object-cover"
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
                  ))
                ) : (
                  <div className="p-6 text-sm text-muted-foreground">No clothing archives here.</div>
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

function ClothingPreview({ item }: { item: ClothingAsset }) {
  if (!item.previewUrl) {
    return (
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <ArchiveIcon className="size-12" />
        <span className="text-sm">No preview image</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.previewUrl}
      alt={`${item.name} preview`}
      draggable={false}
      className="h-full max-h-[38rem] w-full object-contain p-2"
    />
  );
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
        <Badge variant="outline">{item.fileCounts.drawables} ydd</Badge>
        <Badge variant="outline">{item.fileCounts.textures} ytd</Badge>
        <Badge variant="outline">{item.fileCounts.images} preview</Badge>
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
      No clothing archives found.
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
  if (filter === "all") return "All archives";
  if (filter === "remaining") return "Unreviewed archives";
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

function shortPath(filePath: string) {
  const marker = "/games/gta/";
  const index = filePath.indexOf(marker);
  if (index >= 0) return filePath.slice(index + 1);
  return filePath;
}

function errorDescription(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
