import { metrics } from "@/lib/server/metrics";
import { sseResponse } from "@/lib/server/sse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return sseResponse((emit) => {
    let closed = false;
    const tick = async () => {
      if (closed) return;
      try {
        emit("metrics", await metrics.collectHost());
      } catch {
        /* ignore transient collection errors */
      }
    };
    void tick();
    const interval = setInterval(tick, 2000);
    return () => {
      closed = true;
      clearInterval(interval);
    };
  });
}
