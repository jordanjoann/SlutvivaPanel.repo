import * as backups from "@/lib/server/backups";
import { json, ok, badRequest, notFound, serverError, loadInstance } from "@/lib/server/http";
import { publishDiscordNotification } from "@/lib/server/discord";
import type { Backup, BackupKind, Instance } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const res = await loadInstance(id);
    if ("response" in res) return res.response;
    await backups.maybeCreateScheduledBackup(res.instance, (backup) =>
      notifyBackupCompleted(res.instance, backup),
    );
    return json({
      backups: await backups.listBackups(id),
      policy: await backups.getBackupPolicyStatus(id, res.instance.autoBackup),
    });
  } catch (e) {
    return serverError(e);
  }
}

/** { op: "create"|"delete"|"restore", backupId?, kind?, note? } */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      op?: string;
      backupId?: string;
      kind?: BackupKind;
      note?: string;
    };
    const res = await loadInstance(id);
    if ("response" in res) return res.response;

    switch (body.op) {
      case "create": {
        const backup = await backups.createBackup(id, {
          worldName: res.instance.worldName,
          kind: isBackupKind(body.kind) ? body.kind : "manual",
          note: body.note,
        });
        await notifyBackupCompleted(res.instance, backup);
        return json(backup);
      }
      case "delete": {
        if (!body.backupId) return badRequest("backupId required");
        const removed = await backups.deleteBackup(id, body.backupId);
        return removed ? ok() : notFound("backup not found");
      }
      case "restore": {
        if (!body.backupId) return badRequest("backupId required");
        const done = await backups.restoreBackup(id, body.backupId);
        if (done) {
          await notifyDiscord(
            res.instance,
            "admin",
            `restored backup '${body.backupId}'. Restart before players rejoin.`,
          );
        }
        return done ? ok() : notFound("backup not found");
      }
      default:
        return badRequest("unknown op");
    }
  } catch (e) {
    return serverError(e);
  }
}

async function notifyDiscord(
  instance: Parameters<typeof publishDiscordNotification>[0],
  kind: Parameters<typeof publishDiscordNotification>[1],
  message: string,
) {
  try {
    await publishDiscordNotification(instance, kind, message);
  } catch (error) {
    console.warn("Discord backup notification failed", error);
  }
}

async function notifyBackupCompleted(instance: Instance, backup: Backup) {
  if (backup.kind === "restore-point") return;
  await notifyDiscord(
    instance,
    "admin",
    `backup '${backup.name}' completed.`,
  );
}

function isBackupKind(value: unknown): value is BackupKind {
  return (
    value === "manual" ||
    value === "auto" ||
    value === "pre-update" ||
    value === "restore-point"
  );
}
