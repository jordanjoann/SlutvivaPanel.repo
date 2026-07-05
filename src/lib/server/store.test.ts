import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let root = "";

async function loadStore() {
  vi.resetModules();
  vi.stubEnv("SLUTVIVAL_ROOT", root);
  return import("./store");
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "slutvival-store-"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(root, { recursive: true, force: true });
});

describe("game-aware instance store", () => {
  it("ensures the singleton GTA 5 instance under the GTA root with FXServer defaults", async () => {
    const { ensureGtaInstance, listInstances, getInstance } = await loadStore();

    const created = await ensureGtaInstance();

    expect(created).toMatchObject({
      id: "los-santos",
      name: "Los Santos",
      game: "gta",
      version: "recommended",
      port: 30120,
      runtime: "docker",
      serverEngine: "fxserver",
      maxPlayers: 48,
      docker: {
        containerName: "gta-los-santos",
        image: "slutvival/fxserver-base:bookworm",
        network: "slutvival-net",
      },
      resources: { memoryLimitMB: 4096, cpuLimit: 2 },
    });
    expect(created.dataPath).toBe(path.join(root, "games", "gta", "los-santos", "server-data"));

    await expect(fs.stat(path.join(root, "games", "gta", "los-santos", "server.yml"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(root, "games", "gta", "los-santos", "server-data"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(root, "games", "gta", "los-santos", "server-data", "server.cfg"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(root, "games", "gta", "los-santos", "server-data", "server.secret.cfg"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(root, "games", "gta", "los-santos", ".env"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(root, "games", "gta", "los-santos", "docker-compose.yml"))).resolves.toBeTruthy();

    expect(await listInstances("gta")).toHaveLength(1);
    expect(await listInstances("vintage-story")).toHaveLength(0);
    expect((await getInstance("los-santos"))?.game).toBe("gta");

    const again = await ensureGtaInstance();
    expect(again.id).toBe("los-santos");
    expect(await listInstances("gta")).toHaveLength(1);
  });

  it("does not create arbitrary additional GTA 5 instances", async () => {
    const { createInstance } = await loadStore();

    await expect(createInstance({ name: "Second City", game: "gta" })).rejects.toThrow(
      "GTA 5 is managed as a single Los Santos server",
    );
  });

  it("repairs legacy GTA descriptors with the FXServer Docker image", async () => {
    const { getInstance } = await loadStore();
    const dir = path.join(root, "games", "gta", "los-santos");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "server.yml"),
      [
        "id: los-santos",
        "name: Los Santos",
        "game: gta",
        "docker:",
        "  containerName: gta-los-santos",
        "  network: slutvival-net",
        "",
      ].join("\n"),
      "utf8",
    );

    const instance = await getInstance("los-santos");

    expect(instance?.docker.image).toBe("slutvival/fxserver-base:bookworm");
    await expect(fs.readFile(path.join(dir, ".env"), "utf8")).resolves.toContain(
      "FXSERVER_IMAGE=slutvival/fxserver-base:bookworm",
    );
  });

  it("rejects unsupported game creation", async () => {
    const { createInstance } = await loadStore();

    await expect(createInstance({ name: "Blocks", game: "minecraft" })).rejects.toThrow(
      "Game 'minecraft' is not supported for server creation",
    );
  });

  it("reserves the singleton GTA 5 server id before GTA exists", async () => {
    const { createInstance } = await loadStore();

    await expect(createInstance({ id: "los-santos", name: "Los Santos", game: "vintage-story" })).rejects.toThrow(
      "Server id 'los-santos' is reserved for GTA 5",
    );
  });

  it("preserves Vintage Story defaults under the Vintage Story root", async () => {
    const { createInstance } = await loadStore();

    const created = await createInstance({ name: "Hub", game: "vintage-story" });

    expect(created).toMatchObject({
      game: "vintage-story",
      port: 42420,
      serverEngine: "stratum",
      maxPlayers: 16,
      docker: { containerName: `vs-${created.id}` },
    });
    expect(created.dataPath).toBe(path.join(root, "games", "vintage-story", created.id, "vintage"));
  });
});
