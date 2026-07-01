import { consoleBus } from "@/lib/server/console-bus";
import { json, serverError } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const limit = Number(new URL(req.url).searchParams.get("limit") ?? 500);
    return json({ lines: consoleBus.snapshot(id, limit) });
  } catch (e) {
    return serverError(e);
  }
}
