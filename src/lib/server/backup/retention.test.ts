import { describe, expect, it } from "vitest";
import type { Backup } from "@/lib/types";
import {
  DAILY_KEEP,
  MANUAL_TTL_MS,
  ROLLING_TTL_MS,
  SYSTEM_DAILY_KEEP,
  selectExpiredGameBackups,
  shouldCreateDailyBackup,
  shouldCreateRestorePoint,
} from "./retention";

const now = Date.UTC(2026, 6, 2, 20, 0, 0);

function backup(id: string, kind: Backup["kind"], createdAt: number): Backup {
  return { id, name: id, kind, sizeBytes: 1, createdAt };
}

describe("retention", () => {
  it("creates hourly restore points only after the interval", () => {
    expect(shouldCreateRestorePoint([], now)).toBe(true);
    expect(shouldCreateRestorePoint([backup("recent", "restore-point", now - 30 * 60_000)], now)).toBe(false);
    expect(shouldCreateRestorePoint([backup("old", "restore-point", now - ROLLING_TTL_MS)], now)).toBe(true);
  });

  it("creates at most one daily backup per UTC day", () => {
    expect(shouldCreateDailyBackup([], now)).toBe(true);
    expect(shouldCreateDailyBackup([backup("today", "auto", now - 60_000)], now)).toBe(false);
    expect(shouldCreateDailyBackup([backup("yesterday", "auto", now - 24 * 60 * 60_000)], now)).toBe(true);
  });

  it("expires rolling, daily, manual, and pre-update backups according to policy", () => {
    const backups = [
      backup("rolling-old", "restore-point", now - ROLLING_TTL_MS - 1),
      backup("rolling-new", "restore-point", now - 60_000),
      backup("daily-1", "auto", now - 3 * 24 * 60 * 60_000),
      backup("daily-2", "auto", now - 2 * 24 * 60 * 60_000),
      backup("daily-3", "auto", now - 1 * 24 * 60 * 60_000),
      backup("manual-old", "manual", now - MANUAL_TTL_MS - 1),
      backup("pre-update-new", "pre-update", now - 60_000),
    ];
    expect(selectExpiredGameBackups(backups, now).map((b) => b.id).sort()).toEqual([
      "daily-1",
      "manual-old",
      "rolling-old",
    ]);
    expect(DAILY_KEEP).toBe(2);
    expect(SYSTEM_DAILY_KEEP).toBe(3);
  });
});
