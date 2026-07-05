"use client";

import * as React from "react";
import useSWR from "swr";
import { useParams } from "next/navigation";
import {
  LocateFixedIcon,
  MapIcon,
  MinusIcon,
  PlusIcon,
  RotateCcwIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import {
  formatGtaCoords,
  formatGtaHealth,
  formatGtaVehicle,
  mappedGtaPlayers,
  projectGtaPosition,
  type GtaMappedPlayer,
} from "@/lib/gta-map-view";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/panel/page-header";
import { SectionCard } from "@/components/panel/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const MIN_ZOOM = 0.75;
const MAX_ZOOM = 2.25;
const ZOOM_STEP = 0.2;
const surfaceGridStyle = {
  backgroundImage:
    "linear-gradient(to right, color-mix(in oklch, var(--border) 55%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklch, var(--border) 55%, transparent) 1px, transparent 1px)",
  backgroundSize: "44px 44px",
} satisfies React.CSSProperties;
const mapBackgroundImage =
  "linear-gradient(135deg, color-mix(in oklch, var(--muted) 78%, transparent), var(--background)), linear-gradient(45deg, transparent 0 48%, color-mix(in oklch, var(--primary) 10%, transparent) 48% 52%, transparent 52% 100%)";
const mapGridImage =
  "repeating-linear-gradient(0deg, transparent, transparent 31px, color-mix(in oklch, var(--primary) 16%, transparent) 32px), repeating-linear-gradient(90deg, transparent, transparent 31px, color-mix(in oklch, var(--primary) 16%, transparent) 32px)";

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
};

export default function GtaMapPage() {
  const { id } = useParams<{ id: string }>();
  const [zoom, setZoom] = React.useState(1);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const [activePlayerId, setActivePlayerId] = React.useState("");
  const drag = React.useRef<DragState | null>(null);

  const { data, isLoading } = useSWR(
    ["gta-map", id],
    () => api.gta.players.list(id),
    { refreshInterval: 2000 },
  );

  const mappedPlayers = mappedGtaPlayers(data?.players ?? []);
  const onlineCount = data?.onlineCount ?? 0;
  const unmappedCount = Math.max(0, onlineCount - mappedPlayers.length);
  const bridgeOnline = data?.bridge.online ?? false;
  const activePlayer =
    mappedPlayers.find((player) => player.id === activePlayerId) ??
    mappedPlayers[0] ??
    null;

  function zoomBy(delta: number) {
    setZoom((current) => clampZoom(current + delta));
  }

  function resetView() {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }

  function startPan(event: React.PointerEvent<HTMLDivElement>) {
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePan(event: React.PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    setOffset({
      x: current.offsetX + event.clientX - current.startX,
      y: current.offsetY + event.clientY - current.startY,
    });
  }

  function stopPan(event: React.PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Map"
        description="Live GTA player positions and health telemetry."
        icon={MapIcon}
      />

      <SectionCard
        title="Live server map"
        description={
          unmappedCount > 0
            ? `${mappedPlayers.length} mapped, ${unmappedCount} without coordinates`
            : `${mappedPlayers.length} mapped players`
        }
        icon={MapIcon}
        action={
          <div className="flex flex-wrap justify-end gap-2">
            <Badge variant={bridgeOnline ? "default" : "outline"}>
              {bridgeOnline ? "Bridge online" : "Bridge offline"}
            </Badge>
            <Badge variant="secondary">{onlineCount} online</Badge>
          </div>
        }
        bodyClassName="p-0"
      >
        <div className="grid min-h-[34rem] lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="relative min-h-[24rem] overflow-hidden bg-background">
            <div
              className="absolute inset-0 cursor-grab touch-none select-none overflow-hidden active:cursor-grabbing"
              style={surfaceGridStyle}
              onPointerDown={startPan}
              onPointerMove={movePan}
              onPointerUp={stopPan}
              onPointerCancel={stopPan}
            >
              <div
                className="absolute inset-[6%] rounded-lg border border-border/80 shadow-inner"
                style={{
                  backgroundImage: mapBackgroundImage,
                  transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                  transformOrigin: "center",
                }}
              >
                <div
                  className="absolute inset-0 rounded-lg"
                  style={{ backgroundImage: mapGridImage }}
                />
                <div className="absolute left-1/2 top-0 h-full w-px bg-primary/30" />
                <div className="absolute left-0 top-1/2 h-px w-full bg-primary/30" />
                <div className="absolute left-1/2 top-1/2 size-44 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/25" />
                <div className="absolute left-1/2 top-1/2 size-72 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/15" />

                {mappedPlayers.map((player) => (
                  <PlayerMarker
                    key={player.id}
                    player={player}
                    active={player.id === activePlayer?.id}
                    onSelect={() => setActivePlayerId(player.id)}
                  />
                ))}
              </div>
            </div>

            <div className="absolute right-3 top-3 flex flex-col gap-2">
              <Badge variant="default">{onlineCount} online</Badge>
              <div className="flex rounded-lg border border-border bg-background/90 p-1 shadow-sm backdrop-blur">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Zoom out"
                  onClick={() => zoomBy(-ZOOM_STEP)}
                >
                  <MinusIcon />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Reset map view"
                  onClick={resetView}
                >
                  <RotateCcwIcon />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Zoom in"
                  onClick={() => zoomBy(ZOOM_STEP)}
                >
                  <PlusIcon />
                </Button>
              </div>
            </div>

            {mappedPlayers.length === 0 && (
              <div className="absolute inset-x-4 top-1/2 mx-auto max-w-sm -translate-y-1/2 rounded-lg border border-border bg-background/95 p-4 text-center shadow-sm">
                <p className="font-medium text-foreground">
                  {bridgeOnline ? "No mapped players" : "Bridge offline"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isLoading ? "Loading live telemetry..." : "Waiting for live coordinates."}
                </p>
              </div>
            )}
          </div>

          <PlayerDetails player={activePlayer} />
        </div>
      </SectionCard>
    </div>
  );
}

function PlayerMarker({
  player,
  active,
  onSelect,
}: {
  player: GtaMappedPlayer;
  active: boolean;
  onSelect: () => void;
}) {
  const point = projectGtaPosition(player.position);

  return (
    <button
      type="button"
      className={cn(
        "group absolute z-10 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-background text-primary shadow-sm transition hover:scale-110 hover:border-primary focus-visible:border-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active ? "border-primary ring-3 ring-primary/20" : "border-border",
      )}
      style={{ left: `${point.xPercent}%`, top: `${point.yPercent}%` }}
      aria-label={`${player.name} map marker`}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseEnter={onSelect}
      onFocus={onSelect}
      onClick={onSelect}
    >
      <LocateFixedIcon className="size-4" />
      <span className="pointer-events-none absolute left-1/2 top-full mt-1 max-w-36 -translate-x-1/2 truncate rounded bg-background/95 px-1.5 py-0.5 text-[0.68rem] font-medium text-foreground opacity-0 shadow-sm ring-1 ring-border transition group-hover:opacity-100 group-focus-visible:opacity-100">
        {player.name}
      </span>
    </button>
  );
}

function PlayerDetails({ player }: { player: GtaMappedPlayer | null }) {
  return (
    <aside className="border-t border-border bg-muted/20 p-4 lg:border-l lg:border-t-0">
      {player ? (
        <div className="flex h-full flex-col gap-4">
          <div className="min-w-0">
            <h2 className="truncate font-heading text-lg font-semibold text-foreground">
              {player.name}
            </h2>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>Server ID {player.serverId ?? "Unknown"}</span>
              <span>Ping {player.pingMs !== undefined ? `${player.pingMs} ms` : "Unknown"}</span>
            </div>
          </div>

          <div className="grid gap-2">
            <DetailRow label="Health" value={formatGtaHealth(player.health)} />
            <DetailRow label="Armour" value={formatGtaHealth(player.armour)} />
            <DetailRow label="Vehicle" value={formatGtaVehicle(player.vehicle)} />
            <DetailRow label="Heading" value={formatHeading(player.heading)} />
            <DetailRow label="Coords" value={formatGtaCoords(player.position)} />
            <DetailRow
              label="Seen"
              value={formatRelative(player.lastHeartbeatAt ?? player.lastSeenAt)}
            />
          </div>
        </div>
      ) : (
        <div className="flex h-full min-h-44 items-center justify-center rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          No player selected.
        </div>
      )}
    </aside>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-lg border border-border bg-background/80 p-3">
      <span className="text-xs font-medium uppercase text-muted-foreground">{label}</span>
      <span className="break-words text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function formatHeading(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? "Unknown" : `${Math.round(value)} deg`;
}

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100));
}
