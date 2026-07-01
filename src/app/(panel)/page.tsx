"use client";

import {
  CpuIcon,
  MemoryStickIcon,
  HardDriveIcon,
  ContainerIcon,
  ServerIcon,
  UsersIcon,
  ActivityIcon,
  NetworkIcon,
  GaugeIcon,
} from "lucide-react";
import { useHostMetrics } from "@/hooks/use-metrics";
import { PageHeader } from "@/components/panel/page-header";
import { StatCard } from "@/components/panel/stat-card";
import { SectionCard } from "@/components/panel/section-card";
import { AreaGraph } from "@/components/charts/area-graph";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatMB, formatNumber, formatPercent } from "@/lib/format";
import type { HostMetrics } from "@/lib/types";

export default function DashboardPage() {
  const { host, history, connected } = useHostMetrics();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description="Real-time overview of your Slutvival infrastructure."
        icon={GaugeIcon}
        actions={
          <div
            className={cn(
              "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset",
              connected
                ? "bg-success/10 text-success ring-success/25"
                : "bg-muted text-muted-foreground ring-border",
            )}
          >
            <span className={cn("size-1.5 rounded-full", connected ? "bg-success pulse-dot" : "bg-muted-foreground")} />
            {connected ? "Live" : "Connecting…"}
          </div>
        }
      />

      {host ? <MetricCards host={host} /> : <MetricCardsSkeleton />}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard title="CPU usage" description="Host processor utilization" icon={CpuIcon}>
          <AreaGraph
            data={history}
            unit="%"
            yDomain={[0, 100]}
            yTicks={[0, 25, 50, 75, 100]}
            series={[{ key: "cpu", label: "CPU", color: "var(--chart-1)" }]}
          />
        </SectionCard>
        <SectionCard title="Memory usage" description="Host RAM utilization" icon={MemoryStickIcon}>
          <AreaGraph
            data={history}
            unit="%"
            yDomain={[0, 100]}
            yTicks={[0, 25, 50, 75, 100]}
            series={[{ key: "mem", label: "RAM", color: "var(--chart-5)" }]}
          />
        </SectionCard>
        <SectionCard title="Network" description="Throughput in KB/s" icon={NetworkIcon}>
          <AreaGraph
            data={history}
            series={[
              { key: "netRx", label: "Inbound", color: "var(--chart-3)" },
              { key: "netTx", label: "Outbound", color: "var(--chart-2)" },
            ]}
          />
        </SectionCard>
        <SectionCard title="Disk I/O" description="Read / write in KB/s" icon={HardDriveIcon}>
          <AreaGraph
            data={history}
            series={[
              { key: "diskRead", label: "Read", color: "var(--chart-4)" },
              { key: "diskWrite", label: "Write", color: "var(--chart-1)" },
            ]}
          />
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title="Per-core CPU" description="Load across logical cores" icon={ActivityIcon} className="lg:col-span-1">
          {host ? <PerCore cores={host.perCore} /> : <Skeleton className="h-40 w-full" />}
        </SectionCard>
        <SectionCard title="Top processes" description="Highest CPU consumers" icon={CpuIcon} className="lg:col-span-1">
          {host ? <TopProcesses host={host} /> : <Skeleton className="h-40 w-full" />}
        </SectionCard>
        <SectionCard title="Docker containers" description="Per-server resource usage" icon={ContainerIcon} className="lg:col-span-1">
          {host ? <ContainerUsage host={host} /> : <Skeleton className="h-40 w-full" />}
        </SectionCard>
      </div>
    </div>
  );
}

function MetricCards({ host }: { host: HostMetrics }) {
  const memPct = (host.memUsedMB / host.memTotalMB) * 100;
  const diskPct = (host.diskUsedMB / host.diskTotalMB) * 100;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <StatCard
        label="CPU"
        value={formatPercent(host.cpuPercent)}
        icon={CpuIcon}
        accent="primary"
        progress={host.cpuPercent}
        sub={`${host.perCore.length} cores`}
      />
      <StatCard
        label="Memory"
        value={formatPercent(memPct)}
        icon={MemoryStickIcon}
        accent="info"
        progress={memPct}
        sub={`${formatMB(host.memUsedMB, 0)} / ${formatMB(host.memTotalMB, 0)}`}
      />
      <StatCard
        label="Disk"
        value={formatPercent(diskPct)}
        icon={HardDriveIcon}
        accent="warning"
        progress={diskPct}
        sub={`${formatMB(host.diskUsedMB, 0)} / ${formatMB(host.diskTotalMB, 0)}`}
      />
      <StatCard
        label="Containers"
        value={`${host.containersRunning}/${host.containersTotal}`}
        icon={ContainerIcon}
        accent="success"
        sub="running"
      />
      <StatCard
        label="Servers online"
        value={`${host.serversOnline}/${host.serversTotal}`}
        icon={ServerIcon}
        accent="primary"
        sub="Vintage Story"
      />
      <StatCard
        label="Players"
        value={formatNumber(host.playersOnline)}
        icon={UsersIcon}
        accent="info"
        sub="online now"
      />
    </div>
  );
}

function MetricCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-[104px] w-full rounded-xl" />
      ))}
    </div>
  );
}

function PerCore({ cores }: { cores: number[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
      {cores.map((load, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-12 shrink-0 text-xs text-muted-foreground tabular-nums">
            Core {i}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                load >= 90 ? "bg-destructive" : load >= 70 ? "bg-warning" : "bg-primary",
              )}
              style={{ width: `${Math.max(2, load)}%` }}
            />
          </div>
          <span className="w-9 shrink-0 text-right text-xs font-medium tabular-nums">
            {Math.round(load)}%
          </span>
        </div>
      ))}
    </div>
  );
}

function TopProcesses({ host }: { host: HostMetrics }) {
  return (
    <div className="flex flex-col gap-1">
      {host.topProcesses.map((p) => (
        <div key={p.pid} className="flex items-center gap-3 rounded-md px-1 py-1.5 text-sm">
          <span className="w-10 shrink-0 font-mono text-xs text-muted-foreground">{p.pid}</span>
          <span className="flex-1 truncate">{p.name}</span>
          <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">
            {formatMB(p.memoryMB, 0)}
          </span>
          <span className="w-12 text-right text-xs font-medium tabular-nums">{p.cpuPercent}%</span>
        </div>
      ))}
    </div>
  );
}

function ContainerUsage({ host }: { host: HostMetrics }) {
  if (host.containers.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No containers.</p>;
  }
  return (
    <div className="flex flex-col gap-2.5">
      {host.containers.map((c) => (
        <div key={c.id} className="flex items-center gap-3">
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              c.status === "running" ? "bg-success" : "bg-muted-foreground",
            )}
          />
          <span className="flex-1 truncate text-sm">{c.name}</span>
          <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">
            {formatMB(c.memoryMB, 0)}
          </span>
          <span className="w-10 text-right text-xs font-medium tabular-nums">
            {Math.round(c.cpuPercent)}%
          </span>
        </div>
      ))}
    </div>
  );
}
