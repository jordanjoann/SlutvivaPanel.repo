"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { CarIcon, ClockIcon, PlugIcon } from "lucide-react";
import { GTA_INSTANCE_ID } from "@/lib/gta";
import { useInstance } from "@/hooks/use-instances";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format";
import { PowerControls } from "@/components/panel/power-controls";
import { StatusBadge } from "@/components/panel/status-badge";
import { Skeleton } from "@/components/ui/skeleton";

const TABS = [
  { key: "overview", label: "Overview", segment: "" },
  { key: "console", label: "Console", segment: "console" },
  { key: "players", label: "Players", segment: "players" },
  { key: "files", label: "Files", segment: "files" },
  { key: "settings", label: "Settings", segment: "settings" },
] as const;

export default function GtaServerLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const serverId = id || GTA_INSTANCE_ID;
  const { data: instance } = useInstance(serverId);
  const base = `/gta/${serverId}`;
  const status = instance?.state.status ?? "unknown";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
            <CarIcon className="size-5" />
          </div>
          {instance ? (
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-heading text-xl font-semibold tracking-tight">GTA 5</h1>
                <StatusBadge status={status} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>{instance.name}</span>
                <span className="font-mono">FXServer {instance.version}</span>
                <span className="inline-flex items-center gap-1.5">
                  <PlugIcon className="size-3.5" /> Port {instance.port}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ClockIcon className="size-3.5" />
                  {instance.state.status === "running"
                    ? `Up ${formatDuration(instance.state.uptimeSeconds)}`
                    : "Offline"}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
          )}
        </div>
        <PowerControls id={serverId} status={status} />
      </div>

      <div className="no-scrollbar -mx-1 overflow-x-auto border-b border-border">
        <nav className="flex min-w-max items-center gap-1 px-1">
          {TABS.map((tab) => {
            const href = tab.segment ? `${base}/${tab.segment}` : base;
            const active = pathname === href;
            return (
              <Link
                key={tab.key}
                href={href}
                className={cn(
                  "relative whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
                {active && (
                  <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="animate-in-fade">{children}</div>
    </div>
  );
}
