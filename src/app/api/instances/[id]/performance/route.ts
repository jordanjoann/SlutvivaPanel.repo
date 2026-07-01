import { metrics } from "@/lib/server/metrics";
import { supervisor } from "@/lib/server/supervisor";
import { json, serverError, loadInstance } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const res = await loadInstance(id);
    if ("response" in res) return res.response;
    // Ensure a fresh sample is recorded before returning history.
    const state = await supervisor.getState(res.instance);
    await metrics.collectHost();
    return json({
      state,
      history: metrics.getServerHistory(id),
    });
  } catch (e) {
    return serverError(e);
  }
}
