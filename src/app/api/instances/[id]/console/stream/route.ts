import { consoleBus } from "@/lib/server/console-bus";
import { sseResponse } from "@/lib/server/sse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return sseResponse((emit) => {
    // Replay recent buffer, then stream live lines.
    for (const line of consoleBus.snapshot(id, 400)) emit("line", line);
    return consoleBus.subscribe(id, (line) => emit("line", line));
  });
}
