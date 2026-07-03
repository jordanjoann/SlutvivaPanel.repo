import { describe, expect, it } from "vitest";
import type { Instance, ServerStats } from "@/lib/types";
import {
  backendPortBindings,
  normalizeDockerRuntimeStats,
} from "./docker";

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

function dockerInstance(engine: "stratum" | "vanilla"): Instance {
  return {
    id: "hub",
    name: "Hub",
    game: "vintage-story",
    development: false,
    version: "1.22.3",
    port: 42420,
    dataPath: "/tmp/hub/vintage",
    runtime: "docker",
    serverEngine: engine,
    docker: { containerName: "vs-hub", image: "mcr.microsoft.com/dotnet/runtime:10.0", network: "slutvival-net" },
    resources: { memoryLimitMB: 4096, cpuLimit: 2 },
    maxPlayers: 16,
    passwordProtected: false,
    publicAdvertised: false,
    autoRestart: false,
    autoBackup: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("backendPortBindings", () => {
  it("does not publish Stratum backend ports", () => {
    expect(backendPortBindings(dockerInstance("stratum"))).toEqual({});
  });

  it("keeps vanilla fallback ports published", () => {
    expect(backendPortBindings(dockerInstance("vanilla"))).toEqual({
      "42420/tcp": [{ HostPort: "42420" }],
      "42420/udp": [{ HostPort: "42420" }],
    });
  });
});
