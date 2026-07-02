import { listVersions, packageUrl } from "@/lib/server/versions";
import { updateInstance } from "@/lib/server/store";
import { supervisor } from "@/lib/server/supervisor";
import { consoleBus } from "@/lib/server/console-bus";
import { createBackup } from "@/lib/server/backups";
import { json, badRequest, serverError, loadInstance } from "@/lib/server/http";
import { ensureServerInstalled } from "@/lib/server/provisioning";
import { publishDiscordNotification } from "@/lib/server/discord";

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
    await notifyDiscord(
      inst,
      "status",
      `update to ${version} started.`,
    );
    const backup = await createBackup(id, {
      worldName: inst.worldName,
      kind: "pre-update",
      note: `Before update to ${version}`,
    });
    await notifyDiscord(
      inst,
      "admin",
      `backup '${backup.name}' completed before update to ${version}.`,
    );
    log(`[Update] Backup created. Stopping server...`);
    await supervisor.power(inst, "stop");
    log(`[Update] Downloading ${packageUrl(version)} ...`);
    await ensureServerInstalled(
      { ...inst, version },
      {
        force: true,
        onLog: (message) => log(message),
      },
    );
    log(`[Update] Replaced installation files (data path preserved).`);
    const updated = await updateInstance(id, { version });
    if (!updated) throw new Error(`Server '${id}' disappeared during update`);
    supervisor.forget(id);
    log(`[Update] Update complete. Restarting server...`);
    await supervisor.power(updated, "start");
    await notifyDiscord(
      updated,
      "status",
      `updated to ${version} and restarted.`,
    );
    return json({ ok: true, version, instance: updated });
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
    console.warn("Discord version notification failed", error);
  }
}
