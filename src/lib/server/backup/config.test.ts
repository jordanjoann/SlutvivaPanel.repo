import { describe, expect, it } from "vitest";
import { readBackupConfig } from "./config";

describe("readBackupConfig", () => {
  it("uses safe defaults for local paths", () => {
    const cfg = readBackupConfig({});
    expect(cfg.stagingDir).toBe("/opt/slutvival/backups/staging");
    expect(cfg.panelDbPath).toBe("/opt/slutvival/data/slutvival-panel.sqlite");
  });

  it("validates complete game storage credentials", () => {
    const cfg = readBackupConfig({
      B2_GAME_BACKUPS_BUCKET: " slutvival-game-backups ",
      B2_S3_ENDPOINT: " https://s3.us-west-004.backblazeb2.com ",
      B2_REGION: " us-west-004 ",
      B2_GAME_BACKUPS_KEY_ID: " key-id ",
      B2_GAME_BACKUPS_APPLICATION_KEY: " app-key ",
    });
    expect(cfg.gameStorage.bucket).toBe("slutvival-game-backups");
    expect(cfg.gameStorage.endpoint).toBe("https://s3.us-west-004.backblazeb2.com");
    expect(cfg.gameStorage.region).toBe("us-west-004");
    expect(cfg.gameStorage.keyId).toBe("key-id");
    expect(cfg.gameStorage.applicationKey).toBe("app-key");
  });

  it("throws a clear error when game storage is partially configured", () => {
    expect(() =>
      readBackupConfig({
        B2_GAME_BACKUPS_BUCKET: "slutvival-game-backups",
        B2_GAME_BACKUPS_KEY_ID: "key-id",
      }),
    ).toThrow(/B2 game backup configuration is incomplete/);
  });

  it("throws a clear error when game storage values are blank", () => {
    expect(() =>
      readBackupConfig({
        B2_GAME_BACKUPS_BUCKET: "   ",
        B2_S3_ENDPOINT: "https://s3.us-west-004.backblazeb2.com",
        B2_REGION: "us-west-004",
        B2_GAME_BACKUPS_KEY_ID: "key-id",
        B2_GAME_BACKUPS_APPLICATION_KEY: "app-key",
      }),
    ).toThrow(/B2 game backup configuration is incomplete/);
  });

  it("throws a clear error when all game storage scoped values are blank", () => {
    expect(() =>
      readBackupConfig({
        B2_GAME_BACKUPS_BUCKET: "   ",
        B2_S3_ENDPOINT: "https://s3.us-west-004.backblazeb2.com",
        B2_REGION: "us-west-004",
        B2_GAME_BACKUPS_KEY_ID: "   ",
        B2_GAME_BACKUPS_APPLICATION_KEY: "   ",
      }),
    ).toThrow(/B2 game backup configuration is incomplete/);
  });

  it("maps a blank system backup age recipient to undefined", () => {
    const cfg = readBackupConfig({
      SLUTVIVAL_SYSTEM_BACKUP_AGE_RECIPIENT: "   ",
    });
    expect(cfg.systemAgeRecipient).toBeUndefined();
  });
});
