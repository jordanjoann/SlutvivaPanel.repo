import { supervisor } from "@/lib/server/supervisor";
import { ok, badRequest, serverError, loadInstance } from "@/lib/server/http";
import { normalizeConsoleCommand } from "@/lib/server/commands";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { command } = (await req.json()) as { command?: string };
    const normalized = normalizeConsoleCommand(command ?? "");
    if (!normalized) return badRequest("command is required");
    const res = await loadInstance(id);
    if ("response" in res) return res.response;
    await supervisor.command(res.instance, normalized);
    return ok();
  } catch (e) {
    return serverError(e);
  }
}
