import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import type { Backup, BackupKind } from "@/lib/types";
import { vsPaths } from "./config";
import { consoleBus } from "./console-bus";

function indexPath(serverId: string): string {
  return path.join(vsPaths(serverId).backups, "index.json");
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

export async function createBackup(
  serverId: string,
  opts: { worldName?: string; kind?: BackupKind; note?: string } = {},
): Promise<Backup> {
  const backups = await readIndex(serverId);
  const backup: Backup = {
    id: `bk-${nanoid(8)}`,
    name: `${opts.kind ?? "manual"}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`,
    kind: opts.kind ?? "manual",
    sizeBytes: Math.round((180 + Math.random() * 90) * 1024 * 1024),
    createdAt: Date.now(),
    worldName: opts.worldName,
    note: opts.note,
  };
  backups.push(backup);
  await writeIndex(serverId, backups);
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
  await writeIndex(serverId, next);
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
  consoleBus.push(
    serverId,
    `Restoring backup '${backup.name}' — world will be replaced on next start.`,
    "system",
    "warning",
  );
  return true;
}
