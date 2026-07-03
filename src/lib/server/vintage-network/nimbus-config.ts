import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Instance } from "@/lib/types";
import { config, vsPaths } from "@/lib/server/config";
import {
  HUB_INSTANCE_ID,
  NIMBUS_PROXY_CONTAINER,
  nimbusProxyConfigPath,
  nimbusRuntimeDir,
  nimbusSecretPath,
} from "./constants";

export async function readOrCreateNimbusSecret(file = nimbusSecretPath()): Promise<string> {
  const existing = await fs.readFile(file, "utf8").catch(() => "");
  if (existing.trim()) return existing.trim();
  const value = randomBytes(32).toString("base64url");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${value}\n`, { encoding: "utf8", mode: 0o600 });
  return value;
}

export function backendAddress(inst: Instance): string {
  return `${inst.docker.containerName}:${inst.port}`;
}

export function nimbusProxyToml(instances: Instance[], secret: string): string {
  const active = instances.filter((inst) => inst.game === "vintage-story");
  const tryInstance = active.find((inst) => inst.id === HUB_INSTANCE_ID) ?? active[0];
  const tryRoute = tryInstance?.id ?? HUB_INSTANCE_ID;
  const serverLines = active
    .map((inst) => `${inst.id} = "${backendAddress(inst)}"`)
    .sort();
  if (tryInstance && !active.some((inst) => inst.id === "default")) {
    serverLines.unshift(`default = "${backendAddress(tryInstance)}"`);
  }

  return [
    `bind = "0.0.0.0:${config.vintageNetwork.publicPort}"`,
    `try = ["${tryRoute}"]`,
    "",
    "[servers]",
    ...serverLines,
    "",
    "[registry]",
    'mode = "embedded"',
    `embedded_bind = "http://0.0.0.0:${config.vintageNetwork.registryPort}"`,
    `embedded_shared_secret = "${secret}"`,
    "",
  ].join("\n");
}

export function backendNimbusConfig(inst: Instance, secret: string): Record<string, unknown> {
  return {
    Enabled: true,
    ServerId: inst.id,
    DisplayName: inst.name,
    PublicHost: config.vintageNetwork.publicHost,
    PublicPort: config.vintageNetwork.publicPort,
    Tags: [inst.group ?? "Servers"],
    RegistryUrl: `http://${NIMBUS_PROXY_CONTAINER}:${config.vintageNetwork.registryPort}`,
    SharedSecret: secret,
    HeartbeatIntervalSeconds: 15,
    RegistryHttpTimeoutSeconds: 5,
    Maintenance: false,
    ReservationRequired: true,
    AllowPlayerServerCommand: true,
    TransferMode: "redirect",
    SeamlessPrepareAckTimeoutSeconds: 10,
  };
}

export async function activateNimbusRuntime(nimbusInstallDir: string): Promise<string> {
  const source = path.join(nimbusInstallDir, "release_full", "Nimbus");
  const runtime = nimbusRuntimeDir();
  if (!existsSync(path.join(source, "Nimbus.Proxy.dll"))) {
    throw new Error("Nimbus proxy artifact is missing Nimbus.Proxy.dll");
  }
  await fs.rm(runtime, { recursive: true, force: true });
  await fs.mkdir(path.dirname(runtime), { recursive: true });
  await fs.cp(source, runtime, { recursive: true });
  return runtime;
}

export async function installNimbusServerMod(nimbusInstallDir: string, modsDir: string): Promise<void> {
  const source = path.join(nimbusInstallDir, "release_full", "Nimbus.ServerMod");
  const target = path.join(modsDir, "Nimbus.ServerMod");
  if (!existsSync(path.join(source, "modinfo.json"))) {
    throw new Error("Nimbus server mod artifact is missing modinfo.json");
  }
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(modsDir, { recursive: true });
  await fs.cp(source, target, { recursive: true });
}

export async function writeNimbusFiles(instances: Instance[], nimbusInstallDir: string): Promise<void> {
  const secret = await readOrCreateNimbusSecret();
  await activateNimbusRuntime(nimbusInstallDir);
  await atomicWrite(nimbusProxyConfigPath(), nimbusProxyToml(instances, secret));
  for (const inst of instances) {
    const paths = vsPaths(inst.id);
    await installNimbusServerMod(nimbusInstallDir, paths.mods);
    await fs.mkdir(paths.modConfig, { recursive: true });
    await atomicWrite(
      path.join(paths.modConfig, "nimbus-server.json"),
      JSON.stringify(backendNimbusConfig(inst, secret), null, 2),
    );
  }
}

async function atomicWrite(file: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, content, "utf8");
  await fs.rename(tmp, file);
}
