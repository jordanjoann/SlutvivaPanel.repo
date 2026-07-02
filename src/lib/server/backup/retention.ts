import type { Backup } from "@/lib/types";

export const ROLLING_INTERVAL_MS = 60 * 60 * 1000;
export const ROLLING_TTL_MS = 24 * ROLLING_INTERVAL_MS;
export const DAILY_KEEP = 2;
export const MANUAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SYSTEM_DAILY_KEEP = 3;

export function shouldCreateRestorePoint(backups: Backup[], now = Date.now()): boolean {
  const latest = backups
    .filter((backup) => backup.kind === "restore-point")
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  return !latest || now - latest.createdAt >= ROLLING_INTERVAL_MS;
}

export function shouldCreateDailyBackup(backups: Backup[], now = Date.now()): boolean {
  const today = dayKey(now);
  return !backups.some((backup) => backup.kind === "auto" && dayKey(backup.createdAt) === today);
}

export function selectExpiredGameBackups(backups: Backup[], now = Date.now()): Backup[] {
  const expired = new Set<string>();
  for (const backup of backups) {
    if (backup.kind === "restore-point" && now - backup.createdAt > ROLLING_TTL_MS) expired.add(backup.id);
    if ((backup.kind === "manual" || backup.kind === "pre-update") && now - backup.createdAt > MANUAL_TTL_MS) {
      expired.add(backup.id);
    }
  }

  const daily = backups
    .filter((backup) => backup.kind === "auto")
    .sort((a, b) => b.createdAt - a.createdAt);
  for (const backup of daily.slice(DAILY_KEEP)) expired.add(backup.id);

  return backups.filter((backup) => expired.has(backup.id));
}

export function selectSystemObjectsToDelete<T extends { key: string; createdAt: number }>(objects: T[]): T[] {
  return [...objects].sort((a, b) => b.createdAt - a.createdAt).slice(SYSTEM_DAILY_KEEP);
}

export function expiresAtForKind(kind: Backup["kind"], createdAt: number): number | undefined {
  if (kind === "restore-point") return createdAt + ROLLING_TTL_MS;
  if (kind === "manual" || kind === "pre-update") return createdAt + MANUAL_TTL_MS;
  return undefined;
}

function dayKey(value: number): string {
  return new Date(value).toISOString().slice(0, 10);
}
