import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { Instance } from "@/lib/types";
import { instanceDirForGame, instanceServerPathForGame } from "../config";
import { serverInstallMarkerValue } from "../provisioning";

const execFileAsync = promisify(execFile);
const ARTIFACTS_URL = "https://runtime.fivem.net/artifacts/fivem/build_proot_linux/master/";
const VERSION_MARKER = ".slutvival-version";

export type FxServerArtifact = {
  build: string;
  url: string;
};

export function parseRecommendedFxServerArtifact(
  html: string,
  baseUrl = ARTIFACTS_URL,
): FxServerArtifact {
  const match =
    /<a\b[^>]*\bhref\s*=\s*["']?\s*([^"'>\s]+)["']?[^>]*>\s*LATEST\s+RECOMMENDED\s*\((\d+)\)/iu.exec(
      html,
    );
  if (!match) {
    throw new Error("Could not find latest recommended FXServer Linux artifact");
  }
  const href = match[1].endsWith("/") ? `${match[1]}fx.tar.xz` : match[1];
  return {
    build: match[2],
    url: new URL(href, baseUrl).toString(),
  };
}

export async function resolveRecommendedFxServerArtifact(
  fetchImpl: typeof fetch = fetch,
): Promise<FxServerArtifact> {
  const response = await fetchImpl(ARTIFACTS_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`FXServer artifact listing failed with HTTP ${response.status}`);
  return parseRecommendedFxServerArtifact(await response.text(), ARTIFACTS_URL);
}

export async function ensureFxServerInstalled(
  inst: Instance,
  options: { force?: boolean; onLog?: (message: string) => void } = {},
): Promise<void> {
  const installDir = instanceServerPathForGame("gta", inst.id);
  const markerValue = serverInstallMarkerValue(inst);
  if (!options.force && (await hasInstalledVersion(installDir, markerValue))) return;

  const artifact = await resolveRecommendedFxServerArtifact();
  options.onLog?.(`[Install] Downloading FXServer ${artifact.build}.`);

  const tmpRoot = path.join(instanceDirForGame("gta", inst.id), `.fxserver-install-${Date.now()}`);
  const extractDir = path.join(tmpRoot, "server");
  const archivePath = path.join(tmpRoot, "fx.tar.xz");
  await fs.rm(tmpRoot, { recursive: true, force: true });
  await fs.mkdir(extractDir, { recursive: true });

  try {
    const response = await fetch(artifact.url, { cache: "no-store" });
    if (!response.ok) throw new Error(`FXServer download failed with HTTP ${response.status}`);
    await fs.writeFile(archivePath, Buffer.from(await response.arrayBuffer()));
    await execFileAsync("tar", ["-xf", archivePath, "-C", extractDir]);
    await validateFxServerInstall(extractDir);
    await fs.writeFile(path.join(extractDir, VERSION_MARKER), `${markerValue}\n`, "utf8");
    await fs.writeFile(
      path.join(extractDir, ".slutvival-artifact.json"),
      `${JSON.stringify(
        {
          name: "fxserver",
          channel: inst.version,
          build: artifact.build,
          url: artifact.url,
          installedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await fs.rm(installDir, { recursive: true, force: true });
    await fs.rename(extractDir, installDir);
    options.onLog?.(`[Install] FXServer ${artifact.build} installed.`);
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
}

async function hasInstalledVersion(installDir: string, markerValue: string): Promise<boolean> {
  try {
    await validateFxServerInstall(installDir);
    const marker = await fs.readFile(path.join(installDir, VERSION_MARKER), "utf8");
    return marker.trim() === markerValue;
  } catch {
    return false;
  }
}

async function validateFxServerInstall(dir: string): Promise<void> {
  const run = path.join(dir, "run.sh");
  const stat = await fs.stat(run);
  if (!stat.isFile()) throw new Error("FXServer artifact did not contain run.sh");
}
