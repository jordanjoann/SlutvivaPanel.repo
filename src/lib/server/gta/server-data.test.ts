import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Instance } from "@/lib/types";

const childProcessMocks = vi.hoisted(() => ({
  execFile: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: childProcessMocks.execFile,
}));

let root = "";

function instance(): Instance {
  return {
    id: "los-santos",
    name: "Los Santos",
    game: "gta",
    description: "Private GTA test server",
    development: false,
    version: "recommended",
    port: 30120,
    dataPath: path.join(root, "games", "gta", "los-santos", "server-data"),
    runtime: "docker",
    serverEngine: "fxserver",
    docker: {
      containerName: "gta-los-santos",
      image: "slutvival/fxserver-base:bookworm",
      network: "slutvival-net",
    },
    resources: { memoryLimitMB: 4096, cpuLimit: 2 },
    maxPlayers: 48,
    passwordProtected: false,
    publicAdvertised: false,
    autoRestart: false,
    autoBackup: false,
    createdAt: 1,
    updatedAt: 1,
  };
}

async function loadModule() {
  vi.resetModules();
  vi.stubEnv("SLUTVIVAL_ROOT", root);
  return import("./server-data");
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "slutvival-gta-"));
  childProcessMocks.execFile.mockReset();
  childProcessMocks.execFile.mockImplementation(
    ((
      _cmd: string,
      _args: readonly string[],
      callback: (error: Error | null) => void,
    ) => {
      callback(new Error("git clone should not run"));
    }) as never,
  );
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(root, { recursive: true, force: true });
});

describe("GTA server data", () => {
  it("seeds server.cfg and an ignored secret placeholder", async () => {
    const { ensureGtaServerData, hasUsableGtaSecret } = await loadModule();
    const inst = instance();

    await ensureGtaServerData(inst, { cloneBaseResources: false });

    const cfg = await fs.readFile(path.join(inst.dataPath, "server.cfg"), "utf8");
    expect(cfg).toContain('endpoint_add_tcp "0.0.0.0:30120"');
    expect(cfg).toContain('endpoint_add_udp "0.0.0.0:30120"');
    expect(cfg).toContain("ensure mapmanager");
    expect(cfg).toContain('sv_hostname "Los Santos"');
    expect(cfg).toContain('sets sv_projectDesc "Private GTA test server"');
    expect(cfg).toContain("sv_maxclients 48");
    expect(cfg).toContain("exec server.secret.cfg");

    const secret = await fs.readFile(path.join(inst.dataPath, "server.secret.cfg"), "utf8");
    expect(secret).toContain("sv_licenseKey");
    expect(secret).toContain("replace-with-cfx-license-key");
    await expect(hasUsableGtaSecret(inst)).resolves.toBe(false);
  });

  it("detects a real Cfx license key", async () => {
    const { ensureGtaServerData, hasUsableGtaSecret } = await loadModule();
    const inst = instance();
    await ensureGtaServerData(inst, { cloneBaseResources: false });
    await fs.writeFile(
      path.join(inst.dataPath, "server.secret.cfg"),
      'sv_licenseKey "cfxk_real_value"\n',
      "utf8",
    );

    await expect(hasUsableGtaSecret(inst)).resolves.toBe(true);
  });

  it("does not reclone base resources when the Cfx mapmanager resource exists", async () => {
    const { ensureGtaServerData } = await loadModule();
    const inst = instance();
    await fs.mkdir(path.join(inst.dataPath, "resources", "[managers]", "mapmanager"), {
      recursive: true,
    });

    await ensureGtaServerData(inst);

    expect(childProcessMocks.execFile).not.toHaveBeenCalled();
  });
});
