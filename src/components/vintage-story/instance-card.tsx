"use client";

import Link from "next/link";
import { UsersIcon, TagIcon, PlugIcon, CpuIcon, MemoryStickIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/panel/status-badge";
import { PowerControls } from "@/components/panel/power-controls";
import { cn } from "@/lib/utils";
import { formatMB } from "@/lib/format";
import type { InstanceWithState } from "@/lib/types";

export function InstanceCard({ instance }: { instance: InstanceWithState }) {
  const { state } = instance;
  const running = state.status === "running";
  const memPct = state.stats.memoryPercent;
  const cpu = state.stats.cpuPercent;

  return (
    <Card className="group relative gap-0 overflow-hidden p-0 transition-colors hover:border-primary/40">
      <Link
        href={`/vintage-story/${instance.id}`}
        className="absolute inset-0 z-0"
        aria-label={`Manage ${instance.name}`}
      />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-heading text-base font-semibold text-foreground">
              {instance.name}
            </h3>
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
              {instance.description || "No description"}
            </p>
          </div>
          <StatusBadge status={state.status} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <TagIcon className="size-3.5" /> {instance.group}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <UsersIcon className="size-3.5" /> {state.playersOnline}/{instance.maxPlayers}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <PlugIcon className="size-3.5" /> :{instance.port}
          </span>
          <span className="inline-flex items-center gap-1.5 font-mono">v{instance.version}</span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <MiniMeter
            icon={CpuIcon}
            label="CPU"
            value={running ? `${Math.round(cpu)}%` : "—"}
            percent={running ? cpu : 0}
          />
          <MiniMeter
            icon={MemoryStickIcon}
            label="RAM"
            value={running ? formatMB(state.stats.memoryUsedMB, 0) : "—"}
            percent={running ? memPct : 0}
          />
        </div>
      </div>

      <div className="relative z-10 flex items-center justify-between border-t border-border bg-card/50 px-4 py-3">
        <PowerControls id={instance.id} status={state.status} size="sm" showRestart={false} />
        <span className="text-xs font-medium text-muted-foreground transition-colors group-hover:text-primary">
          Manage →
        </span>
      </div>
    </Card>
  );
}

function MiniMeter({
  icon: Icon,
  label,
  value,
  percent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  percent: number;
}) {
  return (
    <div className="rounded-lg bg-muted/40 p-2.5">
      <div className="flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Icon className="size-3.5" /> {label}
        </span>
        <span className="font-medium tabular-nums">{value}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            percent >= 90 ? "bg-destructive" : percent >= 75 ? "bg-warning" : "bg-primary",
          )}
          style={{ width: `${Math.max(2, Math.min(100, percent))}%` }}
        />
      </div>
    </div>
  );
}
