import { describe, expect, it } from "vitest";
import type { ServerStats } from "@/lib/types";
import { normalizeDockerRuntimeStats } from "./docker";

function stats(overrides: Partial<ServerStats> = {}): ServerStats {
  return {
    cpuPercent: 42,
    memoryUsedMB: Number.NaN,
    memoryLimitMB: 4096,
    memoryPercent: Number.NaN,
    netRxKBs: 100,
    netTxKBs: 200,
    diskUsedMB: 123,
    diskTotalMB: 51200,
    threads: 12,
    ...overrides,
  };
}

describe("normalizeDockerRuntimeStats", () => {
  it("returns finite idle usage counters for stopped containers", () => {
    expect(normalizeDockerRuntimeStats("stopped", stats())).toEqual({
      cpuPercent: 0,
      memoryUsedMB: 0,
      memoryLimitMB: 4096,
      memoryPercent: 0,
      netRxKBs: 0,
      netTxKBs: 0,
      diskUsedMB: 123,
      diskTotalMB: 51200,
      threads: 0,
    });
  });

  it("keeps running container stats finite before they are serialized", () => {
    expect(
      normalizeDockerRuntimeStats(
        "running",
        stats({
          cpuPercent: Number.POSITIVE_INFINITY,
          netRxKBs: Number.NaN,
        }),
      ),
    ).toMatchObject({
      cpuPercent: 0,
      memoryUsedMB: 0,
      memoryPercent: 0,
      netRxKBs: 0,
      netTxKBs: 200,
    });
  });
});
