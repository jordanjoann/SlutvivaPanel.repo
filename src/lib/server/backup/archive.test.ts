import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGameBackupArchive, extractGameBackupArchive } from "./archive";

let dir = "";

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "slutvival-archive-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("archive helpers", () => {
  it("archives and extracts protected Vintage Story entries", async () => {
    const data = path.join(dir, "vintage");
    await fs.mkdir(path.join(data, "Saves"), { recursive: true });
    await fs.mkdir(path.join(data, "Mods"), { recursive: true });
    await fs.writeFile(path.join(data, "Saves", "world.vcdbs"), "world", "utf8");
    await fs.writeFile(path.join(data, "Mods", "mod.zip"), "mod", "utf8");
    await fs.writeFile(path.join(data, "serverconfig.json"), "{}", "utf8");

    const archive = path.join(dir, "out", "backup.tar.zst");
    const result = await createGameBackupArchive({ dataRoot: data, archivePath: archive });
    expect(result.fileCount).toBe(3);
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(result.checksumSha256).toMatch(/^[a-f0-9]{64}$/);

    const restore = path.join(dir, "restore");
    await extractGameBackupArchive({ archivePath: archive, targetRoot: restore, expectedSha256: result.checksumSha256 });
    await expect(fs.readFile(path.join(restore, "Saves", "world.vcdbs"), "utf8")).resolves.toBe("world");
  });
});
