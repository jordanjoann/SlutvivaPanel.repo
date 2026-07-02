import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BackupObjectStorage } from "./storage";

let dir = "";

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "slutvival-storage-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("BackupObjectStorage", () => {
  it("delegates upload, download, and delete to the S3 client", async () => {
    const calls: string[] = [];
    const storage = new BackupObjectStorage(
      {
        bucket: "bucket",
        endpoint: "https://s3.us-west-004.backblazeb2.com",
        region: "us-west-004",
        keyId: "id",
        applicationKey: "key",
      },
      {
        send: async (command: { constructor: { name: string } }) => {
          calls.push(command.constructor.name);
          return {};
        },
      },
    );
    const file = path.join(dir, "file.txt");
    await fs.writeFile(file, "data", "utf8");
    await storage.uploadFile("a/b/file.txt", file, "text/plain");
    await storage.deleteObject("a/b/file.txt");
    expect(calls).toEqual(["PutObjectCommand", "HeadObjectCommand", "DeleteObjectCommand"]);
  });
});
