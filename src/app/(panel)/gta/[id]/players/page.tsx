"use client";

import * as React from "react";
import useSWR from "swr";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import {
  BanIcon,
  ClockIcon,
  HistoryIcon,
  MessageSquareWarningIcon,
  SearchIcon,
  UserXIcon,
  UsersIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatDateTime, formatDuration, formatRelative } from "@/lib/format";
import {
  filterGtaPlayers,
  initialGtaPlayerId,
  type GtaPlayerFilter,
} from "@/lib/gta-players-view";
import type {
  GtaPlayerActionResult,
  GtaPlayerIdentifier,
  GtaPlayerSession,
  GtaPlayerSummary,
  GtaPunishment,
  GtaPunishmentType,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/panel/page-header";
import { SectionCard } from "@/components/panel/section-card";
import { useConfirm } from "@/components/panel/confirm-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

const FILTER_OPTIONS: { value: GtaPlayerFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "online", label: "Online" },
  { value: "offline", label: "Offline" },
];

type ReasonAction = Extract<GtaPunishmentType, "warn" | "ban">;

export default function GtaPlayersPage() {
  const { id } = useParams<{ id: string }>();
  const { confirm, node } = useConfirm();
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<GtaPlayerFilter>("all");
  const [selectedId, setSelectedId] = React.useState("");
  const [reasonAction, setReasonAction] = React.useState<ReasonAction | null>(null);
  const [reason, setReason] = React.useState("");
  const [busyAction, setBusyAction] = React.useState<GtaPunishmentType | null>(null);

  const { data, isLoading, mutate } = useSWR(
    ["gta-players", id],
    () => api.gta.players.list(id),
    { refreshInterval: 3000 },
  );

  const players = data?.players ?? [];
  const filteredPlayers = filterGtaPlayers(players, filter, query);
  const selected = players.find((player) => player.id === selectedId) ?? null;

  React.useEffect(() => {
    setSelectedId((currentId) => initialGtaPlayerId(players, currentId));
  }, [players]);

  function closeReasonDialog() {
    setReasonAction(null);
    setReason("");
  }

  async function runAction(
    action: GtaPunishmentType,
    player: GtaPlayerSummary,
    actionReason?: string,
  ) {
    const trimmedReason = actionReason?.trim();
    try {
      setBusyAction(action);
      const result = await api.gta.players.action(id, {
        action,
        playerId: player.id,
        reason: trimmedReason || undefined,
      });
      await mutate();
      toastActionResult(action, player.name, result);
      return true;
    } catch (error) {
      toast.error(`Failed to ${action}`, {
        description: error instanceof Error ? error.message : undefined,
      });
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  function confirmKick(player: GtaPlayerSummary) {
    confirm({
      title: `Kick ${player.name}?`,
      description: "The action is recorded and the player will be disconnected if still online.",
      confirmLabel: "Kick",
      destructive: true,
      onConfirm: async () => {
        await runAction("kick", player);
      },
    });
  }

  function submitReasonAction() {
    if (!selected || !reasonAction) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      toast.error("Reason is required");
      return;
    }

    if (reasonAction === "ban") {
      const player = selected;
      confirm({
        title: `Ban ${player.name}?`,
        description: "The ban will be recorded and the player will be disconnected if online.",
        confirmLabel: "Ban",
        destructive: true,
        onConfirm: async () => {
          if (await runAction("ban", player, trimmedReason)) {
            closeReasonDialog();
          }
        },
      });
      return;
    }

    runAction("warn", selected, trimmedReason).then((ok) => {
      if (ok) closeReasonDialog();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {node}
      <PageHeader
        title="Players"
        description="Track GTA player history and moderation actions."
        icon={UsersIcon}
      />

      {isLoading && !data ? (
        <GtaPlayersSkeleton />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
          <SectionCard
            title={`${filteredPlayers.length} players`}
            description={`${data?.onlineCount ?? 0} online, ${data?.offlineCount ?? 0} offline`}
            icon={UsersIcon}
            action={data ? <BridgeStatus bridge={data.bridge} /> : undefined}
            bodyClassName="p-0"
          >
            <div className="grid gap-3 border-b border-border p-3">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search players"
                  className="pl-8"
                />
              </div>
              <Select
                items={FILTER_OPTIONS}
                value={filter}
                onValueChange={(value) => setFilter(value as GtaPlayerFilter)}
              >
                <SelectTrigger className="w-full" aria-label="Player status filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {FILTER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            {filteredPlayers.length === 0 ? (
              <EmptyBlock>{leftPaneEmptyMessage(players, filter, query)}</EmptyBlock>
            ) : (
              <div className="divide-y divide-border">
                {filteredPlayers.map((player) => (
                  <PlayerRow
                    key={player.id}
                    player={player}
                    selected={player.id === selectedId}
                    onSelect={() => setSelectedId(player.id)}
                  />
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title={selected ? selected.name : "Player details"}
            description={
              selected
                ? `${selected.sessions.length} sessions, ${selected.punishments.length} actions`
                : undefined
            }
            icon={UsersIcon}
            action={
              selected && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!selected.online || busyAction === "kick"}
                    onClick={() => confirmKick(selected)}
                  >
                    <UserXIcon data-icon="inline-start" />
                    Kick
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyAction === "warn"}
                    onClick={() => setReasonAction("warn")}
                  >
                    <MessageSquareWarningIcon data-icon="inline-start" />
                    Warn
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={busyAction === "ban"}
                    onClick={() => setReasonAction("ban")}
                  >
                    <BanIcon data-icon="inline-start" />
                    Ban
                  </Button>
                </div>
              )
            }
          >
            {selected ? (
              <PlayerDetails player={selected} />
            ) : (
              <EmptyBlock>No GTA players tracked yet.</EmptyBlock>
            )}
          </SectionCard>
        </div>
      )}

      <ReasonDialog
        action={reasonAction}
        playerName={selected?.name ?? ""}
        reason={reason}
        busy={busyAction === reasonAction}
        onReasonChange={setReason}
        onOpenChange={(open) => {
          if (!open) closeReasonDialog();
        }}
        onSubmit={submitReasonAction}
      />
    </div>
  );
}

function PlayerRow({
  player,
  selected,
  onSelect,
}: {
  player: GtaPlayerSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        selected && "bg-muted",
      )}
    >
      <PlayerAvatar player={player} />
      <div className="grid min-w-0 flex-1 gap-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium" title={player.name}>
            {player.name}
          </span>
          <StatusBadge online={player.online} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="font-mono">ID {player.serverId ?? "-"}</span>
          <span>{player.pingMs !== undefined ? `${Math.round(player.pingMs)} ms` : "No ping"}</span>
          <span>Last seen {formatRelative(player.lastSeenAt)}</span>
        </div>
      </div>
    </button>
  );
}

function PlayerDetails({ player }: { player: GtaPlayerSummary }) {
  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <PlayerAvatar player={player} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate font-heading text-lg font-semibold">{player.name}</h2>
              <StatusBadge online={player.online} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono">Player {player.id}</span>
              <span className="font-mono">Server ID {player.serverId ?? "-"}</span>
              <span>{player.pingMs !== undefined ? `${Math.round(player.pingMs)} ms` : "No ping"}</span>
            </div>
          </div>
        </div>
        <div className="grid gap-1 text-left text-xs text-muted-foreground sm:text-right">
          <span>First seen {formatRelative(player.firstSeenAt)}</span>
          <span>Last seen {formatRelative(player.lastSeenAt)}</span>
          <span>{formatDuration(player.totalPlaytimeSeconds)} played</span>
        </div>
      </div>

      <Separator />

      <DetailSection title="Identifiers">
        {player.identifiers.length === 0 ? (
          <EmptyLine>No identifiers recorded.</EmptyLine>
        ) : (
          <div className="grid gap-2">
            {player.identifiers.map((identifier) => (
              <IdentifierRow key={`${identifier.type}:${identifier.value}`} identifier={identifier} />
            ))}
          </div>
        )}
      </DetailSection>

      <DetailSection title="Sessions" icon={ClockIcon}>
        {player.sessions.length === 0 ? (
          <EmptyLine>No sessions recorded.</EmptyLine>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {player.sessions.map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </div>
        )}
      </DetailSection>

      <DetailSection title="Punishment history" icon={HistoryIcon}>
        {player.punishments.length === 0 ? (
          <EmptyLine>No punishment history.</EmptyLine>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {player.punishments.map((punishment) => (
              <PunishmentRow key={punishment.id} punishment={punishment} />
            ))}
          </div>
        )}
      </DetailSection>
    </div>
  );
}

function DetailSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-3">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="size-4 text-muted-foreground" />}
        <h3 className="font-heading text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function IdentifierRow({ identifier }: { identifier: GtaPlayerIdentifier }) {
  return (
    <div className="grid gap-1 rounded-lg border border-border px-3 py-2 sm:grid-cols-[7rem_minmax(0,1fr)] sm:items-center">
      <span className="text-xs font-medium uppercase text-muted-foreground">
        {identifier.type}
      </span>
      <span className="min-w-0 break-all font-mono text-xs">{identifier.value}</span>
    </div>
  );
}

function SessionRow({ session }: { session: GtaPlayerSession }) {
  return (
    <div className="grid gap-2 px-3 py-2 text-sm md:grid-cols-[minmax(10rem,1fr)_minmax(8rem,auto)_minmax(10rem,1fr)] md:items-center">
      <div className="min-w-0">
        <div className="truncate font-medium">{session.name}</div>
        <div className="text-xs text-muted-foreground">{formatDateTime(session.joinedAt)}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground md:justify-end">
        <span className="font-mono">ID {session.serverId ?? "-"}</span>
        <span>{formatDuration(session.durationSeconds ?? 0)}</span>
      </div>
      <div className="min-w-0 text-xs text-muted-foreground md:text-right">
        {session.leftAt ? formatDateTime(session.leftAt) : "Online now"}
        {session.dropReason && (
          <span className="block truncate" title={session.dropReason}>
            {session.dropReason}
          </span>
        )}
      </div>
    </div>
  );
}

function PunishmentRow({ punishment }: { punishment: GtaPunishment }) {
  return (
    <div className="grid gap-2 px-3 py-2 text-sm md:grid-cols-[minmax(8rem,auto)_minmax(0,1fr)_minmax(9rem,auto)] md:items-start">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={punishment.type === "ban" ? "destructive" : "secondary"}>
          {punishment.type}
        </Badge>
        <Badge variant={punishment.active ? "outline" : "ghost"}>
          {punishment.active ? "Active" : "Revoked"}
        </Badge>
      </div>
      <div className="min-w-0">
        <p className="break-words text-sm">{punishment.reason}</p>
        {punishment.actor && (
          <p className="mt-1 text-xs text-muted-foreground">
            By {punishment.actor.username}
          </p>
        )}
      </div>
      <div className="text-xs text-muted-foreground md:text-right">
        {formatDateTime(punishment.createdAt)}
      </div>
    </div>
  );
}

function ReasonDialog({
  action,
  playerName,
  reason,
  busy,
  onReasonChange,
  onOpenChange,
  onSubmit,
}: {
  action: ReasonAction | null;
  playerName: string;
  reason: string;
  busy: boolean;
  onReasonChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}) {
  const title = action === "ban" ? `Ban ${playerName}` : `Warn ${playerName}`;
  const description =
    action === "ban"
      ? "Record a ban reason before confirmation."
      : "Record a warning reason for this player.";

  return (
    <Dialog open={Boolean(action)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          onChange={(event) => onReasonChange(event.target.value)}
          placeholder="Reason"
          rows={4}
          autoFocus
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={action === "ban" ? "destructive" : "default"}
            onClick={onSubmit}
            disabled={busy}
          >
            {action === "ban" ? "Ban" : "Warn"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlayerAvatar({
  player,
  size = "default",
}: {
  player: GtaPlayerSummary;
  size?: "default" | "lg";
}) {
  return (
    <Avatar className={cn(size === "lg" ? "size-11" : "size-9")}>
      <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
        {avatarInitials(player.name)}
      </AvatarFallback>
    </Avatar>
  );
}

function StatusBadge({ online }: { online: boolean }) {
  return (
    <Badge variant={online ? "default" : "outline"}>
      {online ? "Online" : "Offline"}
    </Badge>
  );
}

function BridgeStatus({
  bridge,
}: {
  bridge: { online: boolean; lastHeartbeatAt?: number };
}) {
  return (
    <div className="grid justify-items-end gap-1">
      <Badge variant={bridge.online ? "default" : "outline"}>
        {bridge.online ? "Bridge online" : "Bridge offline"}
      </Badge>
      {bridge.lastHeartbeatAt && (
        <span className="text-xs text-muted-foreground">
          Last heartbeat {formatRelative(bridge.lastHeartbeatAt)}
        </span>
      )}
    </div>
  );
}

function leftPaneEmptyMessage(
  players: GtaPlayerSummary[],
  filter: GtaPlayerFilter,
  query: string,
) {
  if (players.length === 0) return "No GTA players tracked yet.";
  if (!query.trim() && filter === "online") return "No players online.";
  if (!query.trim() && filter === "offline") return "No offline players tracked yet.";
  return "No matching players.";
}

function EmptyBlock({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-8 text-sm text-muted-foreground">{children}</div>;
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function GtaPlayersSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
      <Skeleton className="h-96 w-full rounded-xl" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}

function toastActionResult(
  action: GtaPunishmentType,
  playerName: string,
  result: GtaPlayerActionResult,
) {
  if ((action === "ban" || action === "kick") && result.liveAction?.ok === false) {
    toast.error(
      action === "ban"
        ? "Ban recorded, live disconnect failed"
        : "Kick recorded, live disconnect failed",
      { description: result.liveAction.error },
    );
    return;
  }

  const labels: Record<GtaPunishmentType, string> = {
    kick: "Kicked",
    warn: "Warned",
    ban: "Banned",
  };
  toast.success(`${labels[action]} ${playerName}`);
}

function avatarInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "GT";
}
