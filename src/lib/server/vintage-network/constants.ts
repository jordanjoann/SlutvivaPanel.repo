import path from "node:path";
import { config } from "@/lib/server/config";
import type { VintageStoryWorldGenerationConfig } from "@/lib/vintage-story-world";

export const HUB_INSTANCE_ID = "hub";
export const NIMBUS_PROXY_CONTAINER = "nimbus-proxy";
export const STRATUM_RELEASE_TAG =
  process.env.STRATUM_RELEASE_TAG ?? "v1.22.3-stratum.15";
export const STRATUM_ASSET_NAME =
  process.env.STRATUM_ASSET_NAME ??
  "stratum-1.22.3-stratum.15-linux-x64.zip";
export const NIMBUS_RELEASE_TAG =
  process.env.NIMBUS_RELEASE_TAG ?? "0.1.0-dev";
export const NIMBUS_ASSET_NAME =
  process.env.NIMBUS_ASSET_NAME ?? "Nimbus-v0.1.0.zip";

export function nimbusPublicAddress(): string {
  return `${config.vintageNetwork.publicHost}:${config.vintageNetwork.publicPort}`;
}

export function stratumInstallDir(): string {
  return path.join(config.toolsRoot, "stratum", STRATUM_RELEASE_TAG);
}

export function nimbusInstallDir(): string {
  return path.join(config.toolsRoot, "nimbus", NIMBUS_RELEASE_TAG);
}

export function nimbusRuntimeDir(): string {
  return path.join(config.toolsRoot, "nimbus", "runtime");
}

export function nimbusSecretPath(): string {
  return path.join(config.secretsRoot, "nimbus-registry.secret");
}

export function nimbusProxyConfigPath(): string {
  return path.join(nimbusRuntimeDir(), "nimbus.proxy.toml");
}

export function creativeSuperflatHubWorld(): Partial<VintageStoryWorldGenerationConfig> {
  return {
    playStyle: "creativebuilding",
    gameMode: "creative",
    worldType: "superflat",
    allowCreativeMode: true,
    creatureHostility: "off",
    temporalStability: false,
    temporalStorms: "off",
    temporalRifts: "off",
    deathPunishment: "keep",
    allowPvp: false,
    allowFireSpread: false,
    allowFallingBlocks: false,
    passTimeWhenEmpty: false,
    whitelistMode: false,
  };
}
