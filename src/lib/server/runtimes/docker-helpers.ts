import type { Instance, ServerStats, ServerStatus } from "@/lib/types";

export function normalizeDockerRuntimeStats(
  status: ServerStatus,
  stats: ServerStats,
): ServerStats {
  const memoryLimitMB = finiteOrZero(stats.memoryLimitMB);
  const diskUsedMB = finiteOrZero(stats.diskUsedMB);
  const diskTotalMB = finiteOrZero(stats.diskTotalMB);

  if (status !== "running") {
    return {
      ...stats,
      cpuPercent: 0,
      memoryUsedMB: 0,
      memoryLimitMB,
      memoryPercent: 0,
      netRxKBs: 0,
      netTxKBs: 0,
      diskUsedMB,
      diskTotalMB,
      threads: 0,
    };
  }

  return {
    cpuPercent: finiteOrZero(stats.cpuPercent),
    memoryUsedMB: finiteOrZero(stats.memoryUsedMB),
    memoryLimitMB,
    memoryPercent: finiteOrZero(stats.memoryPercent),
    netRxKBs: finiteOrZero(stats.netRxKBs),
    netTxKBs: finiteOrZero(stats.netTxKBs),
    diskUsedMB,
    diskTotalMB,
    threads: finiteOrZero(stats.threads),
  };
}

export function backendPortBindings(
  inst: Instance,
): Record<string, Array<{ HostPort?: string }>> {
  const port = String(inst.port);
  if (inst.game === "vintage-story" && inst.serverEngine === "stratum") return {};
  return {
    [`${port}/tcp`]: [{ HostPort: port }],
    [`${port}/udp`]: [{ HostPort: port }],
  };
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
