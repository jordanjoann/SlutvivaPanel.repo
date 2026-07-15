import { existsSync } from "node:fs";
import type {
  CreateInstanceInput,
  Instance,
  VintageStoryNetworkSetupResult,
  VintageStoryNetworkStatus,
} from "@/lib/types";
import { config } from "@/lib/server/config";
import { createInstance, listInstances } from "@/lib/server/store";
import { supervisor } from "@/lib/server/supervisor";
import { ensureNimbusArtifact, ensureStratumArtifact, readArtifactMarker } from "./artifacts";
import {
  HUB_INSTANCE_ID,
  NIMBUS_RELEASE_TAG,
  STRATUM_RELEASE_TAG,
  creativeSuperflatHubWorld,
  nimbusInstallDir,
  nimbusProxyConfigPath,
  nimbusPublicAddress,
  nimbusRuntimeDir,
  stratumInstallDir,
} from "./constants";
import { ensureNimbusProxy, isNimbusProxyRunning } from "./docker-proxy";
import { writeNimbusFiles } from "./nimbus-config";

export async function getVintageNetworkStatus(): Promise<VintageStoryNetworkStatus> {
  const hub = selectHubInstance(await listInstances("vintage-story"));
  const stratumMarker = await readArtifactMarker(stratumInstallDir());
  const nimbusMarker = await readArtifactMarker(nimbusInstallDir());
  return {
    publicAddress: nimbusPublicAddress(),
    publicHost: config.vintageNetwork.publicHost,
    publicPort: config.vintageNetwork.publicPort,
    registryPort: config.vintageNetwork.registryPort,
    hubExists: Boolean(hub),
    stratumInstalled: stratumMarker?.tag === STRATUM_RELEASE_TAG,
    nimbusInstalled: nimbusMarker?.tag === NIMBUS_RELEASE_TAG,
    nimbusConfigured: existsSync(nimbusProxyConfigPath()),
    nimbusProxyRunning: await isNimbusProxyRunning(),
  };
}

export async function setupVintageNetwork(): Promise<VintageStoryNetworkSetupResult> {
  await ensureStratumArtifact();
  const nimbusDir = await ensureNimbusArtifact();
  const hub = await ensureHubInstance();
  const instances = await listInstances("vintage-story");
  await writeNimbusFiles(instances, nimbusDir);
  for (const inst of instances) {
    await supervisor.power(inst.id === hub.id ? hub : inst, "start");
  }
  await ensureNimbusProxy(nimbusRuntimeDir());
  return { ok: true, status: await getVintageNetworkStatus() };
}

async function ensureHubInstance() {
  const existing = selectHubInstance(await listInstances("vintage-story"));
  if (existing) return existing;

  const input: CreateInstanceInput = {
    id: HUB_INSTANCE_ID,
    name: "Hub",
    group: "Servers",
    description: "Creative superflat landing server for the Slutvival Vintage Story network.",
    motd: "Welcome to Slutvival.",
    worldName: "Hub",
    game: "vintage-story",
    runtime: "docker",
    serverEngine: "stratum",
    port: config.vintageNetwork.publicPort,
    maxPlayers: 16,
    passwordProtected: false,
    publicAdvertised: false,
    autoRestart: false,
    autoBackup: true,
    initialWorldConfig: creativeSuperflatHubWorld(),
  };
  return createInstance(input);
}

export function selectHubInstance(instances: Instance[]): Instance | undefined {
  return (
    instances.find((instance) => instance.id === HUB_INSTANCE_ID) ??
    instances.find((instance) => instance.name.trim().toLowerCase() === "hub")
  );
}
