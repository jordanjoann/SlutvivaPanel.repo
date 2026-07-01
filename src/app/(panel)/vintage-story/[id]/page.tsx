"use client";

import Link from "next/link";
import useSWR from "swr";
import { useParams } from "next/navigation";
import {
  CpuIcon,
  MemoryStickIcon,
  NetworkIcon,
  HardDriveIcon,
  UsersIcon,
  PackageIcon,
  TerminalIcon,
  FolderIcon,
  GlobeIcon,
  ContainerIcon,
  ClockIcon,
} from "lucide-react";
import { useInstance } from "@/hooks/use-instances";
import { api } from "@/lib/api";
import { StatCard } from "@/components/panel/stat-card";
import { SectionCard } from "@/components/panel/section-card";
import { PowerControls } from "@/components/panel/power-controls";
import { StatusBadge } from "@/components/panel/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMB, formatKBs, formatDuration, formatPercent } from "@/lib/format";

export default function OverviewPage() {
  const { id } = useParams<{ id: string }>();
  const { data: instance } = useInstance(id);
  const { data: modsData } = useSWR(["mods", id], () => api.mods.list(id), {
    refreshInterval: 15000,
  });

  if (!instance) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-xl" />
        ))}
      </div>
    );
  }

  const { state } = instance;
  const s = state.stats;
  const base = `/vintage-story/${id}`;
  const modCount = modsData?.mods.length ?? 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Quick actions */}
      <SectionCard bodyClassName="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <StatusBadge status={state.status} />
          <span className="text-sm text-muted-foreground">
            {state.status === "running"
              ? `Up ${formatDuration(state.uptimeSeconds)}`
              : "Server is offline"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PowerControls id={id} status={state.status} />
          <Button variant="outline" render={<Link href={`${base}/console`} />}>
            <TerminalIcon /> Console
          </Button>
          <Button variant="outline" render={<Link href={`${base}/files`} />}>
            <FolderIcon /> Files
          </Button>
        </div>
      </SectionCard>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <StatCard
          label="Players"
          value={`${state.playersOnline}/${instance.maxPlayers}`}
          icon={UsersIcon}
          accent="info"
        />
        <StatCard
          label="CPU"
          value={formatPercent(s.cpuPercent)}
          icon={CpuIcon}
          accent="primary"
          progress={s.cpuPercent}
        />
        <StatCard
          label="Memory"
          value={formatPercent(s.memoryPercent)}
          icon={MemoryStickIcon}
          accent="info"
          progress={s.memoryPercent}
          sub={`${formatMB(s.memoryUsedMB, 0)} / ${formatMB(s.memoryLimitMB, 0)}`}
        />
        <StatCard
          label="Disk"
          value={formatMB(s.diskUsedMB, 1)}
          icon={HardDriveIcon}
          accent="warning"
          progress={(s.diskUsedMB / s.diskTotalMB) * 100}
        />
        <StatCard
          label="Network ↓"
          value={formatKBs(s.netRxKBs)}
          icon={NetworkIcon}
          accent="success"
          sub={`↑ ${formatKBs(s.netTxKBs)}`}
        />
        <StatCard label="Mods" value={modCount} icon={PackageIcon} accent="primary" sub="installed" />
        <StatCard
          label="Container"
          value={state.runtime}
          icon={ContainerIcon}
          accent={state.status === "running" ? "success" : "muted"}
          sub={state.live ? "live" : "simulated"}
        />
        <StatCard label="World" value={instance.worldName ?? "—"} icon={GlobeIcon} accent="info" />
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Server details" icon={ContainerIcon}>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <Detail label="Game" value="Vintage Story" />
            <Detail label="Version" value={`v${instance.version}`} />
            <Detail label="World" value={instance.worldName ?? "—"} />
            <Detail label="Seed" value={instance.seed || "random"} mono />
            <Detail label="Port" value={String(instance.port)} mono />
            <Detail label="Max players" value={String(instance.maxPlayers)} />
            <Detail label="Container" value={instance.docker.containerName} mono />
            <Detail label="Group" value={instance.group ?? "—"} />
          </dl>
        </SectionCard>

        <SectionCard title="Runtime" icon={ClockIcon}>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <Detail label="Status" value={state.status} />
            <Detail label="Uptime" value={formatDuration(state.uptimeSeconds)} />
            <Detail label="Threads" value={String(s.threads)} />
            <Detail label="Runtime" value={`${state.runtime}${state.live ? "" : " (sim)"}`} />
            <Detail label="Auto-restart" value={instance.autoRestart ? "On" : "Off"} />
            <Detail label="Auto-backup" value={instance.autoBackup ? "On" : "Off"} />
            <Detail
              label="Data path"
              value={instance.dataPath}
              mono
              className="sm:col-span-2"
            />
          </dl>
        </SectionCard>
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 truncate text-sm text-foreground ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
