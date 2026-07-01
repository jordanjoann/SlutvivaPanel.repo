import { supervisor } from "@/lib/server/supervisor";
import { json, ok, badRequest, serverError, loadInstance } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const res = await loadInstance(id);
    if ("response" in res) return res.response;
    return json({ players: await supervisor.players(res.instance) });
  } catch (e) {
    return serverError(e);
  }
}

const COMMANDS: Record<string, (name: string) => string> = {
  kick: (n) => `/kick ${n}`,
  ban: (n) => `/ban ${n}`,
  op: (n) => `/op ${n}`,
  deop: (n) => `/deop ${n}`,
};

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const { action, name } = (await req.json()) as {
      action?: string;
      name?: string;
    };
    if (!action || !COMMANDS[action] || !name) {
      return badRequest("action (kick|ban|op|deop) and name are required");
    }
    const res = await loadInstance(id);
    if ("response" in res) return res.response;
    await supervisor.command(res.instance, COMMANDS[action](name));
    return ok();
  } catch (e) {
    return serverError(e);
  }
}
