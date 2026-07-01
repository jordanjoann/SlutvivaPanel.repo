import { metrics } from "@/lib/server/metrics";
import { json, serverError } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const host = await metrics.collectHost();
    return json({ host, history: metrics.getHostHistory() });
  } catch (e) {
    return serverError(e);
  }
}
