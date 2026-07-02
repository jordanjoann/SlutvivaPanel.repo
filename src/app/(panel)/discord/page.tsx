"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  ActivityIcon,
  BellIcon,
  BotIcon,
  ClipboardIcon,
  MessageCircleIcon,
  MessagesSquareIcon,
  RouteIcon,
  ShieldAlertIcon,
  SlashSquareIcon,
} from "lucide-react";
import { fetcher } from "@/lib/api";
import { PageHeader } from "@/components/panel/page-header";
import { SectionCard } from "@/components/panel/section-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { DiscordRouteKind, DiscordStatus } from "@/lib/types";

const routeSections: Array<{
  kind: DiscordRouteKind;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    kind: "chat",
    title: "Chat",
    description: "Global and server chat",
    icon: MessageCircleIcon,
  },
  {
    kind: "notifications",
    title: "Notifications",
    description: "Players, deaths, storms",
    icon: BellIcon,
  },
  {
    kind: "status",
    title: "Status",
    description: "Lifecycle output",
    icon: ActivityIcon,
  },
  {
    kind: "admin",
    title: "Admin",
    description: "Private admin events",
    icon: ShieldAlertIcon,
  },
];

export default function DiscordPage() {
  const { data } = useSWR<DiscordStatus>("/api/discord", fetcher);

  if (!data) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    );
  }

  const copyRouteCommand = async () => {
    await navigator.clipboard.writeText(data.routeCommand);
    toast.success("Route command copied");
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Discord" icon={MessagesSquareIcon} />

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
              <div className="flex flex-wrap items-center gap-2">
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
              {data.guildName && (
                <p className="text-sm text-muted-foreground">
                  {data.guildName} · {data.latencyMs ?? 0} ms
                </p>
              )}
            </div>
          </div>
          <span
            className={cn(
              "w-fit rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset",
              data.slashCommandsEnabled
                ? "bg-primary/10 text-primary ring-primary/25"
                : "bg-muted text-muted-foreground ring-border",
            )}
          >
            /sv {data.slashCommandsEnabled ? "ready" : "disabled"}
          </span>
        </div>
      </SectionCard>

      <SectionCard
        title="Route Command"
        description="Discord bridge setup"
        icon={SlashSquareIcon}
        action={
          <Button variant="outline" size="sm" onClick={copyRouteCommand}>
            <ClipboardIcon data-icon="inline-start" />
            Copy
          </Button>
        }
      >
        <div className="rounded-md border border-border bg-muted/35 px-3 py-2 font-mono text-sm text-foreground">
          {data.routeCommand}
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {routeSections.map((section) => {
          const Icon = section.icon;
          const routes = data.routes.filter((route) => route.kind === section.kind);

          return (
            <SectionCard
              key={section.kind}
              title={section.title}
              description={section.description}
              icon={Icon}
              bodyClassName="p-0"
            >
              <div className="space-y-2 p-4">
                {routes.length > 0 ? (
                  routes.map((route) => (
                    <div
                      key={route.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-border bg-background px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{route.channelName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {route.game} / {route.server}
                        </p>
                      </div>
                      <RouteIcon className="size-4 text-muted-foreground" />
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No route set.</p>
                )}
              </div>
            </SectionCard>
          );
        })}
      </div>
    </div>
  );
}
