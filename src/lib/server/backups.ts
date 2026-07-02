import fs from "node:fs/promises";
import { constants, createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import type {
  Backup,
  BackupKind,
  BackupPolicyStatus,
  Instance,
} from "@/lib/types";
import { vsPaths } from "./config";
import { consoleBus } from "./console-bus";

const ROLLING_INTERVAL_MS = 60 * 60 * 1000;
const ROLLING_KEEP_RESTORE_POINTS = 24;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_ROTATION_SLOTS = 2;
const SNAPSHOT_ENTRIES = [
  "Saves",
  "ModConfig",
  "Mods",
  "Managed-Mods",
  "serverconfig.json",
] as const;

interface SnapshotFile {
  path: string;
  hash: string;
  size: number;
  mtimeMs: number;
}

interface SnapshotManifest {
  id: string;
  createdAt: number;
  files: SnapshotFile[];
}

interface SnapshotResult {
  logicalBytes: number;
  storedBytes: number;
  fileCount: number;
}

const scheduledLocks = new Map<string, Promise<void>>();

function indexPath(serverId: string): string {
  return path.join(vsPaths(serverId).backups, "index.json");
}

function snapshotRoot(serverId: string): string {
  return vsPaths(serverId).backupSaves;
}

function manifestsDir(serverId: string): string {
  return path.join(snapshotRoot(serverId), "manifests");
}

function blobsDir(serverId: string): string {
  return path.join(snapshotRoot(serverId), "blobs");
}

function manifestPath(serverId: string, backupId: string): string {
  return path.join(manifestsDir(serverId), `${backupId}.json`);
}

async function readIndex(serverId: string): Promise<Backup[]> {
  const file = indexPath(serverId);
  if (!existsSync(file)) return [];
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as Backup[];
  } catch {
    return [];
  }
}

async function writeIndex(serverId: string, backups: Backup[]) {
  const file = indexPath(serverId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(backups, null, 2), "utf8");
}

export async function listBackups(serverId: string): Promise<Backup[]> {
  const backups = await readIndex(serverId);
  return backups.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getBackupPolicyStatus(
  serverId: string,
  enabled: boolean,
): Promise<BackupPolicyStatus> {
  const backups = await readIndex(serverId);
  const restorePoints = backups
    .filter((b) => b.kind === "restore-point")
    .sort((a, b) => b.createdAt - a.createdAt);
  const latest = restorePoints[0];

  return {
    enabled,
    intervalMinutes: Math.round(ROLLING_INTERVAL_MS / 60000),
    keepRestorePoints: ROLLING_KEEP_RESTORE_POINTS,
    restorePoints: restorePoints.length,
    protectedBackups: backups.filter((b) => b.kind !== "restore-point").length,
    logicalBytes: backups.reduce((sum, b) => sum + b.sizeBytes, 0),
    storedBytes: await dirSize(snapshotRoot(serverId)),
    lastRestorePointAt: latest?.createdAt,
    nextRestorePointAt: enabled
      ? (latest?.createdAt ?? Date.now()) + ROLLING_INTERVAL_MS
      : undefined,
  };
}

export async function maybeCreateScheduledBackup(inst: Instance): Promise<void> {
  if (!inst.autoBackup) return;
  const existing = scheduledLocks.get(inst.id);
  if (existing) return existing;

  const task = (async () => {
    await maybeCreateRestorePoint(inst);
    await maybeCreateDailyBackup(inst);
  })().finally(() => {
    scheduledLocks.delete(inst.id);
  });

  scheduledLocks.set(inst.id, task);
  return task;
}

async function maybeCreateRestorePoint(inst: Instance): Promise<void> {
  const backups = await readIndex(inst.id);
  const latest = backups
      .filter((b) => b.kind === "restore-point")
      .sort((a, b) => b.createdAt - a.createdAt)[0];
  if (latest && Date.now() - latest.createdAt < ROLLING_INTERVAL_MS) return;

  await createBackup(inst.id, {
    worldName: inst.worldName,
    kind: "restore-point",
    note: "Hourly rolling restore point",
  });
}

async function maybeCreateDailyBackup(inst: Instance): Promise<void> {
  const backups = await readIndex(inst.id);
  const today = dayKey(Date.now());
  const hasToday = backups.some(
    (backup) => isRotatingDailyBackup(backup) && dayKey(backup.createdAt) === today,
  );
  if (hasToday) return;

  await createRotatingDailyBackup(inst);
}

async function createRotatingDailyBackup(inst: Instance): Promise<Backup> {
  const now = Date.now();
  const slot = dailySlot(now);
  const id = `bk-daily-${slot + 1}`;
  const backups = await readIndex(inst.id);
  const next = backups.filter((backup) => backup.id !== id);

  await fs.rm(manifestPath(inst.id, id), { force: true });
  const snapshot = await createSnapshot(inst.id, id, now);
  const backup: Backup = {
    id,
    name: `daily-${dayKey(now)}`,
    kind: "auto",
    sizeBytes: snapshot.logicalBytes,
    storedBytes: snapshot.storedBytes,
    fileCount: snapshot.fileCount,
    createdAt: now,
    expiresAt: now + DAILY_ROTATION_SLOTS * DAY_MS,
    worldName: inst.worldName,
    note: `Daily rotation slot ${slot + 1} of ${DAILY_ROTATION_SLOTS}`,
  };

  next.push(backup);
  await writeIndex(inst.id, next);
  await garbageCollectBlobs(inst.id, next);
  consoleBus.push(inst.id, `Daily backup '${backup.name}' saved to slot ${slot + 1}.`, "system");
  return backup;
}

export async function createBackup(
  serverId: string,
  opts: { worldName?: string; kind?: BackupKind; note?: string } = {},
): Promise<Backup> {
  const backups = await readIndex(serverId);
  const now = Date.now();
  const kind = opts.kind ?? "manual";
  const id = `bk-${nanoid(8)}`;
  const snapshot = await createSnapshot(serverId, id, now);
  const backup: Backup = {
    id,
    name: `${kind}-${new Date(now).toISOString().slice(0, 19).replace(/[:T]/g, "-")}`,
    kind,
    sizeBytes: snapshot.logicalBytes,
    storedBytes: snapshot.storedBytes,
    fileCount: snapshot.fileCount,
    createdAt: now,
    expiresAt: kind === "restore-point"
      ? now + ROLLING_INTERVAL_MS * ROLLING_KEEP_RESTORE_POINTS
      : undefined,
    worldName: opts.worldName,
    note: opts.note ?? defaultNote(kind),
  };
  backups.push(backup);
  await writeIndex(serverId, backups);
  if (kind === "restore-point") await pruneRestorePoints(serverId);
  consoleBus.push(serverId, `Backup '${backup.name}' created.`, "system");
  return backup;
}

export async function deleteBackup(
  serverId: string,
  id: string,
): Promise<boolean> {
  const backups = await readIndex(serverId);
  const next = backups.filter((b) => b.id !== id);
  if (next.length === backups.length) return false;

  await fs.rm(manifestPath(serverId, id), { force: true });
  await writeIndex(serverId, next);
  await garbageCollectBlobs(serverId, next);
  consoleBus.push(serverId, `Backup '${id}' deleted.`, "system");
  return true;
}

export async function restoreBackup(
  serverId: string,
  id: string,
): Promise<boolean> {
  const backups = await readIndex(serverId);
  const backup = backups.find((b) => b.id === id);
  if (!backup) return false;

  const manifest = await readManifest(serverId, id);
  if (manifest) {
    await restoreSnapshot(serverId, manifest);
  }

  consoleBus.push(
    serverId,
    manifest
      ? `Restored backup '${backup.name}'. Restart the server before players rejoin.`
      : `Restore requested for legacy backup '${backup.name}', but no snapshot manifest exists.`,
    "system",
    manifest ? "notification" : "warning",
  );
  return true;
}

async function createSnapshot(
  serverId: string,
  backupId: string,
  createdAt: number,
): Promise<SnapshotResult> {
  await fs.mkdir(manifestsDir(serverId), { recursive: true });
  await fs.mkdir(blobsDir(serverId), { recursive: true });

  const files = await collectSnapshotFiles(serverId);
  const manifestFiles: SnapshotFile[] = [];
  let logicalBytes = 0;
  let storedBytes = 0;

  for (const file of files) {
    const stat = await fs.stat(file.source);
    const hash = await hashFile(file.source);
    const blob = path.join(blobsDir(serverId), hash);
    logicalBytes += stat.size;

    try {
      await fs.copyFile(file.source, blob, constants.COPYFILE_EXCL);
      storedBytes += stat.size;
    } catch (e) {
      if (!isNodeError(e) || e.code !== "EEXIST") throw e;
    }

    manifestFiles.push({
      path: file.relative,
      hash,
      size: stat.size,
      mtimeMs: Math.round(stat.mtimeMs),
    });
  }

  const manifest: SnapshotManifest = {
    id: backupId,
    createdAt,
    files: manifestFiles,
  };
  await fs.writeFile(
    manifestPath(serverId, backupId),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  return {
    logicalBytes,
    storedBytes,
    fileCount: manifestFiles.length,
  };
}

async function collectSnapshotFiles(
  serverId: string,
): Promise<Array<{ source: string; relative: string }>> {
  const dataRoot = vsPaths(serverId).data;
  const files: Array<{ source: string; relative: string }> = [];

  for (const entry of SNAPSHOT_ENTRIES) {
    const source = path.join(dataRoot, entry);
    if (!existsSync(source)) continue;
    const stat = await fs.stat(source);
    if (stat.isDirectory()) {
      await walkSnapshotDir(source, entry, files);
    } else if (stat.isFile()) {
      files.push({ source, relative: entry });
    }
  }

  return files;
}

async function walkSnapshotDir(
  dir: string,
  relativeDir: string,
  out: Array<{ source: string; relative: string }>,
) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const source = path.join(dir, entry.name);
    const relative = path.posix.join(toBackupPath(relativeDir), entry.name);
    if (entry.isDirectory()) {
      await walkSnapshotDir(source, relative, out);
    } else if (entry.isFile()) {
      out.push({ source, relative });
    }
  }
}

async function restoreSnapshot(serverId: string, manifest: SnapshotManifest) {
  const dataRoot = path.resolve(vsPaths(serverId).data);

  for (const entry of SNAPSHOT_ENTRIES) {
    await fs.rm(path.join(dataRoot, entry), { recursive: true, force: true });
  }

  for (const file of manifest.files) {
    const target = safeDataPath(dataRoot, file.path);
    const blob = path.join(blobsDir(serverId), file.hash);
    if (!existsSync(blob)) {
      throw new Error(`Backup blob missing for ${file.path}`);
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(blob, target);
    const mtime = new Date(file.mtimeMs);
    await fs.utimes(target, mtime, mtime).catch(() => {});
  }
}

async function readManifest(
  serverId: string,
  backupId: string,
): Promise<SnapshotManifest | null> {
  const file = manifestPath(serverId, backupId);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as SnapshotManifest;
  } catch {
    return null;
  }
}

async function pruneRestorePoints(serverId: string) {
  const backups = await readIndex(serverId);
  const restorePoints = backups
    .filter((b) => b.kind === "restore-point")
    .sort((a, b) => b.createdAt - a.createdAt);
  const keep = new Set(
    restorePoints.slice(0, ROLLING_KEEP_RESTORE_POINTS).map((b) => b.id),
  );
  const pruned = restorePoints.filter((b) => !keep.has(b.id));
  if (pruned.length === 0) return;

  const next = backups.filter((b) => b.kind !== "restore-point" || keep.has(b.id));
  await Promise.all(
    pruned.map((b) => fs.rm(manifestPath(serverId, b.id), { force: true })),
  );
  await writeIndex(serverId, next);
  await garbageCollectBlobs(serverId, next);
}

async function garbageCollectBlobs(serverId: string, backups: Backup[]) {
  const referenced = new Set<string>();
  for (const backup of backups) {
    const manifest = await readManifest(serverId, backup.id);
    for (const file of manifest?.files ?? []) referenced.add(file.hash);
  }

  const dir = blobsDir(serverId);
  const entries = await fs.readdir(dir).catch(() => []);
  await Promise.all(
    entries
      .filter((entry) => !referenced.has(entry))
      .map((entry) => fs.rm(path.join(dir, entry), { force: true })),
  );
}

async function hashFile(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function dirSize(dir: string): Promise<number> {
  const stat = await fs.stat(dir).catch(() => null);
  if (!stat) return 0;
  if (stat.isFile()) return stat.size;
  if (!stat.isDirectory()) return 0;

  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  let total = 0;
  for (const entry of entries) {
    total += await dirSize(path.join(dir, entry.name));
  }
  return total;
}

function safeDataPath(dataRoot: string, relative: string): string {
  const parts = toBackupPath(relative)
    .split("/")
    .filter((part) => part && part !== ".");
  if (parts.some((part) => part === "..")) {
    throw new Error(`Unsafe backup path: ${relative}`);
  }
  const target = path.resolve(dataRoot, ...parts);
  if (target !== dataRoot && !target.startsWith(`${dataRoot}${path.sep}`)) {
    throw new Error(`Unsafe backup path: ${relative}`);
  }
  return target;
}

function toBackupPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function defaultNote(kind: BackupKind): string | undefined {
  switch (kind) {
    case "restore-point":
      return "Hourly rolling restore point";
    case "pre-update":
      return "Before server update";
    default:
      return undefined;
  }
}

function isRotatingDailyBackup(backup: Backup): boolean {
  return backup.kind === "auto" && backup.id.startsWith("bk-daily-");
}

function dailySlot(ts: number): number {
  return dayNumber(ts) % DAILY_ROTATION_SLOTS;
}

function dayKey(ts: number): string {
  const date = new Date(ts);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dayNumber(ts: number): number {
  const date = new Date(ts);
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS,
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
