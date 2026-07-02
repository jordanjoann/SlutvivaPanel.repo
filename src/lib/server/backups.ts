import type { Backup, BackupKind, BackupPolicyStatus, Instance } from "@/lib/types";
import { BackupService } from "./backup/service";
import { vsPaths } from "./config";
import { singleton } from "./singleton";

const scheduledLocks = new Map<string, Promise<void>>();

function service() {
  return singleton("backup-service", () => new BackupService());
}

export async function listBackups(serverId: string): Promise<Backup[]> {
  return service().listBackups(serverId);
}

export async function getBackupPolicyStatus(serverId: string, enabled: boolean): Promise<BackupPolicyStatus> {
  return service().getPolicyStatus(serverId, enabled);
}

export async function createBackup(
  serverId: string,
  opts: { worldName?: string; kind?: BackupKind; note?: string } = {},
): Promise<Backup> {
  return service().createGameBackup({
    serverId,
    game: "vintage-story",
    dataRoot: vsPaths(serverId).data,
    worldName: opts.worldName,
    kind: opts.kind,
    note: opts.note,
  });
}

export async function deleteBackup(serverId: string, id: string): Promise<boolean> {
  return service().deleteBackup(serverId, id);
}

export async function restoreBackup(serverId: string, id: string): Promise<boolean> {
  return service().restoreBackup(serverId, id);
}

export async function maybeCreateScheduledBackup(
  inst: Instance,
  onCreated?: (backup: Backup) => Promise<void> | void,
): Promise<void> {
  const existing = scheduledLocks.get(inst.id);
  if (existing) return existing;
  const task = service()
    .maybeCreateScheduledBackup(inst, onCreated)
    .finally(() => scheduledLocks.delete(inst.id));
  scheduledLocks.set(inst.id, task);
  return task;
}
