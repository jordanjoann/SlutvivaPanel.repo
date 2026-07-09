"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  CameraIcon,
  ImageOffIcon,
  RefreshCwIcon,
  ShirtIcon,
  TagsIcon,
  WandSparklesIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/format";
import type { GtaPlayerSummary } from "@/lib/types";
import {
  CLOTHING_AUDIT_TAGS,
  clothingAuditTagMeta,
  type ClothingAuditItem,
  type ClothingAuditTag,
} from "@/lib/gta-clothing";
import { SectionCard } from "@/components/panel/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type AuditFilter = "all" | "captured" | "missing" | "untagged" | ClothingAuditTag;

const FILTERS: { value: AuditFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "captured", label: "Captured" },
  { value: "missing", label: "Missing images" },
  { value: "untagged", label: "Untagged" },
  { value: "maybe", label: "Maybe" },
  { value: "broken", label: "Broken" },
];
const RENDER_MODES = [
  { value: "missing", label: "Missing drawables" },
  { value: "textures", label: "Texture variants" },
  { value: "overwrite", label: "Overwrite drawables" },
  { value: "overwrite-textures", label: "Overwrite textures" },
] as const;

type RenderMode = (typeof RENDER_MODES)[number]["value"];

export function ClothingAuditViewer({ id }: { id: string }) {
  const [filter, setFilter] = React.useState<AuditFilter>("all");
  const [selectedId, setSelectedId] = React.useState("");
  const [renderPlayerId, setRenderPlayerId] = React.useState("");
  const [renderMode, setRenderMode] = React.useState<RenderMode>("missing");
  const [busyTag, setBusyTag] = React.useState<ClothingAuditTag | null>(null);
  const [rendering, setRendering] = React.useState(false);
  const [renderPollUntil, setRenderPollUntil] = React.useState<number | null>(null);

  const { data, isLoading, mutate } = useSWR(
    ["gta-clothing-audit", id],
    () => api.gta.clothing.audit.list(id),
    { keepPreviousData: true },
  );
  const { data: playersData } = useSWR(
    ["gta-clothing-audit-players", id],
    () => api.gta.players.list(id),
    { refreshInterval: 5000 },
  );

  const items = React.useMemo(() => data?.items ?? [], [data?.items]);
  const visibleItems = React.useMemo(() => filterAuditItems(items, filter), [items, filter]);
  const onlinePlayers = React.useMemo(
    () => (playersData?.players ?? []).filter((player) => player.online && player.serverId !== undefined),
    [playersData?.players],
  );
  const renderPlayer =
    playerByServerId(onlinePlayers, renderPlayerId) ??
    onlinePlayers[0] ??
    null;
  const selected =
    (selectedId ? visibleItems.find((item) => item.id === selectedId) : null) ??
    visibleItems[0] ??
    items[0] ??
    null;

  React.useEffect(() => {
    if (!renderPollUntil) return;

    const interval = window.setInterval(() => {
      if (Date.now() >= renderPollUntil) {
        setRenderPollUntil(null);
        return;
      }
      void mutate();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [mutate, renderPollUntil]);

  async function refresh() {
    await mutate();
  }

  async function startRender() {
    if (renderPlayer?.serverId === undefined) {
      toast.error("No online GTA player is available for rendering");
      return;
    }

    try {
      setRendering(true);
      await api.instances.command(id, `clothingrenderall ${renderPlayer.serverId} all ${renderMode}`);
      toast.success("Automatic clothing render started", {
        description: `${renderModeMeta(renderMode).label} using ${renderPlayer.name}.`,
      });
      setRenderPollUntil(Date.now() + 10 * 60 * 1000);
      window.setTimeout(() => void mutate(), 2500);
    } catch (error) {
      toast.error("Failed to start clothing render", {
        description: errorDescription(error),
      });
    } finally {
      setRendering(false);
    }
  }

  async function decide(item: ClothingAuditItem, tag: ClothingAuditTag) {
    try {
      setBusyTag(tag);
      const nextData = await api.gta.clothing.audit.decide(id, item.id, tag);
      mutate(nextData, false);
      toast.success(`Drawable ${item.drawable}:${item.texture} saved as ${clothingAuditTagMeta(tag).label}`);
    } catch (error) {
      toast.error("Failed to save audit tag", {
        description: errorDescription(error),
      });
    } finally {
      setBusyTag(null);
    }
  }

  if (isLoading && !data) return <ClothingAuditSkeleton />;

  const renderAction = (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        items={onlinePlayers.map((player) => ({
          value: String(player.serverId),
          label: player.name,
        }))}
        value={renderPlayer?.serverId !== undefined ? String(renderPlayer.serverId) : ""}
        onValueChange={(value) => setRenderPlayerId(value ?? "")}
        disabled={onlinePlayers.length === 0 || rendering}
      >
        <SelectTrigger className="h-9 w-40" aria-label="Render client">
          <SelectValue placeholder="No player" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {onlinePlayers.map((player) => (
              <SelectItem key={player.id} value={String(player.serverId)}>
                {player.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Select
        value={renderMode}
        onValueChange={(value) => {
          if (isRenderMode(value)) setRenderMode(value);
        }}
        disabled={rendering}
      >
        <SelectTrigger className="h-9 w-44" aria-label="Render mode">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {RENDER_MODES.map((mode) => (
              <SelectItem key={mode.value} value={mode.value}>
                {mode.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        disabled={rendering || !renderPlayer}
        onClick={() => void startRender()}
      >
        <WandSparklesIcon />
        {rendering ? "Starting" : renderButtonLabel(renderMode)}
      </Button>
      <Button type="button" variant="outline" onClick={() => void refresh()}>
        <RefreshCwIcon /> Refresh
      </Button>
    </div>
  );

  if (!data || data.items.length === 0) {
    return (
      <SectionCard
        title="Captured GTA Audit"
        description="No live drawable audit data has been captured yet."
        icon={CameraIcon}
        action={renderAction}
      >
        <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
          Start an automatic render job to populate clothing previews.
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Captured GTA Audit"
      description="Review live GTA drawable screenshots and save their real category."
      icon={CameraIcon}
      action={renderAction}
      bodyClassName="p-0"
    >
      <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-3">
        <AuditStat label="Items" value={data.totals.total} />
        <AuditStat label="Captured" value={`${data.totals.captured} / ${data.totals.total}`} />
        <AuditStat label="Tagged" value={data.totals.tagged} />
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-h-[32rem] p-4">
          {selected ? (
            <div className="flex h-full min-h-[30rem] items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
              <AuditPreview item={selected} />
            </div>
          ) : (
            <div className="flex h-full min-h-[30rem] items-center justify-center text-sm text-muted-foreground">
              No matching audit items.
            </div>
          )}
        </div>

        <div className="border-t border-border xl:border-l xl:border-t-0">
          {selected ? (
            <>
              <div className="grid gap-3 border-b border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-heading text-base font-semibold text-foreground">
                      {selected.componentLabel}
                    </div>
                    <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
                      {selected.model} / component {selected.component}
                    </div>
                  </div>
                  <Badge variant={selected.hasPreview ? "secondary" : "outline"}>
                    {selected.hasPreview ? "Captured" : "No image"}
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline">drawable {selected.drawable}</Badge>
                  <Badge variant="outline">texture {selected.texture}</Badge>
                  <Badge variant={selected.tag ? "secondary" : "outline"}>
                    {selected.tag ? clothingAuditTagMeta(selected.tag).label : "Untagged"}
                  </Badge>
                </div>

                <div className="text-xs text-muted-foreground">
                  {selected.updatedAt ? `Updated ${formatRelative(Date.parse(selected.updatedAt))}` : "Not saved yet"}
                </div>
              </div>

              <div className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                {CLOTHING_AUDIT_TAGS.map((tag) => (
                  <Button
                    key={tag.value}
                    type="button"
                    variant={selected.tag === tag.value ? "secondary" : "outline"}
                    disabled={busyTag !== null}
                    onClick={() => void decide(selected, tag.value)}
                    className="justify-start"
                  >
                    <TagsIcon />
                    <span className="truncate">
                      {busyTag === tag.value ? "Saving" : tag.label}
                    </span>
                  </Button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div className="border-t border-border">
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
        <div className="max-h-[25rem] overflow-y-auto">
          {visibleItems.length ? (
            visibleItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "flex w-full items-center gap-3 border-b border-border px-3 py-3 text-left transition-colors hover:bg-muted/35 focus-visible:bg-muted/35 focus-visible:outline-none",
                  item.id === selected?.id && "bg-muted/45",
                )}
                onClick={() => setSelectedId(item.id)}
              >
                <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background">
                  {item.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ShirtIcon className="size-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {item.componentLabel}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="font-mono">
                      {item.drawable}:{item.texture}
                    </Badge>
                    <Badge variant={item.tag ? "secondary" : "outline"}>
                      {item.tag ? clothingAuditTagMeta(item.tag).label : "Untagged"}
                    </Badge>
                  </div>
                </div>
              </button>
            ))
          ) : (
            <div className="p-6 text-sm text-muted-foreground">No audit items match this filter.</div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function AuditPreview({ item }: { item: ClothingAuditItem }) {
  if (!item.previewUrl) {
    return (
      <div className="grid justify-items-center gap-3 px-6 text-center text-muted-foreground">
        <ImageOffIcon className="size-12" />
        <div className="text-sm font-medium text-foreground">No captured screenshot</div>
        <div className="max-w-md text-xs leading-5">
          Use Render Missing to generate this preview. The screenshot file should be named{" "}
          <span className="font-mono text-foreground">{item.id}.jpg</span>.
        </div>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.previewUrl}
      alt={`${item.componentLabel} drawable ${item.drawable} texture ${item.texture}`}
      draggable={false}
      className="h-full max-h-[46rem] w-full object-contain p-2"
    />
  );
}

function playerByServerId(players: GtaPlayerSummary[], serverId: string) {
  if (!serverId) return null;
  return players.find((player) => String(player.serverId) === serverId) ?? null;
}

function renderModeMeta(mode: RenderMode) {
  return RENDER_MODES.find((candidate) => candidate.value === mode) ?? RENDER_MODES[0];
}

function isRenderMode(value: unknown): value is RenderMode {
  return typeof value === "string" && RENDER_MODES.some((mode) => mode.value === value);
}

function renderButtonLabel(mode: RenderMode) {
  switch (mode) {
    case "textures":
      return "Render Textures";
    case "overwrite":
      return "Overwrite Drawables";
    case "overwrite-textures":
      return "Overwrite Textures";
    default:
      return "Render Missing";
  }
}

function AuditStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 font-heading text-xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function ClothingAuditSkeleton() {
  return (
    <SectionCard
      title="Captured GTA Audit"
      description="Loading live drawable audit data."
      icon={CameraIcon}
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Skeleton className="h-[32rem] rounded-lg" />
        <Skeleton className="h-[32rem] rounded-lg" />
      </div>
    </SectionCard>
  );
}

function filterAuditItems(items: ClothingAuditItem[], filter: AuditFilter) {
  if (filter === "all") return items;
  if (filter === "captured") return items.filter((item) => item.hasPreview);
  if (filter === "missing") return items.filter((item) => !item.hasPreview);
  if (filter === "untagged") return items.filter((item) => !item.tag);
  return items.filter((item) => item.tag === filter);
}

function errorDescription(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
