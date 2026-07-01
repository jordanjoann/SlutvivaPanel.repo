import * as backups from "@/lib/server/backups";
import { json, ok, badRequest, notFound, serverError, loadInstance } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    return json({ backups: await backups.listBackups(id) });
  } catch (e) {
    return serverError(e);
  }
}

/** { op: "create"|"delete"|"restore", backupId?, note? } */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      op?: string;
      backupId?: string;
      note?: string;
    };
    const res = await loadInstance(id);
    if ("response" in res) return res.response;

    switch (body.op) {
      case "create":
        return json(
          await backups.createBackup(id, {
            worldName: res.instance.worldName,
            note: body.note,
          }),
        );
      case "delete": {
        if (!body.backupId) return badRequest("backupId required");
        const removed = await backups.deleteBackup(id, body.backupId);
        return removed ? ok() : notFound("backup not found");
      }
      case "restore": {
        if (!body.backupId) return badRequest("backupId required");
        const done = await backups.restoreBackup(id, body.backupId);
        return done ? ok() : notFound("backup not found");
      }
      default:
        return badRequest("unknown op");
    }
  } catch (e) {
    return serverError(e);
  }
}
