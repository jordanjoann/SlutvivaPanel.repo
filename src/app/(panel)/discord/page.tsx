"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  MessagesSquareIcon,
  BotIcon,
  HashIcon,
  BellIcon,
  SlashSquareIcon,
  PlugZapIcon,
} from "lucide-react";
import { fetcher } from "@/lib/api";
import { PageHeader } from "@/components/panel/page-header";
import { SectionCard } from "@/components/panel/section-card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { DiscordStatus } from "@/lib/types";

export default function DiscordPage() {
  const { data } = useSWR<DiscordStatus>("/api/discord", fetcher);
  const [notifications, setNotifications] = React.useState<Record<string, boolean>>({});
  const [channels, setChannels] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    if (data) {
      setNotifications(data.notifications);
      setChannels(Object.fromEntries(data.channels.map((c) => [c.id, c.enabled])));
    }
  }, [data]);

  if (!data) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Discord"
        description="Connect a Discord bot to relay status, alerts and console to your server."
        icon={MessagesSquareIcon}
      />

      {/* Connection status */}
      <SectionCard>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div
              className={cn(
                "flex size-12 items-center justify-center rounded-xl ring-1",
                data.connected
                  ? "bg-success/10 text-success ring-success/25"
                  : "bg-muted text-muted-foreground ring-border",
              )}
            >
              <BotIcon className="size-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-heading text-base font-semibold">
                  {data.connected ? data.botTag : "Bot not connected"}
                </p>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                    data.connected
                      ? "bg-success/10 text-success ring-success/25"
                      : "bg-muted text-muted-foreground ring-border",
                  )}
                >
                  {data.connected ? "Online" : "Offline"}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {data.connected
                  ? `Connected to ${data.guildName} · ${data.latencyMs}ms`
                  : "Set DISCORD_TOKEN and DISCORD_GUILD_ID in your .env to connect."}
              </p>
            </div>
          </div>
          {!data.connected && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <PlugZapIcon className="size-4" />
              Configure credentials to enable integration
            </div>
          )}
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Channels */}
        <SectionCard title="Channels" description="Where the bot posts" icon={HashIcon} bodyClassName="p-0">
          <div className="divide-y divide-border">
            {data.channels.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="text-xs capitalize text-muted-foreground">{c.purpose}</p>
                </div>
                <Switch
                  checked={channels[c.id] ?? false}
                  disabled={!data.connected}
                  onCheckedChange={(v) => {
                    setChannels((s) => ({ ...s, [c.id]: v }));
                    toast.success(`${c.name} ${v ? "enabled" : "disabled"}`);
                  }}
                />
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Notifications */}
        <SectionCard title="Notifications" description="Events to broadcast" icon={BellIcon} bodyClassName="p-0">
          <div className="divide-y divide-border">
            {Object.entries(notifications).map(([label, enabled]) => (
              <div key={label} className="flex items-center justify-between gap-3 px-4 py-3">
                <p className="text-sm">{label}</p>
                <Switch
                  checked={enabled}
                  disabled={!data.connected}
                  onCheckedChange={(v) => {
                    setNotifications((s) => ({ ...s, [label]: v }));
                    toast.success(`${label} ${v ? "on" : "off"}`);
                  }}
                />
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* Slash commands */}
      <SectionCard title="Slash commands" description="Control servers from Discord" icon={SlashSquareIcon}>
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Register <span className="font-mono text-foreground">/start</span>,{" "}
            <span className="font-mono text-foreground">/stop</span>,{" "}
            <span className="font-mono text-foreground">/status</span> and{" "}
            <span className="font-mono text-foreground">/players</span> slash commands in your guild.
          </p>
          <Switch
            checked={data.slashCommandsEnabled}
            disabled={!data.connected}
            onCheckedChange={(v) => toast.success(`Slash commands ${v ? "enabled" : "disabled"}`)}
          />
        </div>
      </SectionCard>
    </div>
  );
}
