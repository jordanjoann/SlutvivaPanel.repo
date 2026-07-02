import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BackupDb } from "./db";

let dir = "";

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "slutvival-backup-db-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("BackupDb", () => {
  it("records and lists uploaded backups newest first", () => {
    const db = new BackupDb(path.join(dir, "backups.sqlite"));
    db.recordUploaded({
      id: "bk_one",
      serverId: "server-a",
      name: "manual-1",
      kind: "manual",
      bucket: "game-bucket",
      objectKey: "vintage-story/server-a/manual/one.tar.zst",
      sizeBytes: 42,
      storedBytes: 42,
      fileCount: 3,
      checksumSha256: "abc",
      createdAt: 100,
      expiresAt: 200,
      worldName: "World",
      note: "Manual",
    });
    db.recordUploaded({
      id: "bk_two",
      serverId: "server-a",
      name: "manual-2",
      kind: "manual",
      bucket: "game-bucket",
      objectKey: "vintage-story/server-a/manual/two.tar.zst",
      sizeBytes: 84,
      storedBytes: 84,
      fileCount: 5,
      checksumSha256: "def",
      createdAt: 300,
    });
    expect(db.listBackups("server-a").map((b) => b.id)).toEqual(["bk_two", "bk_one"]);
  });

  it("marks a backup deleted instead of returning it as active", () => {
    const db = new BackupDb(path.join(dir, "backups.sqlite"));
    db.recordUploaded({
      id: "bk_delete",
      serverId: "server-a",
      name: "manual-delete",
      kind: "manual",
      bucket: "game-bucket",
      objectKey: "vintage-story/server-a/manual/delete.tar.zst",
      sizeBytes: 1,
      checksumSha256: "abc",
      createdAt: 100,
    });
    expect(db.markDeleted("server-a", "bk_delete", 150)).toBe(true);
    expect(db.listBackups("server-a")).toHaveLength(0);
  });
});
