import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ModSearchResult } from "@/lib/types";

const state = vi.hoisted(() => ({ root: "" }));

vi.mock("./config", () => ({
  vsPaths: (serverId: string) => {
    const data = path.join(state.root, serverId, "vintage");
    return {
      data,
      mods: path.join(data, "Mods"),
      managedMods: path.join(data, "Managed-Mods"),
      modConfig: path.join(data, "ModConfig"),
    };
  },
}));

vi.mock("./console-bus", () => ({ consoleBus: { push: vi.fn() } }));

import {
  installMod,
  listInstalled,
  removeMod,
  setModEnabled,
  updateMod,
} from "./mods";

const serverId = "hub-test";
const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x01, 0x02, 0x03]);
let version = "1.0.0";
let downloadHost = "moddbcdn.vintagestory.at";

function result(): ModSearchResult {
  return {
    id: "examplemod",
    name: "Example Mod",
    downloads: 1,
    latestVersion: version,
    versions: [],
  };
}

function paths() {
  const data = path.join(state.root, serverId, "vintage");
  return {
    mods: path.join(data, "Mods"),
    managed: path.join(data, "Managed-Mods"),
    manifest: path.join(data, "ModConfig", "panel-mods.json"),
  };
}

beforeEach(async () => {
  state.root = await fs.mkdtemp(path.join(os.tmpdir(), "slutvival-mods-"));
  version = "1.0.0";
  downloadHost = "moddbcdn.vintagestory.at";
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
    const url = String(input);
    if (url.includes("/api/mod/")) {
      return Response.json({
        mod: {
          modid: 123,
          name: "Example Mod",
          author: "Tester",
          side: "both",
          releases: [
            {
              modversion: version,
              mainfile: `https://${downloadHost}/example.zip?dl=examplemod_${version}.zip`,
              tags: ["1.22.3"],
            },
          ],
        },
      });
    }
    return new Response(zip, {
      status: 200,
      headers: { "content-length": String(zip.byteLength), "content-type": "application/zip" },
    });
  }));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await fs.rm(state.root, { recursive: true, force: true });
});

describe("Vintage Story managed mods", () => {
  it("downloads an official ModDB archive before recording it as installed", async () => {
    const installed = await installMod(serverId, result(), version);

    expect(installed.fileName).toBe("examplemod_1.0.0.zip");
    expect(await fs.readFile(path.join(paths().mods, installed.fileName))).toEqual(Buffer.from(zip));
    expect(JSON.parse(await fs.readFile(paths().manifest, "utf8"))).toMatchObject([
      { id: "examplemod", installedVersion: "1.0.0", enabled: true },
    ]);
    expect(await listInstalled(serverId)).toHaveLength(1);
  });

  it("moves the real archive when disabling and enabling a mod", async () => {
    const installed = await installMod(serverId, result(), version);

    await setModEnabled(serverId, installed.id, false);
    await expect(fs.stat(path.join(paths().mods, installed.fileName))).rejects.toThrow();
    expect((await fs.stat(path.join(paths().managed, installed.fileName))).isFile()).toBe(true);

    await setModEnabled(serverId, installed.id, true);
    expect((await fs.stat(path.join(paths().mods, installed.fileName))).isFile()).toBe(true);
    await expect(fs.stat(path.join(paths().managed, installed.fileName))).rejects.toThrow();
  });

  it("downloads updates and removes the superseded archive", async () => {
    const installed = await installMod(serverId, result(), version);
    version = "2.0.0";

    const updated = await updateMod(serverId, installed.id);

    expect(updated?.installedVersion).toBe("2.0.0");
    expect((await fs.stat(path.join(paths().mods, "examplemod_2.0.0.zip"))).isFile()).toBe(true);
    await expect(fs.stat(path.join(paths().mods, "examplemod_1.0.0.zip"))).rejects.toThrow();
  });

  it("removes the archive and manifest entry together", async () => {
    const installed = await installMod(serverId, result(), version);

    expect(await removeMod(serverId, installed.id)).toBe(true);
    await expect(fs.stat(path.join(paths().mods, installed.fileName))).rejects.toThrow();
    expect(JSON.parse(await fs.readFile(paths().manifest, "utf8"))).toEqual([]);
  });

  it("does not present stale manifest-only entries as installed", async () => {
    await fs.mkdir(path.dirname(paths().manifest), { recursive: true });
    await fs.writeFile(paths().manifest, JSON.stringify([
      { id: "ghost", name: "Ghost", installedVersion: "1", enabled: true, fileName: "ghost_1.zip" },
    ]));

    expect(await listInstalled(serverId)).toEqual([]);
  });

  it("rejects archive URLs outside the official Vintage Story CDN", async () => {
    downloadHost = "example.com";

    await expect(installMod(serverId, result(), version)).rejects.toThrow("untrusted archive URL");
    await expect(fs.stat(paths().manifest)).rejects.toThrow();
  });
});
