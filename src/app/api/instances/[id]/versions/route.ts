import { listVersions, packageUrl } from "@/lib/server/versions";
import { updateInstance } from "@/lib/server/store";
import { supervisor } from "@/lib/server/supervisor";
import { consoleBus } from "@/lib/server/console-bus";
import { createBackup } from "@/lib/server/backups";
import { json, badRequest, serverError, loadInstance } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const res = await loadInstance(id);
    if ("response" in res) return res.response;
    return json({
      current: res.instance.version,
      versions: await listVersions(),
    });
  } catch (e) {
    return serverError(e);
  }
}

/**
 * Update workflow. Backs up, stops, "downloads", replaces files, and restarts
 * — while never touching the data path. Progress is streamed to the console.
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { version } = (await req.json()) as { version?: string };
    if (!version) return badRequest("version required");
    const res = await loadInstance(id);
    if ("response" in res) return res.response;
    const inst = res.instance;

    const log = (t: string) => consoleBus.push(id, t, "system");
    log(`[Update] Starting update to Vintage Story ${version}.`);
    await createBackup(id, {
      worldName: inst.worldName,
      kind: "pre-update",
      note: `Before update to ${version}`,
    });
    log(`[Update] Backup created. Stopping server...`);
    await supervisor.power(inst, "stop");
    log(`[Update] Downloading ${packageUrl(version)} ...`);
    log(`[Update] Replacing installation files (data path preserved).`);
    const updated = await updateInstance(id, { version });
    log(`[Update] Update complete. Restarting server...`);
    await supervisor.power(inst, "start");
    return json({ ok: true, version, instance: updated });
  } catch (e) {
    return serverError(e);
  }
}
