"use client";

import useSWR from "swr";
import { useParams } from "next/navigation";
import {
  CpuIcon,
  MemoryStickIcon,
  ActivityIcon,
  NetworkIcon,
  HardDriveIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { fetcher } from "@/lib/api";
import { PageHeader } from "@/components/panel/page-header";
import { StatCard } from "@/components/panel/stat-card";
import { SectionCard } from "@/components/panel/section-card";
import { EmptyState } from "@/components/panel/empty-state";
import { AreaGraph } from "@/components/charts/area-graph";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMB, formatKBs, formatPercent } from "@/lib/format";
import type { InstanceRuntimeState, MetricPoint } from "@/lib/types";

export default function PerformancePage() {
  const { id } = useParams<{ id: string }>();
  const { data } = useSWR<{ state: InstanceRuntimeState; history: MetricPoint[] }>(
    `/api/instances/${id}/performance`,
    fetcher,
    { refreshInterval: 3000, keepPreviousData: true },
  );

  if (!data) {
    return (
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  const { state, history } = data;
  const s = state.stats;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Performance"
        description="Container resource usage and historical metrics."
        icon={ActivityIcon}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="CPU" value={formatPercent(s.cpuPercent)} icon={CpuIcon} accent="primary" progress={s.cpuPercent} />
        <StatCard
          label="Memory"
          value={formatPercent(s.memoryPercent)}
          icon={MemoryStickIcon}
          accent="info"
          progress={s.memoryPercent}
          sub={`${formatMB(s.memoryUsedMB, 0)} / ${formatMB(s.memoryLimitMB, 0)}`}
        />
        <StatCard label="Threads" value={s.threads} icon={ActivityIcon} accent="success" />
        <StatCard label="Network" value={formatKBs(s.netRxKBs)} icon={NetworkIcon} accent="info" sub={`↑ ${formatKBs(s.netTxKBs)}`} />
        <StatCard label="Disk" value={formatMB(s.diskUsedMB, 1)} icon={HardDriveIcon} accent="warning" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard title="CPU usage" icon={CpuIcon}>
          <AreaGraph
            data={history}
            unit="%"
            yDomain={[0, 100]}
            yTicks={[0, 25, 50, 75, 100]}
            series={[{ key: "cpu", label: "CPU", color: "var(--chart-1)" }]}
          />
        </SectionCard>
        <SectionCard title="Memory usage" icon={MemoryStickIcon}>
          <AreaGraph
            data={history}
            unit="%"
            yDomain={[0, 100]}
            yTicks={[0, 25, 50, 75, 100]}
            series={[{ key: "mem", label: "RAM", color: "var(--chart-5)" }]}
          />
        </SectionCard>
        <SectionCard title="Network throughput" icon={NetworkIcon} className="xl:col-span-2">
          <AreaGraph
            data={history}
            series={[
              { key: "netRx", label: "Inbound", color: "var(--chart-3)" },
              { key: "netTx", label: "Outbound", color: "var(--chart-2)" },
            ]}
          />
        </SectionCard>
      </div>

      <SectionCard title="Recent crashes" icon={ShieldCheckIcon}>
        <EmptyState
          icon={ShieldCheckIcon}
          title="No crashes recorded"
          description="Crash reports and exit codes will appear here if the server stops unexpectedly."
          className="border-0 bg-transparent py-8"
        />
      </SectionCard>
    </div>
  );
}
