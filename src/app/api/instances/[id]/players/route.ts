import { supervisor } from "@/lib/server/supervisor";
import { json, ok, badRequest, serverError, loadInstance } from "@/lib/server/http";
import { getPlayerRoster, updateKnownPlayer } from "@/lib/server/player-roster";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const res = await loadInstance(id);
    if ("response" in res) return res.response;
    const online = await supervisor.players(res.instance);
    return json(await getPlayerRoster(res.instance, online));
  } catch (e) {
    return serverError(e);
  }
}

const COMMANDS: Record<string, (name: string, data: PlayerActionBody) => string | null> = {
  kick: (n) => `/kick ${n}`,
  ban: (n) => `/ban ${n}`,
  op: (n) => `/op ${n}`,
  deop: (n) => `/deop ${n}`,
  role: (n, data) => (data.role ? `/player ${n} role ${data.role}` : null),
  whitelist: (n, data) =>
    typeof data.whitelisted === "boolean"
      ? `/player ${n} whitelist ${data.whitelisted ? "on" : "off"}`
      : null,
};

type PlayerActionBody = {
  action?: string;
  name?: string;
  role?: string;
  whitelisted?: boolean;
};

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = (await req.json()) as PlayerActionBody;
    const { action, name } = body;
    if (!action || !COMMANDS[action] || !name) {
      return badRequest("action (kick|ban|op|deop|role|whitelist) and name are required");
    }
    const command = COMMANDS[action](name, body);
    if (!command) return badRequest(`missing data for ${action}`);
    const res = await loadInstance(id);
    if ("response" in res) return res.response;
    await supervisor.command(res.instance, command);
    if (action === "role" && body.role) {
      await updateKnownPlayer(id, name, { role: body.role });
    } else if (action === "whitelist" && typeof body.whitelisted === "boolean") {
      await updateKnownPlayer(id, name, { isWhitelisted: body.whitelisted });
    } else if (action === "op") {
      await updateKnownPlayer(id, name, { role: "admin" });
    } else if (action === "deop") {
      await updateKnownPlayer(id, name, { role: "member" });
    }
    return ok();
  } catch (e) {
    return serverError(e);
  }
}
