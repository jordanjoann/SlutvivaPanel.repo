import { describe, expect, it } from "vitest";
import type { Backup } from "@/lib/types";
import {
  DAILY_KEEP,
  MANUAL_TTL_MS,
  ROLLING_TTL_MS,
  SYSTEM_DAILY_KEEP,
  expiresAtForKind,
  selectExpiredGameBackups,
  selectSystemObjectsToDelete,
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
      backup("pre-update-old", "pre-update", now - MANUAL_TTL_MS - 1),
    ];
    expect(selectExpiredGameBackups(backups, now).map((b) => b.id).sort()).toEqual([
      "daily-1",
      "manual-old",
      "pre-update-old",
      "rolling-old",
    ]);
    expect(DAILY_KEEP).toBe(2);
    expect(SYSTEM_DAILY_KEEP).toBe(3);
  });

  it("expires duplicate same-day daily backups without consuming all keep slots", () => {
    const sameDayCreatedAt = now - 60_000;
    const backups = [
      backup("same-day-b", "auto", sameDayCreatedAt),
      backup("same-day-a", "auto", sameDayCreatedAt),
      backup("yesterday-new", "auto", now - 24 * 60 * 60_000),
      backup("two-days-old", "auto", now - 2 * 24 * 60 * 60_000),
    ];

    expect(selectExpiredGameBackups(backups, now).map((b) => b.id).sort()).toEqual([
      "same-day-b",
      "two-days-old",
    ]);
  });

  it("expires time-based backups at the exact TTL boundary", () => {
    const backups = [
      backup("rolling-boundary", "restore-point", now - ROLLING_TTL_MS),
      backup("manual-boundary", "manual", now - MANUAL_TTL_MS),
      backup("pre-update-boundary", "pre-update", now - MANUAL_TTL_MS),
    ];

    expect(selectExpiredGameBackups(backups, now).map((b) => b.id).sort()).toEqual([
      "manual-boundary",
      "pre-update-boundary",
      "rolling-boundary",
    ]);
  });

  it("selects older system objects beyond the daily retention count", () => {
    const objects = [
      { key: "oldest", createdAt: now - 4 },
      { key: "newest", createdAt: now },
      { key: "third-newest", createdAt: now - 2 },
      { key: "fourth-newest", createdAt: now - 3 },
      { key: "second-newest", createdAt: now - 1 },
    ];

    expect(selectSystemObjectsToDelete(objects).map((object) => object.key)).toEqual(["fourth-newest", "oldest"]);
  });

  it("breaks system object timestamp ties by key", () => {
    const objects = [
      { key: "b-new", createdAt: now },
      { key: "d-old-tie", createdAt: now - 1 },
      { key: "c-old-tie", createdAt: now - 1 },
      { key: "a-new", createdAt: now },
    ];

    expect(selectSystemObjectsToDelete(objects).map((object) => object.key)).toEqual(["d-old-tie"]);
  });

  it("returns expiration timestamps for backup kinds with time-based retention", () => {
    expect(expiresAtForKind("restore-point", now)).toBe(now + ROLLING_TTL_MS);
    expect(expiresAtForKind("manual", now)).toBe(now + MANUAL_TTL_MS);
    expect(expiresAtForKind("pre-update", now)).toBe(now + MANUAL_TTL_MS);
    expect(expiresAtForKind("auto", now)).toBeUndefined();
  });
});
