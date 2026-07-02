import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BackupObjectStorage } from "./storage";
import { BackupService } from "./service";

let dir = "";

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "slutvival-backup-service-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("BackupService", () => {
  it("creates a remote manual backup and removes local staging archive", async () => {
    const uploaded: string[] = [];
    let uploadedBytes = 0;
    const storage = {
      uploadFile: async (key: string, file: string) => {
        uploaded.push(key);
        uploadedBytes = (await fs.stat(file)).size;
      },
      deleteObject: async () => undefined,
      downloadFile: async () => undefined,
      listObjects: async () => [],
    } as unknown as BackupObjectStorage;

    const dataRoot = path.join(dir, "vintage");
    await fs.mkdir(path.join(dataRoot, "Saves"), { recursive: true });
    await fs.writeFile(path.join(dataRoot, "Saves", "world.vcdbs"), "world", "utf8");

    const service = new BackupService({
      dbPath: path.join(dir, "backups.sqlite"),
      stagingDir: path.join(dir, "staging"),
      gameStorage: storage,
      gameBucket: "game-bucket",
    });

    const backup = await service.createGameBackup({
      serverId: "server-a",
      game: "vintage-story",
      dataRoot,
      worldName: "World",
      kind: "manual",
    });

    expect(backup.storage).toBe("backblaze");
    expect(backup.storedBytes).toBe(uploadedBytes);
    expect(uploaded[0]).toMatch(/^vintage-story\/server-a\/manual\//);
    await expect(fs.readdir(path.join(dir, "staging"))).resolves.toEqual([]);
  });
});
