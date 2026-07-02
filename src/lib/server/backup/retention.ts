import type { Backup } from "@/lib/types";

export const ROLLING_INTERVAL_MS = 60 * 60 * 1000;
export const ROLLING_TTL_MS = 24 * ROLLING_INTERVAL_MS;
export const DAILY_KEEP = 2;
export const MANUAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SYSTEM_DAILY_KEEP = 3;

export function shouldCreateRestorePoint(backups: Backup[], now = Date.now()): boolean {
  const latest = backups
    .filter((backup) => backup.kind === "restore-point")
    .sort(compareBackupsByCreatedAtDescIdAsc)[0];
  return !latest || now - latest.createdAt >= ROLLING_INTERVAL_MS;
}

export function shouldCreateDailyBackup(backups: Backup[], now = Date.now()): boolean {
  const today = dayKey(now);
  return !backups.some((backup) => backup.kind === "auto" && dayKey(backup.createdAt) === today);
}

export function selectExpiredGameBackups(backups: Backup[], now = Date.now()): Backup[] {
  const expired = new Set<string>();
  for (const backup of backups) {
    const expiresAt = expiresAtForKind(backup.kind, backup.createdAt);
    if (expiresAt !== undefined && expiresAt <= now) expired.add(backup.id);
  }

  const dailyByDay = new Map<string, Backup[]>();
  for (const backup of backups) {
    if (backup.kind !== "auto") continue;
    const key = dayKey(backup.createdAt);
    dailyByDay.set(key, [...(dailyByDay.get(key) ?? []), backup]);
  }

  const dailyRepresentatives: Backup[] = [];
  for (const dailyBackups of dailyByDay.values()) {
    const [representative, ...sameDayExtras] = [...dailyBackups].sort(compareBackupsByCreatedAtDescIdAsc);
    if (representative) dailyRepresentatives.push(representative);
    for (const backup of sameDayExtras) expired.add(backup.id);
  }

  dailyRepresentatives.sort(compareBackupsByCreatedAtDescIdAsc);
  for (const backup of dailyRepresentatives.slice(DAILY_KEEP)) expired.add(backup.id);

  return backups.filter((backup) => expired.has(backup.id));
}

export function selectSystemObjectsToDelete<T extends { key: string; createdAt: number }>(objects: T[]): T[] {
  return [...objects].sort(compareObjectsByCreatedAtDescKeyAsc).slice(SYSTEM_DAILY_KEEP);
}

export function expiresAtForKind(kind: Backup["kind"], createdAt: number): number | undefined {
  if (kind === "restore-point") return createdAt + ROLLING_TTL_MS;
  if (kind === "manual" || kind === "pre-update") return createdAt + MANUAL_TTL_MS;
  return undefined;
}

function dayKey(value: number): string {
  return new Date(value).toISOString().slice(0, 10);
}

function compareBackupsByCreatedAtDescIdAsc(a: Backup, b: Backup): number {
  const byCreatedAt = b.createdAt - a.createdAt;
  if (byCreatedAt !== 0) return byCreatedAt;
  return compareStrings(a.id, b.id);
}

function compareObjectsByCreatedAtDescKeyAsc<T extends { key: string; createdAt: number }>(a: T, b: T): number {
  const byCreatedAt = b.createdAt - a.createdAt;
  if (byCreatedAt !== 0) return byCreatedAt;
  return compareStrings(a.key, b.key);
}

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
