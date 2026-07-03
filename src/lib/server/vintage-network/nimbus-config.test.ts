import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Instance } from "@/lib/types";
import {
  backendAddress,
  backendNimbusConfig,
  installNimbusServerMod,
  nimbusProxyToml,
  readOrCreateNimbusSecret,
} from "./nimbus-config";

let dir = "";

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "slutvival-nimbus-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

function instance(overrides: Partial<Instance> = {}): Instance {
  return {
    id: "hub",
    name: "Hub",
    game: "vintage-story",
    development: false,
    version: "1.22.3",
    port: 42420,
    dataPath: path.join(dir, "hub", "vintage"),
    runtime: "docker",
    serverEngine: "stratum",
    docker: { containerName: "vs-hub", image: "mcr.microsoft.com/dotnet/runtime:10.0", network: "slutvival-net" },
    resources: { memoryLimitMB: 4096, cpuLimit: 2 },
    maxPlayers: 16,
    passwordProtected: false,
    publicAdvertised: false,
    autoRestart: false,
    autoBackup: true,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("nimbus config", () => {
  it("creates and reuses the shared secret", async () => {
    const file = path.join(dir, "secret");
    const first = await readOrCreateNimbusSecret(file);
    const second = await readOrCreateNimbusSecret(file);
    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(20);
  });

  it("maps backends to private Docker addresses", () => {
    expect(backendAddress(instance())).toBe("vs-hub:42420");
  });

  it("writes proxy TOML with hub as the first route", () => {
    const toml = nimbusProxyToml([instance()], "secret");
    expect(toml).toContain('bind = "0.0.0.0:42420"');
    expect(toml).toContain('embedded_bind = "http://0.0.0.0:8765"');
    expect(toml).toContain('hub = "vs-hub:42420"');
    expect(toml).toContain('try = ["hub"]');
  });

  it("writes backend JSON for reservation-required Nimbus joins", () => {
    expect(backendNimbusConfig(instance(), "secret")).toMatchObject({
      Enabled: true,
      ServerId: "hub",
      PublicHost: "play.slutvival.com",
      PublicPort: 42420,
      RegistryUrl: "http://nimbus-proxy:8765",
      SharedSecret: "secret",
      ReservationRequired: true,
      TransferMode: "redirect",
    });
  });

  it("copies Nimbus.ServerMod into the backend Mods directory", async () => {
    const source = path.join(dir, "release_full", "Nimbus.ServerMod");
    const mods = path.join(dir, "hub", "vintage", "Mods");
    await fs.mkdir(source, { recursive: true });
    await fs.writeFile(path.join(source, "modinfo.json"), "{}");
    await fs.writeFile(path.join(source, "Nimbus.ServerMod.dll"), "dll");
    await installNimbusServerMod(dir, mods);
    expect(await fs.readFile(path.join(mods, "Nimbus.ServerMod", "Nimbus.ServerMod.dll"), "utf8")).toBe("dll");
  });
});
