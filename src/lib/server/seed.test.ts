import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Instance } from "@/lib/types";

describe("Vintage Story server config seeding", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("keeps the canonical role file and removes legacy role data", async () => {
    const { data, ensureRunnableServerConfig } = await setup();
    const canonicalRoles = {
      FileEditWarning: "keep me",
      ConfigVersion: "1.0",
      DefaultRoleCode: "admin",
      Roles: [{ Code: "admin", Privileges: ["root"] }],
    };
    await fs.writeFile(
      path.join(data, "serverconfig.json"),
      JSON.stringify({
        ServerName: "Hub",
        DefaultRoleCode: "suplayer",
        Roles: [{ Code: "suplayer" }],
        WorldConfig: { WorldName: "Hub", SaveFileLocation: "/data/Saves/Hub.vcdbs" },
      }),
      "utf8",
    );
    await fs.writeFile(
      path.join(data, "serverroles.json"),
      JSON.stringify(canonicalRoles),
      "utf8",
    );

    await ensureRunnableServerConfig(instance());

    const serverConfig = JSON.parse(await fs.readFile(path.join(data, "serverconfig.json"), "utf8"));
    const serverRoles = JSON.parse(await fs.readFile(path.join(data, "serverroles.json"), "utf8"));
    expect(serverConfig).not.toHaveProperty("DefaultRoleCode");
    expect(serverConfig).not.toHaveProperty("Roles");
    expect(serverRoles).toEqual(canonicalRoles);
  });

  it("migrates legacy role data when serverroles.json is missing", async () => {
    const { data, ensureRunnableServerConfig } = await setup();
    await fs.writeFile(
      path.join(data, "serverconfig.json"),
      JSON.stringify({
        DefaultRoleCode: "builder",
        Roles: [{ Code: "builder", Privileges: ["build"] }],
        WorldConfig: { WorldName: "Hub", SaveFileLocation: "/data/Saves/Hub.vcdbs" },
      }),
      "utf8",
    );

    await ensureRunnableServerConfig(instance());

    const serverConfig = JSON.parse(await fs.readFile(path.join(data, "serverconfig.json"), "utf8"));
    const serverRoles = JSON.parse(await fs.readFile(path.join(data, "serverroles.json"), "utf8"));
    expect(serverConfig).not.toHaveProperty("DefaultRoleCode");
    expect(serverConfig).not.toHaveProperty("Roles");
    expect(serverRoles).toMatchObject({
      ConfigVersion: "1.0",
      DefaultRoleCode: "builder",
      Roles: [{ Code: "builder", Privileges: ["build"] }],
    });
  });
});

async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "slutvival-seed-"));
  vi.resetModules();
  vi.stubEnv("SLUTVIVAL_ROOT", root);
  const data = path.join(root, "games", "vintage-story", "hub", "vintage");
  await fs.mkdir(data, { recursive: true });
  const { ensureRunnableServerConfig } = await import("./seed");
  return { data, ensureRunnableServerConfig };
}

function instance(): Instance {
  return {
    id: "hub",
    name: "Hub",
    game: "vintage-story",
    development: false,
    version: "1.22.3",
    port: 42420,
    dataPath: "/tmp/hub/vintage",
    runtime: "docker",
    serverEngine: "stratum",
    docker: {
      containerName: "vs-hub",
      image: "mcr.microsoft.com/dotnet/runtime:10.0",
      network: "slutvival-net",
    },
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
