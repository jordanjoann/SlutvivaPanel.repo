import { supervisor } from "@/lib/server/supervisor";
import { ok, badRequest, serverError, loadInstance } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { command } = (await req.json()) as { command?: string };
    if (!command || !command.trim()) return badRequest("command is required");
    const res = await loadInstance(id);
    if ("response" in res) return res.response;
    await supervisor.command(res.instance, command.trim());
    return ok();
  } catch (e) {
    return serverError(e);
  }
}
