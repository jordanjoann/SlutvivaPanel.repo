"use client";

import * as React from "react";
import useSWR from "swr";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import {
  SearchIcon,
  UserXIcon,
  BanIcon,
  ShieldCheckIcon,
  UsersIcon,
  UserPlusIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/panel/page-header";
import { SectionCard } from "@/components/panel/section-card";
import { useConfirm } from "@/components/panel/confirm-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatDuration, formatRelative } from "@/lib/format";
import type { Player } from "@/lib/types";

export default function PlayersPage() {
  const { id } = useParams<{ id: string }>();
  const [search, setSearch] = React.useState("");
  const [whitelistInput, setWhitelistInput] = React.useState("");
  const [roleInput, setRoleInput] = React.useState("");
  const [selectedRole, setSelectedRole] = React.useState("");
  const { confirm, node } = useConfirm();
  const { data, isLoading, mutate } = useSWR(
    ["players", id],
    () => api.players.list(id),
    { refreshInterval: 4000 },
  );

  async function act(
    action: string,
    name: string,
    label: string,
    extra?: Record<string, unknown>,
  ): Promise<boolean> {
    try {
      await api.players.action(id, action, name, extra);
      toast.success(`${label} ${name}`);
      mutate();
      return true;
    } catch (e) {
      toast.error(`Failed to ${action}`, {
        description: e instanceof Error ? e.message : undefined,
      });
      return false;
    }
  }

  const players = data?.players ?? [];
  const offlinePlayers = data?.offline ?? [];
  const whitelist = data?.whitelist ?? [];
  const assignedRoles = data?.assignedRoles ?? [];
  const roles = data?.roles ?? [];
  const defaultRole = data?.defaultRole ?? roles[0] ?? "member";
  const roleOptions = roles;
  const roleTarget = selectedRole && roleOptions.includes(selectedRole) ? selectedRole : roleOptions[0] || "";
  const query = search.trim().toLowerCase();
  const filteredOnline = players.filter((p) => matchesPlayer(p, query));
  const filteredOffline = offlinePlayers.filter((p) => matchesPlayer(p, query));

  async function addWhitelist() {
    const target = whitelistInput.trim();
    if (!target) {
      toast.error("Enter a username or UUID");
      return;
    }
    if (await act("whitelist", target, "Whitelisted", { whitelisted: true })) {
      setWhitelistInput("");
    }
  }

  async function assignRole() {
    const target = roleInput.trim();
    if (!target) {
      toast.error("Enter a username");
      return;
    }
    if (!roleTarget) {
      toast.error("Choose a role");
      return;
    }
    if (await act("role", target, "Updated role for", { role: roleTarget })) {
      setRoleInput("");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {node}
      <PageHeader
        title="Players"
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
      ) : (
        <Tabs defaultValue="players" className="gap-4">
          <TabsList className="w-fit">
            <TabsTrigger value="players">Players</TabsTrigger>
            <TabsTrigger value="whitelist">Whitelist</TabsTrigger>
            <TabsTrigger value="roles">Roles</TabsTrigger>
          </TabsList>

          <TabsContent value="players" className="flex flex-col gap-4">
            <SectionCard
              title={`${players.length} online`}
              icon={UsersIcon}
              bodyClassName="p-0"
            >
              {filteredOnline.length === 0 ? (
                <ListEmpty>
                  {players.length === 0 ? "No players online." : "No matching online players."}
                </ListEmpty>
              ) : (
                <div className="divide-y divide-border">
                  {filteredOnline.map((p) => (
                    <PlayerRow
                      key={p.uid}
                      player={p}
                      online
                      onKick={() => act("kick", p.name, "Kicked")}
                      onBan={() =>
                        confirm({
                          title: `Ban ${p.name}?`,
                          description:
                            "The player will be disconnected and blocked from rejoining.",
                          confirmLabel: "Ban player",
                          destructive: true,
                          onConfirm: async () => {
                            await act("ban", p.name, "Banned");
                          },
                        })
                      }
                    />
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title={`${offlinePlayers.length} offline`}
              icon={UsersIcon}
              bodyClassName="p-0"
            >
              {filteredOffline.length === 0 ? (
                <ListEmpty>
                  {offlinePlayers.length === 0
                    ? "No offline players tracked yet."
                    : "No matching offline players."}
                </ListEmpty>
              ) : (
                <div className="divide-y divide-border">
                  {filteredOffline.map((p) => (
                    <PlayerRow
                      key={p.uid}
                      player={p}
                      onBan={() =>
                        confirm({
                          title: `Ban ${p.name}?`,
                          description: "The player will be blocked from joining this server.",
                          confirmLabel: "Ban player",
                          destructive: true,
                          onConfirm: async () => {
                            await act("ban", p.name, "Banned");
                          },
                        })
                      }
                    />
                  ))}
                </div>
              )}
            </SectionCard>
          </TabsContent>

          <TabsContent value="whitelist">
            <SectionCard
              title={`${whitelist.length} whitelisted`}
              icon={ShieldCheckIcon}
              bodyClassName="p-0"
            >
              <ManagementForm
                label="Username or UUID"
                value={whitelistInput}
                placeholder="Player name or UUID"
                buttonLabel="Add"
                icon={<UserPlusIcon />}
                onChange={setWhitelistInput}
                onSubmit={addWhitelist}
              />
              <ManagedPlayerList
                empty="No manually whitelisted players yet."
                players={whitelist}
                action={(player) => (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      act("whitelist", player.name, "Removed whitelist for", {
                        whitelisted: false,
                      })
                    }
                  >
                    Remove
                  </Button>
                )}
              />
            </SectionCard>
          </TabsContent>

          <TabsContent value="roles">
            <SectionCard
              title={`${assignedRoles.length} role assignments`}
              icon={ShieldCheckIcon}
              bodyClassName="p-0"
            >
              <RoleAssignmentForm
                name={roleInput}
                role={roleTarget}
                roles={roleOptions}
                onNameChange={setRoleInput}
                onRoleChange={setSelectedRole}
                onSubmit={assignRole}
              />
              <ManagedPlayerList
                empty="No non-default role assignments yet."
                players={assignedRoles}
                roleOptions={roleOptions}
                action={(player) => (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <RoleSelect
                      value={player.role ?? defaultRole}
                      roles={roleOptions}
                      playerName={player.name}
                      onChange={(nextRole) =>
                        act("role", player.name, "Updated role for", { role: nextRole })
                      }
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        act("role", player.name, "Reset role for", { role: defaultRole })
                      }
                    >
                      Default
                    </Button>
                  </div>
                )}
              />
            </SectionCard>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function ListEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-8 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function PlayerRow({
  player,
  online = false,
  onKick,
  onBan,
}: {
  player: Player;
  online?: boolean;
  onKick?: () => void;
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
      <div className="grid min-w-0 flex-1 gap-1 md:grid-cols-[minmax(9rem,14rem)_minmax(12rem,1fr)] md:items-center md:gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium" title={player.name}>
            {player.name}
          </span>
          {player.isOp && (
            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              OP
            </span>
          )}
        </div>
        <div className="min-w-0">
          <span className="block truncate font-mono text-xs text-muted-foreground" title={player.uid}>
            {player.uid}
          </span>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {online ? (
              <span className={cn("tabular-nums", pingColor)}>{Math.round(player.pingMs)} ms</span>
            ) : (
              <span>Last seen {formatRelative(player.lastSeen)}</span>
            )}
            <span>·</span>
            <span>{formatDuration(player.playtimeSeconds)} played</span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {online && onKick && (
          <Button variant="outline" size="sm" onClick={onKick}>
            <UserXIcon /> Kick
          </Button>
        )}
        <Button variant="destructive" size="sm" onClick={onBan}>
          <BanIcon /> Ban
        </Button>
      </div>
    </div>
  );
}

function RoleSelect({
  value,
  roles,
  playerName,
  onChange,
}: {
  value: string;
  roles: string[];
  playerName: string;
  onChange: (role: string) => void;
}) {
  const options = roles.includes(value) ? roles : [value, ...roles];

  return (
    <Select value={value} onValueChange={(next) => onChange(next as string)}>
      <SelectTrigger size="sm" className="w-32" aria-label={`Role for ${playerName}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {options.map((role) => (
          <SelectItem key={role} value={role}>
            {role}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ManagementForm({
  label,
  value,
  placeholder,
  buttonLabel,
  icon,
  onChange,
  onSubmit,
}: {
  label: string;
  value: string;
  placeholder: string;
  buttonLabel: string;
  icon: React.ReactNode;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="border-b border-border p-4">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="grid gap-2">
          <Label htmlFor="whitelist-target">{label}</Label>
          <Input
            id="whitelist-target"
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit();
            }}
          />
        </div>
        <Button onClick={onSubmit}>
          {icon}
          {buttonLabel}
        </Button>
      </div>
    </div>
  );
}

function RoleAssignmentForm({
  name,
  role,
  roles,
  onNameChange,
  onRoleChange,
  onSubmit,
}: {
  name: string;
  role: string;
  roles: string[];
  onNameChange: (value: string) => void;
  onRoleChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="border-b border-border p-4">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
        <div className="grid gap-2">
          <Label htmlFor="role-target">Username</Label>
          <Input
            id="role-target"
            value={name}
            placeholder="Player name"
            onChange={(e) => onNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit();
            }}
          />
        </div>
        <div className="grid gap-2">
          <Label>Role</Label>
          <Select value={role} onValueChange={(next) => onRoleChange(next as string)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={onSubmit} disabled={roles.length === 0}>
          <ShieldCheckIcon />
          Assign
        </Button>
      </div>
    </div>
  );
}

function ManagedPlayerList({
  empty,
  players,
  action,
}: {
  empty: string;
  players: Player[];
  roleOptions?: string[];
  action: (player: Player) => React.ReactNode;
}) {
  if (players.length === 0) return <ListEmpty>{empty}</ListEmpty>;

  return (
    <div className="divide-y divide-border">
      {players.map((player) => (
        <div key={player.uid} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <PlayerIdentity player={player} />
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {player.role && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {player.role}
              </span>
            )}
            {action(player)}
          </div>
        </div>
      ))}
    </div>
  );
}

function PlayerIdentity({ player }: { player: Player }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="grid gap-1 md:grid-cols-[minmax(9rem,14rem)_minmax(12rem,1fr)] md:items-center md:gap-4">
        <span className="truncate text-sm font-medium" title={player.name}>
          {player.name}
        </span>
        <span className="truncate font-mono text-xs text-muted-foreground" title={player.uid}>
          {player.uid}
        </span>
      </div>
    </div>
  );
}

function matchesPlayer(player: Player, query: string): boolean {
  if (!query) return true;
  return (
    player.name.toLowerCase().includes(query) ||
    player.uid.toLowerCase().includes(query)
  );
}
