"use client";

import { CpuIcon, HardDriveIcon, MemoryStickIcon, PlugIcon, UsersIcon } from "lucide-react";
import { useParams } from "next/navigation";
import { useInstance } from "@/hooks/use-instances";
import { formatMB, formatPercent } from "@/lib/format";
import { StatCard } from "@/components/panel/stat-card";
import { Skeleton } from "@/components/ui/skeleton";

export default function GtaOverviewPage() {
  const { id } = useParams<{ id: string }>();
  const { data: instance } = useInstance(id);

  if (!instance) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-[104px] rounded-lg" />
        ))}
      </div>
    );
  }

  const stats = instance.state.stats;
  const diskProgress = stats.diskTotalMB > 0 ? (stats.diskUsedMB / stats.diskTotalMB) * 100 : 0;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <StatCard
        label="Players"
        value={`${instance.state.playersOnline}/${instance.maxPlayers}`}
        icon={UsersIcon}
        accent="info"
      />
      <StatCard label="Port" value={String(instance.port)} icon={PlugIcon} accent="primary" />
      <StatCard
        label="CPU"
        value={formatPercent(stats.cpuPercent)}
        icon={CpuIcon}
        accent="primary"
        progress={stats.cpuPercent}
      />
      <StatCard
        label="Memory"
        value={formatPercent(stats.memoryPercent)}
        icon={MemoryStickIcon}
        accent="info"
        progress={stats.memoryPercent}
        sub={`${formatMB(stats.memoryUsedMB, 0)} / ${formatMB(stats.memoryLimitMB, 0)}`}
      />
      <StatCard
        label="Disk"
        value={formatMB(stats.diskUsedMB, 1)}
        icon={HardDriveIcon}
        accent="warning"
        progress={diskProgress}
      />
    </div>
  );
}
