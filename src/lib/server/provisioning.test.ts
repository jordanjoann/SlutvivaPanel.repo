import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Instance } from "@/lib/types";
import {
  dockerCommand,
  dockerMounts,
  serverInstallMarkerValue,
} from "./provisioning";

function instance(engine: "stratum" | "vanilla"): Instance {
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

describe("provisioning engine support", () => {
  it("uses the Stratum executable for Stratum instances", () => {
    expect(dockerCommand(instance("stratum"))).toEqual(["./StratumServer", "--dataPath", "/data"]);
  });

  it("keeps the vanilla command for fallback instances", () => {
    expect(dockerCommand(instance("vanilla"))).toEqual(["dotnet", "VintagestoryServer.dll", "--dataPath", "/data"]);
  });

  it("mounts Stratum server directories read-write for first-run bootstrap", () => {
    expect(dockerMounts(instance("stratum"))).toContain(
      `${path.join("/opt/slutvival/games/vintage-story/hub", "server")}:/server:rw`,
    );
  });

  it("includes engine and version in install markers", () => {
    expect(serverInstallMarkerValue(instance("stratum"))).toBe("stratum:1.22.3");
  });
});
