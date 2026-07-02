import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import type { Backup, BackupKind, BackupPolicyStatus, GameId, Instance } from "@/lib/types";
import { consoleBus } from "../console-bus";
import { vsPaths } from "../config";
import { createGameBackupArchive, extractGameBackupArchive, type ArchiveResult } from "./archive";
import { readBackupConfig, requireGameStorageConfig } from "./config";
import { BackupDb } from "./db";
import { gameBackupObjectKey } from "./keys";
import {
  DAILY_KEEP,
  ROLLING_INTERVAL_MS,
  ROLLING_TTL_MS,
  expiresAtForKind,
  selectExpiredGameBackups,
  shouldCreateDailyBackup,
  shouldCreateRestorePoint,
} from "./retention";
import { BackupObjectStorage } from "./storage";

interface BackupServiceDeps {
  dbPath?: string;
  stagingDir?: string;
  gameStorage?: BackupObjectStorage;
  gameBucket?: string;
}

export class BackupService {
  private db: BackupDb;
  private stagingDir: string;
  private gameStorage: BackupObjectStorage;
  private gameBucket: string;

  constructor(deps: BackupServiceDeps = {}) {
    const config = readBackupConfig();
    const storageConfig = deps.gameStorage ? undefined : requireGameStorageConfig(config);
    this.db = new BackupDb(deps.dbPath ?? config.panelDbPath);
    this.stagingDir = deps.stagingDir ?? config.stagingDir;
    this.gameStorage = deps.gameStorage ?? new BackupObjectStorage(storageConfig!);
    this.gameBucket = deps.gameBucket ?? storageConfig!.bucket;
  }

  listBackups(serverId: string): Backup[] {
    return this.db.listBackups(serverId);
  }

  getPolicyStatus(serverId: string, enabled: boolean): BackupPolicyStatus {
    const backups = this.listBackups(serverId);
    const restorePoints = backups.filter((backup) => backup.kind === "restore-point");
    const latest = restorePoints.sort((a, b) => b.createdAt - a.createdAt)[0];
    return {
      enabled,
      intervalMinutes: Math.round(ROLLING_INTERVAL_MS / 60000),
      keepRestorePoints: Math.round(ROLLING_TTL_MS / ROLLING_INTERVAL_MS),
      restorePoints: restorePoints.length,
      protectedBackups: backups.filter((backup) => backup.kind !== "restore-point").length,
      logicalBytes: backups.reduce((sum, backup) => sum + backup.sizeBytes, 0),
      storedBytes: backups.reduce((sum, backup) => sum + (backup.storedBytes ?? backup.sizeBytes), 0),
      lastRestorePointAt: latest?.createdAt,
      nextRestorePointAt: enabled ? (latest?.createdAt ?? Date.now()) + ROLLING_INTERVAL_MS : undefined,
    };
  }

  async createGameBackup(input: {
    serverId: string;
    game: GameId;
    dataRoot: string;
    worldName?: string;
    kind?: BackupKind;
    note?: string;
  }): Promise<Backup> {
    const now = Date.now();
    const kind = input.kind ?? "manual";
    const id = kind === "auto" ? `bk-daily-${nanoid(8)}` : `bk-${nanoid(8)}`;
    const name = `${kind}-${new Date(now).toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
    const archivePath = path.join(this.stagingDir, input.serverId, `${id}.tar.zst`);
    const objectKey = gameBackupObjectKey({
      game: input.game,
      instanceId: input.serverId,
      kind,
      backupId: id,
      createdAt: now,
    });

    let archive: ArchiveResult | undefined;
    try {
      archive = await createGameBackupArchive({ dataRoot: input.dataRoot, archivePath });
      await this.gameStorage.uploadFile(objectKey, archivePath, "application/zstd");
      this.db.recordUploaded({
        id,
        serverId: input.serverId,
        name,
        kind,
        bucket: this.gameBucket,
        objectKey,
        sizeBytes: archive.sizeBytes,
        storedBytes: archive.sizeBytes,
        fileCount: archive.fileCount,
        checksumSha256: archive.checksumSha256,
        createdAt: now,
        expiresAt: expiresAtForKind(kind, now),
        worldName: input.worldName,
        note: input.note ?? defaultNote(kind),
      });
      await fs.rm(archivePath, { force: true });
      await pruneEmptyStagingDirs(this.stagingDir, input.serverId);
      await this.applyGameRetention(input.serverId);
      consoleBus.push(input.serverId, `Backup '${name}' uploaded to Backblaze.`, "system");
      return this.db.listBackups(input.serverId).find((backup) => backup.id === id)!;
    } catch (error) {
      if (archive) {
        this.db.markFailed(
          {
            id,
            serverId: input.serverId,
            name,
            kind,
            bucket: this.gameBucket,
            objectKey,
            sizeBytes: archive.sizeBytes,
            storedBytes: archive.sizeBytes,
            fileCount: archive.fileCount,
            checksumSha256: archive.checksumSha256,
            createdAt: now,
            expiresAt: expiresAtForKind(kind, now),
            worldName: input.worldName,
            note: input.note ?? defaultNote(kind),
          },
          error instanceof Error ? error.message : String(error),
        );
      }
      throw error;
    }
  }

  async deleteBackup(serverId: string, id: string): Promise<boolean> {
    const record = this.db.getRecord(serverId, id);
    if (!record) return false;
    await this.gameStorage.deleteObject(record.objectKey);
    return this.db.markDeleted(serverId, id);
  }

  async restoreBackup(serverId: string, id: string): Promise<boolean> {
    const record = this.db.getRecord(serverId, id);
    if (!record) return false;
    const archivePath = path.join(this.stagingDir, serverId, "restore", `${id}.tar.zst`);
    const restoreRoot = path.join(this.stagingDir, serverId, "restore", id);
    await fs.mkdir(path.dirname(archivePath), { recursive: true });
    await this.gameStorage.downloadFile(record.objectKey, archivePath);
    await extractGameBackupArchive({
      archivePath,
      targetRoot: restoreRoot,
      expectedSha256: record.checksumSha256,
    });
    await replaceProtectedEntries(vsPaths(serverId).data, restoreRoot);
    await fs.rm(path.join(this.stagingDir, serverId, "restore"), { recursive: true, force: true });
    consoleBus.push(serverId, `Restored backup '${record.name}'. Restart before players rejoin.`, "system", "notification");
    return true;
  }

  async maybeCreateScheduledBackup(inst: Instance, onCreated?: (backup: Backup) => Promise<void> | void): Promise<void> {
    const backups = this.listBackups(inst.id);
    if (!inst.autoBackup) return;
    if (shouldCreateRestorePoint(backups)) {
      const backup = await this.createGameBackup({
        serverId: inst.id,
        game: inst.game,
        dataRoot: vsPaths(inst.id).data,
        worldName: inst.worldName,
        kind: "restore-point",
        note: "Hourly rolling restore point",
      });
      await onCreated?.(backup);
    }
    if (shouldCreateDailyBackup(this.listBackups(inst.id))) {
      const backup = await this.createGameBackup({
        serverId: inst.id,
        game: inst.game,
        dataRoot: vsPaths(inst.id).data,
        worldName: inst.worldName,
        kind: "auto",
        note: `Daily backup, newest ${DAILY_KEEP} retained`,
      });
      await onCreated?.(backup);
    }
  }

  async applyGameRetention(serverId: string): Promise<void> {
    for (const backup of selectExpiredGameBackups(this.db.listBackups(serverId))) {
      await this.deleteBackup(serverId, backup.id);
    }
  }
}

async function replaceProtectedEntries(dataRoot: string, restoreRoot: string): Promise<void> {
  for (const entry of ["Saves", "ModConfig", "Mods", "Managed-Mods", "serverconfig.json"]) {
    await fs.rm(path.join(dataRoot, entry), { recursive: true, force: true });
    const restored = path.join(restoreRoot, entry);
    if (existsSync(restored)) {
      await fs.mkdir(path.dirname(path.join(dataRoot, entry)), { recursive: true });
      await fs.cp(restored, path.join(dataRoot, entry), { recursive: true });
    }
  }
}

async function pruneEmptyStagingDirs(root: string, serverId: string): Promise<void> {
  await fs.rmdir(path.join(root, serverId)).catch(() => {});
  await fs.mkdir(root, { recursive: true });
}

function defaultNote(kind: BackupKind): string | undefined {
  if (kind === "restore-point") return "Hourly rolling restore point";
  if (kind === "auto") return "Daily backup";
  if (kind === "pre-update") return "Before server update";
  return undefined;
}
