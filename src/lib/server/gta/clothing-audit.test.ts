import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Instance } from "@/lib/types";
import {
  listClothingAudit,
  readClothingAuditPreview,
  saveClothingAuditTag,
} from "./clothing-audit";

let tempDir = "";

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "clothing-audit-"));
});

afterEach(async () => {
  if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
});

describe("GTA clothing audit panel data", () => {
  it("merges saved audit entries with captured screenshot files", async () => {
    const instance = testInstance(tempDir);
    const dataDir = auditDataDir(tempDir);
    const screenshots = path.join(dataDir, "screenshots");
    await fs.mkdir(screenshots, { recursive: true });
    await fs.writeFile(
      path.join(dataDir, "clothing_audit.json"),
      JSON.stringify({
        items: [
          {
            model: "mp_f_freemode_01",
            modelHash: -1667301416,
            componentKey: "tops",
            componentLabel: "Tops / Jackets",
            component: 11,
            drawable: 82,
            texture: 0,
            tag: "broken",
            tagLabel: "Broken / Hide",
            updatedAt: "2026-07-08T21:03:28Z",
          },
        ],
      }),
      "utf8",
    );
    await fs.writeFile(path.join(screenshots, "mp_f_freemode_01_11_82_0.jpg"), "image");
    await fs.writeFile(path.join(screenshots, "mp_f_freemode_01_11_83_0.jpg"), "image");

    const audit = await listClothingAudit(instance, (itemId) => `/preview/${itemId}`);

    expect(audit.totals.total).toBe(2);
    expect(audit.totals.captured).toBe(2);
    expect(audit.totals.tagged).toBe(1);
    expect(audit.items.map((item) => item.id)).toEqual([
      "mp_f_freemode_01_11_82_0",
      "mp_f_freemode_01_11_83_0",
    ]);
    expect(audit.items[0].tag).toBe("broken");
    expect(audit.items[1].source).toBe("screenshot");
    expect(audit.items[1].previewUrl).toBe("/preview/mp_f_freemode_01_11_83_0");
  });

  it("saves a tag for a screenshot-only audit item", async () => {
    const instance = testInstance(tempDir);
    const dataDir = auditDataDir(tempDir);
    const screenshots = path.join(dataDir, "screenshots");
    await fs.mkdir(screenshots, { recursive: true });
    await fs.writeFile(path.join(screenshots, "mp_f_freemode_01_11_83_0.jpg"), "image");

    await saveClothingAuditTag(instance, "mp_f_freemode_01_11_83_0", "jacket");

    const audit = await listClothingAudit(instance);
    expect(audit.items).toHaveLength(1);
    expect(audit.items[0].tag).toBe("jacket");
    expect(audit.items[0].componentLabel).toBe("Tops / Jackets");

    const preview = await readClothingAuditPreview(instance, "mp_f_freemode_01_11_83_0");
    expect(preview?.mimeType).toBe("image/jpeg");
    expect(preview?.body.toString()).toBe("image");
  });
});

function testInstance(dataPath: string): Instance {
  return {
    id: "los-santos",
    name: "Los Santos",
    game: "gta",
    description: "",
    group: "Servers",
    development: false,
    version: "recommended",
    port: 30120,
    dataPath,
    runtime: "docker",
    serverEngine: "fxserver",
    docker: {
      containerName: "gta-los-santos",
      image: "fxserver",
      network: "slutvival-net",
    },
    resources: { memoryLimitMB: 4096, cpuLimit: 2 },
    motd: "",
    worldName: "Los Santos",
    seed: "",
    maxPlayers: 48,
    passwordProtected: false,
    publicAdvertised: false,
    autoRestart: false,
    autoBackup: false,
    createdAt: 0,
    updatedAt: 0,
  };
}

function auditDataDir(root: string) {
  return path.join(
    root,
    "resources",
    "[mods]",
    "slutvival-clothing-audit",
    "data",
  );
}
