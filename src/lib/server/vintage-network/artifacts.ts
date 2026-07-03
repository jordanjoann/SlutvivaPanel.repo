import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import {
  NIMBUS_ASSET_NAME,
  NIMBUS_RELEASE_TAG,
  STRATUM_ASSET_NAME,
  STRATUM_RELEASE_TAG,
  nimbusInstallDir,
  stratumInstallDir,
} from "./constants";

const execFileAsync = promisify(execFile);
const MARKER = ".slutvival-artifact.json";

export type GitHubRelease = {
  tag_name: string;
  assets: Array<{ name: string; browser_download_url: string }>;
};

export type ArtifactMarker = {
  name: "stratum" | "nimbus";
  tag: string;
  asset: string;
  installedAt: number;
};

export function selectReleaseAsset(
  release: GitHubRelease,
  assetName: string,
): { name: string; browser_download_url: string } {
  const asset = release.assets.find((item) => item.name === assetName);
  if (!asset) {
    throw new Error(`Release ${release.tag_name} did not contain asset ${assetName}`);
  }
  return asset;
}

export async function writeArtifactMarker(
  dir: string,
  marker: Omit<ArtifactMarker, "installedAt">,
): Promise<void> {
  await fs.writeFile(
    path.join(dir, MARKER),
    JSON.stringify({ ...marker, installedAt: Date.now() }, null, 2),
    "utf8",
  );
}

export async function readArtifactMarker(dir: string): Promise<ArtifactMarker | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(dir, MARKER), "utf8")) as ArtifactMarker;
  } catch {
    return null;
  }
}

export async function assertStratumInstall(dir: string): Promise<void> {
  const binary = path.join(dir, "StratumServer");
  if (!existsSync(binary)) throw new Error("Stratum install is missing StratumServer");
  await fs.chmod(binary, 0o755);
}

export async function assertNimbusInstall(dir: string): Promise<void> {
  if (!existsSync(path.join(dir, "release_full", "Nimbus", "Nimbus.Proxy.dll"))) {
    throw new Error("Nimbus install is missing release_full/Nimbus/Nimbus.Proxy.dll");
  }
  if (!existsSync(path.join(dir, "release_full", "Nimbus.ServerMod", "modinfo.json"))) {
    throw new Error("Nimbus install is missing release_full/Nimbus.ServerMod/modinfo.json");
  }
}

export async function ensureStratumArtifact(): Promise<string> {
  return ensureGitHubZipArtifact({
    repo: "StratumServer/Stratum",
    tag: STRATUM_RELEASE_TAG,
    asset: STRATUM_ASSET_NAME,
    installDir: stratumInstallDir(),
    name: "stratum",
    validate: assertStratumInstall,
  });
}

export async function ensureNimbusArtifact(): Promise<string> {
  return ensureGitHubZipArtifact({
    repo: "StratumServer/Nimbus",
    tag: NIMBUS_RELEASE_TAG,
    asset: NIMBUS_ASSET_NAME,
    installDir: nimbusInstallDir(),
    name: "nimbus",
    validate: assertNimbusInstall,
  });
}

async function ensureGitHubZipArtifact(input: {
  repo: string;
  tag: string;
  asset: string;
  installDir: string;
  name: "stratum" | "nimbus";
  validate: (dir: string) => Promise<void>;
}): Promise<string> {
  const marker = await readArtifactMarker(input.installDir);
  if (marker?.tag === input.tag && marker.asset === input.asset) {
    await input.validate(input.installDir);
    return input.installDir;
  }

  const tmpRoot = `${input.installDir}.install-${Date.now()}`;
  const zipPath = path.join(tmpRoot, input.asset);
  const extractDir = path.join(tmpRoot, "extract");
  await fs.rm(tmpRoot, { recursive: true, force: true });
  await fs.mkdir(extractDir, { recursive: true });

  try {
    const release = await fetchRelease(input.repo, input.tag);
    const asset = selectReleaseAsset(release, input.asset);
    await downloadFile(asset.browser_download_url, zipPath);
    await execFileAsync("unzip", ["-q", zipPath, "-d", extractDir]);
    await input.validate(extractDir);
    await writeArtifactMarker(extractDir, {
      name: input.name,
      tag: input.tag,
      asset: input.asset,
    });
    await fs.rm(input.installDir, { recursive: true, force: true });
    await fs.mkdir(path.dirname(input.installDir), { recursive: true });
    await fs.rename(extractDir, input.installDir);
    return input.installDir;
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
}

async function fetchRelease(repo: string, tag: string): Promise<GitHubRelease> {
  const response = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${tag}`, {
    cache: "no-store",
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) {
    throw new Error(`GitHub release lookup failed for ${repo}@${tag}: HTTP ${response.status}`);
  }
  return (await response.json()) as GitHubRelease;
}

async function downloadFile(url: string, file: string): Promise<void> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Artifact download failed with HTTP ${response.status}`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, Buffer.from(await response.arrayBuffer()));
}
