import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Instance, ServerStatus } from "@/lib/types";

const SQLITE_HEADER = Buffer.from("SQLite format 3\0", "ascii");
let root = "";

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "slutvival-world-deploy-"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(root, { recursive: true, force: true });
});

describe("Vintage Story world deployment", () => {
  it("keeps the previous save, switches config, and restarts a running server", async () => {
    const { deployWorld, paths, instance } = await setup();
    const events: string[] = [];
    const uploaded = Buffer.concat([SQLITE_HEADER, Buffer.from("uploaded-world")]);

    const result = await deployWorld(
      instance,
      {
        fileName: "Hub.vcdbs",
        body: byteStream(uploaded),
        contentLength: uploaded.byteLength,
      },
      dependencies("running", events, instance),
    );

    expect(events).toEqual(["stop", "update:Hub", "start:Hub"]);
    expect(result.previousSaveFileName).toBe("Hub.vcdbs");
    expect(result.liveSaveFileName).toMatch(/^Hub-import-.*\.vcdbs$/);
    expect(result.serverStarted).toBe(true);
    await expect(fs.readFile(path.join(paths.saves, "Hub.vcdbs"), "utf8")).resolves.toBe(
      "previous-world",
    );
    await expect(fs.readFile(path.join(paths.saves, result.liveSaveFileName))).resolves.toEqual(
      uploaded,
    );

    const config = JSON.parse(await fs.readFile(paths.serverConfig, "utf8"));
    expect(config.WorldConfig.SaveFileLocation).toBe(
      `/data/Saves/${result.liveSaveFileName}`,
    );
    expect(config.WorldConfig.WorldName).toBe("Hub");
    await expect(
      fs.access(path.join(paths.backupSaves, result.configBackupFileName)),
    ).resolves.toBeUndefined();
  });

  it("rejects a renamed non-save before stopping the server", async () => {
    const { deployWorld, instance } = await setup();
    const events: string[] = [];

    await expect(
      deployWorld(
        instance,
        {
          fileName: "Hub.vcdbs",
          body: byteStream(Buffer.from("this is not sqlite")),
        },
        dependencies("running", events, instance),
      ),
    ).rejects.toThrow("not a valid Vintage Story .vcdbs save");
    expect(events).toEqual([]);
  });

  it("leaves a stopped server stopped after making the upload live", async () => {
    const { deployWorld, instance } = await setup();
    const events: string[] = [];
    const uploaded = Buffer.concat([SQLITE_HEADER, Buffer.from("offline-world")]);

    const result = await deployWorld(
      instance,
      { fileName: "Solo build.vcdbs", body: byteStream(uploaded) },
      dependencies("stopped", events, instance),
    );

    expect(events).toEqual(["update:Solo build"]);
    expect(result.world.name).toBe("Solo build");
    expect(result.serverWasRunning).toBe(false);
    expect(result.serverStarted).toBe(false);
  });

  it("restores the original config and running state when activation fails", async () => {
    const { deployWorld, paths, instance } = await setup();
    const events: string[] = [];
    const uploaded = Buffer.concat([SQLITE_HEADER, Buffer.from("failed-world")]);
    let updateCalls = 0;

    await expect(
      deployWorld(
        instance,
        { fileName: "Replacement.vcdbs", body: byteStream(uploaded) },
        {
          getStatus: async () => "running",
          stop: async () => {
            events.push("stop");
          },
          start: async () => {
            events.push("start");
          },
          updateInstance: async () => {
            updateCalls += 1;
            if (updateCalls === 1) throw new Error("metadata write failed");
            return instance;
          },
        },
      ),
    ).rejects.toThrow("metadata write failed");

    expect(events).toEqual(["stop", "start"]);
    const config = JSON.parse(await fs.readFile(paths.serverConfig, "utf8"));
    expect(config.WorldConfig.SaveFileLocation).toBe("/data/Saves/Hub.vcdbs");
    expect(await fs.readdir(paths.saves)).toEqual(["Hub.vcdbs"]);
  });
});

async function setup() {
  vi.resetModules();
  vi.stubEnv("SLUTVIVAL_ROOT", root);
  const { deployWorld } = await import("./world-deployment");
  const { vsPaths } = await import("./config");
  const instance = testInstance();
  const paths = vsPaths(instance.id);
  await fs.mkdir(paths.saves, { recursive: true });
  await fs.mkdir(paths.backupSaves, { recursive: true });
  await fs.writeFile(path.join(paths.saves, "Hub.vcdbs"), "previous-world", "utf8");
  await fs.writeFile(
    paths.serverConfig,
    JSON.stringify({
      ServerName: "Hub",
      WorldConfig: {
        SaveFileLocation: "/data/Saves/Hub.vcdbs",
        WorldName: "Hub",
        PlayStyle: "creativebuilding",
        WorldType: "standard",
      },
    }),
    "utf8",
  );
  return { deployWorld, paths, instance };
}

function dependencies(status: ServerStatus, events: string[], instance: Instance) {
  return {
    getStatus: async () => status,
    stop: async () => {
      events.push("stop");
    },
    start: async (next: Instance) => {
      events.push(`start:${next.worldName}`);
    },
    updateInstance: async (_id: string, patch: Partial<Instance>) => {
      events.push(`update:${patch.worldName}`);
      return { ...instance, ...patch };
    },
  };
}

function byteStream(buffer: Buffer): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(buffer);
      controller.close();
    },
  });
}

function testInstance(): Instance {
  return {
    id: "hub-test",
    name: "Hub",
    game: "vintage-story",
    development: false,
    version: "1.22.3",
    port: 42420,
    dataPath: path.join(root, "games", "vintage-story", "hub-test", "vintage"),
    runtime: "docker",
    serverEngine: "stratum",
    docker: {
      containerName: "vs-hub-test",
      image: "vintage-story:test",
      network: "slutvival-net",
    },
    resources: { memoryLimitMB: 4096, cpuLimit: 2 },
    worldName: "Hub",
    maxPlayers: 24,
    passwordProtected: false,
    publicAdvertised: false,
    autoRestart: false,
    autoBackup: true,
    createdAt: 1,
    updatedAt: 1,
  };
}
