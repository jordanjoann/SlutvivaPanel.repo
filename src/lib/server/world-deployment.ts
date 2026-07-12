import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import type { Instance, ServerStatus, WorldDeploymentResult } from "@/lib/types";
import { vsPaths } from "./config";
import { getWorld } from "./world";
import { supervisor } from "./supervisor";
import { updateInstance } from "./store";

const SQLITE_HEADER = Buffer.from("SQLite format 3\0", "ascii");
const DEFAULT_MAX_UPLOAD_BYTES = 8 * 1024 * 1024 * 1024;
const deploymentLocks = new Set<string>();

type DeploymentDeps = {
  getStatus: (instance: Instance) => Promise<ServerStatus>;
  stop: (instance: Instance) => Promise<void>;
  start: (instance: Instance) => Promise<void>;
  updateInstance: (id: string, patch: Partial<Instance>) => Promise<Instance | null>;
};

const defaultDeps: DeploymentDeps = {
  getStatus: async (instance) => (await supervisor.getState(instance)).status,
  stop: (instance) => supervisor.power(instance, "stop"),
  start: (instance) => supervisor.power(instance, "start"),
  updateInstance,
};

export async function deployWorld(
  instance: Instance,
  input: {
    fileName: string;
    body: ReadableStream<Uint8Array>;
    contentLength?: number;
  },
  deps: DeploymentDeps = defaultDeps,
): Promise<WorldDeploymentResult> {
  if (instance.game !== "vintage-story") {
    throw new WorldDeploymentError("World uploads are only supported for Vintage Story servers.");
  }
  if (deploymentLocks.has(instance.id)) {
    throw new WorldDeploymentError("A world deployment is already in progress for this server.");
  }

  deploymentLocks.add(instance.id);
  let stagedFile = "";
  try {
    const upload = await stageWorldUpload(instance, input);
    stagedFile = upload.path;
    const result = await activateWorld(instance, upload, deps);
    stagedFile = "";
    return result;
  } finally {
    deploymentLocks.delete(instance.id);
    if (stagedFile) await fs.rm(stagedFile, { force: true }).catch(() => {});
  }
}

export class WorldDeploymentError extends Error {}

async function stageWorldUpload(
  instance: Instance,
  input: {
    fileName: string;
    body: ReadableStream<Uint8Array>;
    contentLength?: number;
  },
) {
  const fileName = safeWorldFileName(input.fileName);
  const maxBytes = maxUploadBytes();
  if (input.contentLength !== undefined && input.contentLength > maxBytes) {
    throw new WorldDeploymentError(
      `World save exceeds the ${formatGiB(maxBytes)} GiB upload limit.`,
    );
  }

  const stagingDir = path.join(vsPaths(instance.id).data, "UploadStaging");
  const stagedFile = path.join(stagingDir, `${nanoid(12)}.vcdbs.part`);
  await fs.mkdir(stagingDir, { recursive: true });

  const handle = await fs.open(stagedFile, "wx");
  let bytesWritten = 0;
  const reader = input.body.getReader();
  let streamError: unknown;
  try {
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      const buffer = Buffer.from(chunk);
      bytesWritten += buffer.byteLength;
      if (bytesWritten > maxBytes) {
        throw new WorldDeploymentError(
          `World save exceeds the ${formatGiB(maxBytes)} GiB upload limit.`,
        );
      }
      await handle.write(buffer);
    }
    await handle.sync();
  } catch (error) {
    streamError = error;
    await reader.cancel().catch(() => {});
  } finally {
    reader.releaseLock();
    await handle.close().catch(() => {});
  }
  if (streamError) {
    await fs.rm(stagedFile, { force: true }).catch(() => {});
    throw streamError;
  }

  if (bytesWritten < SQLITE_HEADER.byteLength) {
    await fs.rm(stagedFile, { force: true });
    throw new WorldDeploymentError("The selected file is empty or not a Vintage Story world save.");
  }
  const header = Buffer.alloc(SQLITE_HEADER.byteLength);
  const readHandle = await fs.open(stagedFile, "r");
  try {
    await readHandle.read(header, 0, header.byteLength, 0);
  } finally {
    await readHandle.close();
  }
  if (!header.equals(SQLITE_HEADER)) {
    await fs.rm(stagedFile, { force: true });
    throw new WorldDeploymentError(
      "The selected file is not a valid Vintage Story .vcdbs save.",
    );
  }

  return { path: stagedFile, fileName };
}

async function activateWorld(
  instance: Instance,
  upload: { path: string; fileName: string },
  deps: DeploymentDeps,
): Promise<WorldDeploymentResult> {
  const paths = vsPaths(instance.id);
  const configFile = paths.serverConfig;
  const configRaw = await fs.readFile(configFile, "utf8");
  const config = parseJsonObject(configRaw);
  const currentWorldConfig = parseObject(config.WorldConfig);
  const previousLocation = stringValue(currentWorldConfig.SaveFileLocation);
  const previousSaveFileName = saveFileNameFromLocation(previousLocation);
  const worldName = path.basename(upload.fileName, path.extname(upload.fileName));
  const liveSaveFileName = await uniqueLiveFileName(paths.saves, upload.fileName);
  const liveSavePath = path.join(paths.saves, liveSaveFileName);
  const configBackup = path.join(
    paths.backupSaves,
    `serverconfig-before-world-import-${timestamp()}.json`,
  );
  const initialStatus = await deps.getStatus(instance);
  const serverWasRunning = isActive(initialStatus);
  if (!serverWasRunning && initialStatus !== "stopped" && initialStatus !== "crashed") {
    throw new WorldDeploymentError(
      `Wait for the server to finish its current ${initialStatus} operation before switching worlds.`,
    );
  }
  let stopped = false;
  let installed = false;

  try {
    if (serverWasRunning) {
      await deps.stop(instance);
      stopped = true;
    }

    await fs.mkdir(paths.saves, { recursive: true });
    await fs.mkdir(paths.backupSaves, { recursive: true });
    await fs.copyFile(configFile, configBackup);
    await fs.rename(upload.path, liveSavePath);
    installed = true;

    const nextConfig = {
      ...config,
      WorldConfig: {
        ...currentWorldConfig,
        SaveFileLocation: `/data/Saves/${liveSaveFileName}`,
        WorldName: worldName,
      },
    };
    await writeJsonAtomic(configFile, nextConfig);
    const updated = await deps.updateInstance(instance.id, { worldName });
    if (!updated) throw new Error(`Server '${instance.id}' no longer exists.`);
  } catch (error) {
    if (installed) await fs.rm(liveSavePath, { force: true }).catch(() => {});
    await writeTextAtomic(configFile, configRaw).catch(() => {});
    await deps.updateInstance(instance.id, { worldName: instance.worldName }).catch(() => {});
    if (serverWasRunning && stopped) await deps.start(instance).catch(() => {});
    throw error;
  }

  let serverStarted = false;
  let warning: string | undefined;
  if (serverWasRunning) {
    try {
      await deps.start({ ...instance, worldName });
      serverStarted = true;
    } catch (error) {
      serverStarted = false;
      warning = `The world is live, but the server could not be restarted: ${errorMessage(error)}`;
    }
  }

  return {
    world: await getWorld({ ...instance, worldName }),
    uploadedFileName: upload.fileName,
    liveSaveFileName,
    previousSaveFileName,
    configBackupFileName: path.basename(configBackup),
    serverWasRunning,
    serverStarted,
    warning,
  };
}

function safeWorldFileName(input: string): string {
  const base = input.replace(/\\/g, "/").split("/").pop()?.trim() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").replace(/[<>:"|?*]/g, "-");
  if (!cleaned.toLowerCase().endsWith(".vcdbs")) {
    throw new WorldDeploymentError("Choose a Vintage Story world save ending in .vcdbs.");
  }
  const stem = path.basename(cleaned, path.extname(cleaned)).trim().replace(/[. ]+$/g, "");
  if (!stem) throw new WorldDeploymentError("The world save needs a valid file name.");
  return `${stem.slice(0, 120)}.vcdbs`;
}

async function uniqueLiveFileName(savesDir: string, requested: string): Promise<string> {
  const stem = path.basename(requested, path.extname(requested));
  let candidate = requested;
  let suffix = 1;
  while (await exists(path.join(savesDir, candidate))) {
    candidate = `${stem}-import-${timestamp()}${suffix > 1 ? `-${suffix}` : ""}.vcdbs`;
    suffix += 1;
  }
  return candidate;
}

async function writeJsonAtomic(file: string, value: unknown) {
  await writeTextAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeTextAtomic(file: string, value: string) {
  const temporary = `${file}.${nanoid(8)}.tmp`;
  try {
    await fs.writeFile(temporary, value, "utf8");
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

async function exists(file: string) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function maxUploadBytes() {
  const configured = Number(process.env.WORLD_UPLOAD_MAX_BYTES);
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_UPLOAD_BYTES;
}

function formatGiB(bytes: number) {
  return Math.round((bytes / 1024 ** 3) * 10) / 10;
}

function timestamp() {
  return new Date().toISOString().replace(/[-:.]/g, "");
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new WorldDeploymentError("The server configuration is not a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function parseObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function saveFileNameFromLocation(location: string) {
  return location.startsWith("/data/Saves/") ? path.basename(location) : undefined;
}

function isActive(status: ServerStatus) {
  return status === "running" || status === "starting" || status === "restarting";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
