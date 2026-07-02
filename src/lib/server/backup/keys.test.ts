import { describe, expect, it } from "vitest";
import { gameBackupObjectKey, systemBackupObjectKey } from "./keys";

describe("backup object keys", () => {
  it("builds organized game backup keys", () => {
    expect(
      gameBackupObjectKey({
        game: "vintage-story",
        instanceId: "testing-2-0-uank",
        kind: "restore-point",
        backupId: "bk_abcd1234",
        createdAt: Date.UTC(2026, 6, 2, 20, 0, 0),
      }),
    ).toBe("vintage-story/testing-2-0-uank/rolling/2026-07-02T20-00-00Z-bk_abcd1234.tar.zst");
  });

  it("builds daily system backup keys", () => {
    expect(systemBackupObjectKey(Date.UTC(2026, 6, 2, 20, 0, 0))).toBe(
      "daily/2026-07-02/system-2026-07-02T20-00-00Z.tar.zst.age",
    );
  });
});
