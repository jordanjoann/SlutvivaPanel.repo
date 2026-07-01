import type { GameId } from "@/lib/types";
import { listInstances, createInstance } from "@/lib/server/store";
import { json, badRequest, serverError, toInstanceWithState } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const game = new URL(req.url).searchParams.get("game") as GameId | null;
    const instances = await listInstances(game ?? undefined);
    const withState = await Promise.all(instances.map(toInstanceWithState));
    return json(withState);
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { name?: string; [k: string]: unknown };
    if (!body.name || typeof body.name !== "string") {
      return badRequest("A server name is required");
    }
    const created = await createInstance(body as { name: string });
    return json(await toInstanceWithState(created), { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
