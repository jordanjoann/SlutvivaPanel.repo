"use client";

import * as React from "react";
import useSWR from "swr";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import {
  SearchIcon,
  UserXIcon,
  BanIcon,
  ShieldIcon,
  ShieldOffIcon,
  UsersIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/panel/page-header";
import { SectionCard } from "@/components/panel/section-card";
import { EmptyState } from "@/components/panel/empty-state";
import { useConfirm } from "@/components/panel/confirm-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format";
import type { Player } from "@/lib/types";

export default function PlayersPage() {
  const { id } = useParams<{ id: string }>();
  const [search, setSearch] = React.useState("");
  const { confirm, node } = useConfirm();
  const { data, isLoading, mutate } = useSWR(
    ["players", id],
    () => api.players.list(id),
    { refreshInterval: 4000 },
  );

  async function act(action: string, name: string, label: string) {
    try {
      await api.players.action(id, action, name);
      toast.success(`${label} ${name}`);
      mutate();
    } catch (e) {
      toast.error(`Failed to ${action}`, {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  }

  const players = data?.players ?? [];
  const filtered = players.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-5">
      {node}
      <PageHeader
        title="Players"
        description="Online players on this server."
        actions={
          <div className="relative w-56">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search players…"
              className="h-9 pl-8"
            />
          </div>
        }
      />

      {isLoading && !data ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title={players.length === 0 ? "No players online" : "No matching players"}
          description={
            players.length === 0
              ? "Players will appear here when they connect to the server."
              : "Try a different search."
          }
        />
      ) : (
        <SectionCard
          title={`${players.length} online`}
          icon={UsersIcon}
          bodyClassName="p-0"
        >
          <div className="divide-y divide-border">
            {filtered.map((p) => (
              <PlayerRow
                key={p.uid}
                player={p}
                onAct={act}
                onBan={() =>
                  confirm({
                    title: `Ban ${p.name}?`,
                    description: "The player will be disconnected and blocked from rejoining.",
                    confirmLabel: "Ban player",
                    destructive: true,
                    onConfirm: () => act("ban", p.name, "Banned"),
                  })
                }
              />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function PlayerRow({
  player,
  onAct,
  onBan,
}: {
  player: Player;
  onAct: (action: string, name: string, label: string) => void;
  onBan: () => void;
}) {
  const pingColor =
    player.pingMs < 60 ? "text-success" : player.pingMs < 120 ? "text-warning" : "text-destructive";
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Avatar className="size-9">
        <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
          {player.name.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{player.name}</span>
          {player.isOp && (
            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              OP
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className={cn("tabular-nums", pingColor)}>{Math.round(player.pingMs)} ms</span>
          <span>·</span>
          <span>{formatDuration(player.playtimeSeconds)} played</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {player.isOp ? (
          <Button variant="outline" size="sm" onClick={() => onAct("deop", player.name, "De-opped")}>
            <ShieldOffIcon /> De-OP
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => onAct("op", player.name, "Opped")}>
            <ShieldIcon /> OP
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => onAct("kick", player.name, "Kicked")}>
          <UserXIcon /> Kick
        </Button>
        <Button variant="destructive" size="sm" onClick={onBan}>
          <BanIcon /> Ban
        </Button>
      </div>
    </div>
  );
}
