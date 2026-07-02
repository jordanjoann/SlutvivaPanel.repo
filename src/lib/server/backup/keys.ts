import type { BackupKind, GameId } from "@/lib/types";

const KIND_PREFIX: Record<BackupKind, string> = {
  manual: "manual",
  auto: "daily",
  "pre-update": "pre-update",
  "restore-point": "rolling",
};

export function gameBackupObjectKey(input: {
  game: GameId;
  instanceId: string;
  kind: BackupKind;
  backupId: string;
  createdAt: number;
}): string {
  const instant = keyInstant(input.createdAt);
  const date = instant.slice(0, 10);
  const stamp = input.kind === "auto" ? date : instant;
  return [
    safeSegment(input.game),
    safeSegment(input.instanceId),
    KIND_PREFIX[input.kind],
    `${stamp}-${safeSegment(input.backupId)}.tar.zst`,
  ].join("/");
}

export function systemBackupObjectKey(createdAt: number): string {
  const instant = keyInstant(createdAt);
  return `daily/${instant.slice(0, 10)}/system-${instant}.tar.zst.age`;
}

function keyInstant(value: number): string {
  return new Date(value).toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-");
}

function safeSegment(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "item"
  );
}
