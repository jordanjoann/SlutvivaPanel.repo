import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { Instance } from "@/lib/types";
import {
  config,
  instanceDataPath,
  instanceDir,
  instanceServerPath,
} from "./config";
import { ensureStratumArtifact } from "./vintage-network/artifacts";
import { packageUrl } from "./versions";

const execFileAsync = promisify(execFile);

const VERSION_MARKER = ".slutvival-version";
const LEGACY_IMAGE = "slutvival/vintage-story:latest";

export function normalizeDockerImage(image?: string): string {
  if (!image || image === LEGACY_IMAGE) return config.docker.image;
  return image;
}

export function dockerServiceName(inst: Instance): string {
  return inst.game === "vintage-story" ? "vintage-story" : inst.id;
}

export function dockerCommand(inst: Instance): string[] {
  if (inst.serverEngine === "stratum") {
    return ["./StratumServer", "--dataPath", "/data"];
  }
  return ["dotnet", "VintagestoryServer.dll", "--dataPath", "/data"];
}

export function serverInstallMarkerValue(inst: Instance): string {
  return `${inst.serverEngine}:${inst.version}`;
}

export async function ensureInstanceDockerFiles(inst: Instance): Promise<void> {
  await fs.mkdir(instanceDir(inst.id), { recursive: true });
  await fs.writeFile(
    path.join(instanceDir(inst.id), ".env"),
    [
      `SERVER_ID=${inst.id}`,
      `SERVER_NAME=${quoteEnv(inst.name)}`,
      `VINTAGE_STORY_VERSION=${inst.version}`,
      `VINTAGE_STORY_PORT=${inst.port}`,
      `VINTAGE_STORY_IMAGE=${normalizeDockerImage(inst.docker.image)}`,
      `VINTAGE_STORY_CONTAINER=${inst.docker.containerName}`,
      `VINTAGE_STORY_NETWORK=${inst.docker.network}`,
      "",
    ].join("\n"),
    "utf8",
  );
  await fs.writeFile(
    path.join(instanceDir(inst.id), "docker-compose.yml"),
    dockerCompose(inst),
    "utf8",
  );
}

export async function ensureServerInstalled(
  inst: Instance,
  options: { force?: boolean; onLog?: (message: string) => void } = {},
): Promise<void> {
  const installDir = instanceServerPath(inst.id);

  if (inst.serverEngine === "stratum") {
    await ensureStratumServerInstalled(inst, options);
    return;
  }

  if (
    !options.force &&
    (await hasInstalledVersion(
      installDir,
      serverInstallMarkerValue(inst),
      "VintagestoryServer.dll",
    ))
  ) {
    await ensureInstanceDockerFiles(inst);
    return;
  }

  options.onLog?.(`[Install] Downloading Vintage Story ${inst.version}.`);
  const tmpRoot = path.join(
    instanceDir(inst.id),
    `.server-install-${inst.version}-${Date.now()}`,
  );
  const extractDir = path.join(tmpRoot, "extract");
  const archivePath = path.join(tmpRoot, "server.tar.gz");

  await fs.rm(tmpRoot, { recursive: true, force: true });
  await fs.mkdir(extractDir, { recursive: true });

  try {
    await downloadPackage(inst.version, archivePath);
    options.onLog?.(`[Install] Extracting Vintage Story ${inst.version}.`);
    await execFileAsync("tar", ["-xzf", archivePath, "-C", extractDir]);
    await validateServerInstall(extractDir);
    await fs.writeFile(path.join(extractDir, VERSION_MARKER), `${serverInstallMarkerValue(inst)}\n`, "utf8");
    await fs.rm(installDir, { recursive: true, force: true });
    await fs.rename(extractDir, installDir);
    await ensureInstanceDockerFiles(inst);
    options.onLog?.(`[Install] Vintage Story ${inst.version} installed.`);
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
}

async function ensureStratumServerInstalled(
  inst: Instance,
  options: { force?: boolean; onLog?: (message: string) => void } = {},
): Promise<void> {
  const installDir = instanceServerPath(inst.id);
  if (
    !options.force &&
    (await hasInstalledVersion(
      installDir,
      serverInstallMarkerValue(inst),
      "StratumServer",
    ))
  ) {
    await ensureInstanceDockerFiles(inst);
    return;
  }

  options.onLog?.(`[Install] Installing Stratum ${inst.version}.`);
  const artifactDir = await ensureStratumArtifact();
  const tmpRoot = path.join(instanceDir(inst.id), `.server-install-stratum-${Date.now()}`);
  const extractDir = path.join(tmpRoot, "server");

  await fs.rm(tmpRoot, { recursive: true, force: true });
  await fs.mkdir(extractDir, { recursive: true });

  try {
    await fs.copyFile(path.join(artifactDir, "StratumServer"), path.join(extractDir, "StratumServer"));
    await fs.chmod(path.join(extractDir, "StratumServer"), 0o755);
    await fs.writeFile(path.join(extractDir, VERSION_MARKER), `${serverInstallMarkerValue(inst)}\n`, "utf8");
    await fs.rm(installDir, { recursive: true, force: true });
    await fs.rename(extractDir, installDir);
    await ensureInstanceDockerFiles(inst);
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
}

async function hasInstalledVersion(
  installDir: string,
  markerValue: string,
  requiredFile: string,
): Promise<boolean> {
  if (!existsSync(path.join(installDir, requiredFile))) return false;
  try {
    const marker = await fs.readFile(path.join(installDir, VERSION_MARKER), "utf8");
    return marker.trim() === markerValue;
  } catch {
    return false;
  }
}

async function downloadPackage(version: string, archivePath: string): Promise<void> {
  const response = await fetch(packageUrl(version), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Vintage Story download failed with HTTP ${response.status}`);
  }
  const body = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(archivePath, body);
}

async function validateServerInstall(dir: string): Promise<void> {
  const dll = path.join(dir, "VintagestoryServer.dll");
  if (!existsSync(dll)) {
    throw new Error("Vintage Story package did not contain VintagestoryServer.dll");
  }
}

function dockerCompose(inst: Instance): string {
  const service = dockerServiceName(inst);
  const image = normalizeDockerImage(inst.docker.image);
  const cpuLimit = inst.resources.cpuLimit > 0 ? inst.resources.cpuLimit : undefined;
  const cpus = cpuLimit ? `    cpus: "${cpuLimit}"\n` : "";

  return [
    "services:",
    `  ${service}:`,
    `    image: ${image}`,
    `    container_name: ${inst.docker.containerName}`,
    "    restart: unless-stopped",
    "    working_dir: /server",
    `    command: ${JSON.stringify(dockerCommand(inst))}`,
    "    stdin_open: true",
    "    tty: false",
    cpus.trimEnd(),
    `    mem_limit: ${inst.resources.memoryLimitMB}m`,
    "    networks:",
    `      - ${inst.docker.network}`,
    "    ports:",
    `      - "${inst.port}:${inst.port}/tcp"`,
    `      - "${inst.port}:${inst.port}/udp"`,
    "    volumes:",
    "      - ./server:/server:ro",
    "      - ./vintage:/data",
    "    environment:",
    `      VINTAGE_STORY_SERVER_VERSION: "${inst.version}"`,
    `      VINTAGE_STORY_DATA_PATH: "/data"`,
    "    labels:",
    '      slutvival.panel.managed: "true"',
    `      slutvival.panel.instance: "${inst.id}"`,
    "",
    "networks:",
    `  ${inst.docker.network}:`,
    "    external: true",
    "",
  ]
    .filter(Boolean)
    .join("\n");
}

function quoteEnv(value: string): string {
  if (!/[\s#"']/u.test(value)) return value;
  return JSON.stringify(value);
}

export function dockerMounts(inst: Instance): string[] {
  const serverMode = inst.serverEngine === "stratum" ? "rw" : "ro";
  return [
    `${instanceServerPath(inst.id)}:/server:${serverMode}`,
    `${instanceDataPath(inst.id)}:/data:rw`,
  ];
}
