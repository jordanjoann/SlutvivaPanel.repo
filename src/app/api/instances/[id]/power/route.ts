import type { Instance, PowerAction } from "@/lib/types";
import { supervisor } from "@/lib/server/supervisor";
import { json, badRequest, serverError, loadInstance } from "@/lib/server/http";
import { publishDiscordNotification } from "@/lib/server/discord";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACTIONS: PowerAction[] = ["start", "stop", "restart", "kill"];

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { action } = (await req.json()) as { action?: PowerAction };
    if (!action || !ACTIONS.includes(action)) {
      return badRequest(`action must be one of: ${ACTIONS.join(", ")}`);
    }
    const res = await loadInstance(id);
    if ("response" in res) return res.response;
    await supervisor.power(res.instance, action);
    const state = await supervisor.getState(res.instance);
    await notifyDiscord(res.instance, action);
    return json({ ok: true, state });
  } catch (e) {
    return serverError(e);
  }
}

async function notifyDiscord(instance: Instance, action: PowerAction) {
  const verb =
    action === "start"
      ? "started"
      : action === "stop"
        ? "has shut down"
        : action === "restart"
          ? "restarted"
          : "was killed";
  try {
    await publishDiscordNotification(
      instance,
      "status",
      `${verb}.`,
    );
  } catch (error) {
    console.warn("Discord status notification failed", error);
  }
}
