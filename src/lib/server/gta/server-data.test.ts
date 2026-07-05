import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Instance } from "@/lib/types";

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

  it("returns null when no bridge token has been seeded", async () => {
    const { gtaSecretTemplate, readGtaBridgeToken } = await loadModule();
    const inst = instance();

    await expect(readGtaBridgeToken(inst)).resolves.toBeNull();

    await fs.mkdir(inst.dataPath, { recursive: true });
    await fs.writeFile(path.join(inst.dataPath, "server.secret.cfg"), gtaSecretTemplate(), "utf8");

    await expect(readGtaBridgeToken(inst)).resolves.toBeNull();
  });

  it("seeds the Slutvival admin resource and bridge token", async () => {
    const { ensureGtaServerData, readGtaBridgeToken } = await loadModule();
    const inst = instance();

    await ensureGtaServerData(inst, { cloneBaseResources: false });

    const manifest = await fs.readFile(
      path.join(inst.dataPath, "resources", "[slutvival]", "slutvival-admin", "fxmanifest.lua"),
      "utf8",
    );
    const serverLua = await fs.readFile(
      path.join(inst.dataPath, "resources", "[slutvival]", "slutvival-admin", "server.lua"),
      "utf8",
    );
    const secret = await fs.readFile(path.join(inst.dataPath, "server.secret.cfg"), "utf8");

    expect(manifest).toContain("fx_version");
    expect(serverLua).toContain("slutvival_kick");
    expect(serverLua).toContain("playerConnecting");
    expect(secret).toMatch(/set slutvival_bridge_token "[a-f0-9]{48}"/);
    await expect(readGtaBridgeToken(inst)).resolves.toMatch(/[a-f0-9]{48}/);
  });

  it("starts slutvival-admin after secrets are executed", async () => {
    const { ensureGtaServerData } = await loadModule();
    const inst = instance();

    await ensureGtaServerData(inst, { cloneBaseResources: false });

    const cfg = await fs.readFile(path.join(inst.dataPath, "server.cfg"), "utf8");
    expect(cfg.indexOf("exec server.secret.cfg")).toBeGreaterThan(-1);
    expect(cfg.indexOf("ensure slutvival-admin")).toBeGreaterThan(
      cfg.indexOf("exec server.secret.cfg"),
    );
    expect(cfg).toContain('set slutvival_panel_url "http://slutvival-panel:3000"');
    expect(cfg).toContain('set slutvival_panel_server_id "los-santos"');
  });

  it("generates the admin bridge payload contract", async () => {
    const { ensureGtaServerData } = await loadModule();
    const inst = instance();

    await ensureGtaServerData(inst, { cloneBaseResources: false });

    const serverLua = await fs.readFile(
      path.join(inst.dataPath, "resources", "[slutvival]", "slutvival-admin", "server.lua"),
      "utf8",
    );

    expect(serverLua).toContain("payload.type = eventName");
    expect(serverLua).not.toContain("payload.event = eventName");
    expect(serverLua).toContain("players = collectPlayers()");
    expect(serverLua).toContain("serverId = tonumber(player)");
    expect(serverLua).toContain("type = identifierType");
    expect(serverLua).toContain("SUPPORTED_IDENTIFIER_TYPES");
    expect(serverLua).toContain("SUPPORTED_IDENTIFIER_TYPES[identifierType]");
    expect(serverLua).toContain("license = true");
    expect(serverLua).toContain("license2 = true");
    expect(serverLua).toContain("discord = true");
    expect(serverLua).toContain("steam = true");
    expect(serverLua).toContain("fivem = true");
    expect(serverLua).toContain("ip = true");
    expect(serverLua).toContain("player = collectPlayer(player, playerName)");
    expect(serverLua).not.toContain("playerSource = player");
    expect(serverLua).not.toContain("print(bridgeToken)");
  });

  it("does not replace an existing bridge token", async () => {
    const { ensureGtaServerData, readGtaBridgeToken } = await loadModule();
    const inst = instance();
    await ensureGtaServerData(inst, { cloneBaseResources: false });
    const first = await readGtaBridgeToken(inst);

    await ensureGtaServerData(inst, { cloneBaseResources: false });

    await expect(readGtaBridgeToken(inst)).resolves.toBe(first);
  });
});
