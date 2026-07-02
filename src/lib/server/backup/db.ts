import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { Backup, BackupKind } from "@/lib/types";

export interface UploadedBackupRecord {
  id: string;
  serverId: string;
  name: string;
  kind: BackupKind;
  bucket: string;
  objectKey: string;
  sizeBytes: number;
  storedBytes?: number;
  fileCount?: number;
  checksumSha256: string;
  createdAt: number;
  expiresAt?: number;
  worldName?: string;
  note?: string;
}

type BackupRow = {
  id: string;
  server_id: string;
  name: string;
  kind: BackupKind;
  bucket: string;
  object_key: string;
  size_bytes: number;
  stored_bytes: number | null;
  file_count: number | null;
  checksum_sha256: string;
  created_at: number;
  expires_at: number | null;
  world_name: string | null;
  note: string | null;
  status: "uploaded" | "failed" | "deleted";
  deleted_at: number | null;
  last_error: string | null;
};

export class BackupDb {
  private db: Database.Database;

  constructor(file: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 5000");
    this.migrate();
  }

  recordUploaded(record: UploadedBackupRecord): void {
    this.db.prepare(`
      insert into backups (
        id, server_id, name, kind, bucket, object_key, size_bytes, stored_bytes,
        file_count, checksum_sha256, created_at, expires_at, world_name, note,
        status, deleted_at, last_error
      ) values (
        @id, @serverId, @name, @kind, @bucket, @objectKey, @sizeBytes, @storedBytes,
        @fileCount, @checksumSha256, @createdAt, @expiresAt, @worldName, @note,
        'uploaded', null, null
      )
      on conflict(id) do update set
        status = 'uploaded',
        deleted_at = null,
        last_error = null
    `).run({
      ...record,
      storedBytes: record.storedBytes ?? record.sizeBytes,
      fileCount: record.fileCount ?? null,
      expiresAt: record.expiresAt ?? null,
      worldName: record.worldName ?? null,
      note: record.note ?? null,
    });
  }

  listBackups(serverId: string): Backup[] {
    return this.db
      .prepare("select * from backups where server_id = ? and status = 'uploaded' order by created_at desc")
      .all(serverId)
      .map((row) => toBackup(row as BackupRow));
  }

  getRecord(serverId: string, id: string): UploadedBackupRecord | null {
    const row = this.db.prepare("select * from backups where server_id = ? and id = ? and status = 'uploaded'").get(serverId, id) as BackupRow | undefined;
    return row ? fromRow(row) : null;
  }

  markDeleted(serverId: string, id: string, deletedAt = Date.now()): boolean {
    const result = this.db.prepare("update backups set status = 'deleted', deleted_at = ? where server_id = ? and id = ? and status = 'uploaded'").run(deletedAt, serverId, id);
    return result.changes > 0;
  }

  markFailed(record: UploadedBackupRecord, error: string): void {
    this.db.prepare(`
      insert into backups (
        id, server_id, name, kind, bucket, object_key, size_bytes, stored_bytes,
        file_count, checksum_sha256, created_at, expires_at, world_name, note,
        status, deleted_at, last_error
      ) values (
        @id, @serverId, @name, @kind, @bucket, @objectKey, @sizeBytes, @storedBytes,
        @fileCount, @checksumSha256, @createdAt, @expiresAt, @worldName, @note,
        'failed', null, @error
      )
    `).run({
      ...record,
      storedBytes: record.storedBytes ?? record.sizeBytes,
      fileCount: record.fileCount ?? null,
      expiresAt: record.expiresAt ?? null,
      worldName: record.worldName ?? null,
      note: record.note ?? null,
      error,
    });
  }

  private migrate(): void {
    this.db.exec(`
      create table if not exists backups (
        id text primary key,
        server_id text not null,
        name text not null,
        kind text not null,
        bucket text not null,
        object_key text not null,
        size_bytes integer not null,
        stored_bytes integer,
        file_count integer,
        checksum_sha256 text not null,
        created_at integer not null,
        expires_at integer,
        world_name text,
        note text,
        status text not null,
        deleted_at integer,
        last_error text
      );
      create index if not exists idx_backups_server_status_created on backups(server_id, status, created_at);
      create table if not exists restore_events (
        id integer primary key autoincrement,
        backup_id text not null,
        server_id text not null,
        status text not null,
        created_at integer not null,
        message text
      );
    `);
  }
}

function toBackup(row: BackupRow): Backup {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    sizeBytes: row.size_bytes,
    storedBytes: row.stored_bytes ?? undefined,
    fileCount: row.file_count ?? undefined,
    createdAt: row.created_at,
    expiresAt: row.expires_at ?? undefined,
    worldName: row.world_name ?? undefined,
    note: row.note ?? undefined,
    storage: "backblaze",
    status: row.status,
    checksumSha256: row.checksum_sha256,
  };
}

function fromRow(row: BackupRow): UploadedBackupRecord {
  return {
    id: row.id,
    serverId: row.server_id,
    name: row.name,
    kind: row.kind,
    bucket: row.bucket,
    objectKey: row.object_key,
    sizeBytes: row.size_bytes,
    storedBytes: row.stored_bytes ?? undefined,
    fileCount: row.file_count ?? undefined,
    checksumSha256: row.checksum_sha256,
    createdAt: row.created_at,
    expiresAt: row.expires_at ?? undefined,
    worldName: row.world_name ?? undefined,
    note: row.note ?? undefined,
  };
}
