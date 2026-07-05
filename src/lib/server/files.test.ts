import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let root = "";

async function loadModules() {
  vi.resetModules();
  vi.stubEnv("SLUTVIVAL_ROOT", root);
  const store = await import("./store");
  const files = await import("./files");
  return { store, files };
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "slutvival-files-"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(root, { recursive: true, force: true });
});

describe("server files", () => {
  it("uses the target instance data path for GTA files", async () => {
    const { store, files } = await loadModules();
    const instance = await store.ensureGtaInstance();
    await fs.writeFile(path.join(instance.dataPath, "resources", "server.txt"), "ok", "utf8");

    const entries = await files.listDir("los-santos", "resources");

    expect(entries.map((entry) => entry.path)).toContain("resources/server.txt");
  });
});
