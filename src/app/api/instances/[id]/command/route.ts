import { supervisor } from "@/lib/server/supervisor";
import { ok, badRequest, serverError } from "@/lib/server/http";
import { requireInstanceGameAccess } from "@/lib/server/instance-access";
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
    const access = await requireInstanceGameAccess(id);
    if ("response" in access) return access.response;
    await supervisor.command(access.instance, normalized);
    return ok();
  } catch (e) {
    return serverError(e);
  }
}
