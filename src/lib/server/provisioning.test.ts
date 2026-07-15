import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Instance } from "@/lib/types";
import {
  dockerCompose,
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

function gtaInstance(): Instance {
  return {
    id: "los-santos",
    name: "Los Santos",
    game: "gta",
    development: false,
    version: "recommended",
    port: 30120,
    dataPath: "/opt/slutvival/games/gta/los-santos/server-data",
    runtime: "docker",
    serverEngine: "fxserver",
    docker: {
      containerName: "gta-los-santos",
      image: "slutvival/fxserver-base:bookworm",
      network: "slutvival-net",
    },
    resources: { memoryLimitMB: 4096, cpuLimit: 2 },
    maxPlayers: 48,
    passwordProtected: false,
    publicAdvertised: false,
    autoRestart: false,
    autoBackup: false,
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
    expect(serverInstallMarkerValue(instance("stratum"))).toBe(
      "stratum:1.22.3:v1.22.3-stratum.15",
    );
  });

  it("does not publish Stratum backend ports in generated compose files", () => {
    expect(dockerCompose(instance("stratum"))).not.toContain("    ports:");
    expect(dockerCompose(instance("stratum"))).not.toContain("42420:42420");
  });

  it("keeps vanilla backend ports in generated compose files", () => {
    expect(dockerCompose(instance("vanilla"))).toContain("    ports:");
    expect(dockerCompose(instance("vanilla"))).toContain('"42420:42420/tcp"');
    expect(dockerCompose(instance("vanilla"))).toContain('"42420:42420/udp"');
  });

  it("uses a read-write server volume for Stratum compose files", () => {
    expect(dockerCompose(instance("stratum"))).toContain("      - ./server:/server:rw");
  });

  it("uses the FXServer command for the GTA 5 singleton", () => {
    expect(dockerCommand(gtaInstance())).toEqual(["bash", "/server/run.sh", "+exec", "server.cfg"]);
  });

  it("mounts GTA server artifacts read-only and server-data read-write", () => {
    expect(dockerMounts(gtaInstance())).toEqual([
      "/opt/slutvival/games/gta/los-santos/server:/server:ro",
      "/opt/slutvival/games/gta/los-santos/server-data:/server-data:rw",
    ]);
  });

  it("generates GTA compose without txAdmin exposure by default", () => {
    const compose = dockerCompose(gtaInstance());
    expect(compose).toContain("image: slutvival/fxserver-base:bookworm");
    expect(compose).toContain("container_name: gta-los-santos");
    expect(compose).toContain('command: ["bash","/server/run.sh","+exec","server.cfg"]');
    expect(compose).toContain('"30120:30120/tcp"');
    expect(compose).toContain('"30120:30120/udp"');
    expect(compose).not.toContain("40120");
    expect(compose).toContain("      - ./server:/server:ro");
    expect(compose).toContain("      - ./server-data:/server-data:rw");
    expect(compose).toContain('      slutvival.panel.game: "gta"');
  });

  it("uses FXServer install markers for GTA", () => {
    expect(serverInstallMarkerValue(gtaInstance())).toBe("fxserver:recommended");
  });
});
