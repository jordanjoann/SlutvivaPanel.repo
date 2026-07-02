"use client";

import useSWR from "swr";
import { useParams } from "next/navigation";
import {
  CpuIcon,
  MemoryStickIcon,
  HardDriveIcon,
  UsersIcon,
  PackageIcon,
} from "lucide-react";
import { useInstance } from "@/hooks/use-instances";
import { api } from "@/lib/api";
import { StatCard } from "@/components/panel/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMB, formatPercent } from "@/lib/format";

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
  const modCount = modsData?.mods.length ?? 0;

  return (
    <div className="flex flex-col gap-5">
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
        <StatCard label="Mods" value={modCount} icon={PackageIcon} accent="primary" sub="installed" />
      </div>
    </div>
  );
}
