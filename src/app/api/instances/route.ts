import type { CreateInstanceInput, GameId } from "@/lib/types";
import { canAccessInstanceGame, canUseInstanceMethod } from "@/lib/access-policy";
import { getSessionAccount } from "@/lib/server/auth";
import { listInstances, createInstance } from "@/lib/server/store";
import {
  json,
  badRequest,
  forbidden,
  serverError,
  toInstanceWithState,
  unauthorized,
} from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await getSessionAccount();
    if (!session) return unauthorized();
    if (!canUseInstanceMethod(session.account.role, req.method)) return forbidden();

    const game = new URL(req.url).searchParams.get("game") as GameId | null;
    if (game && !canAccessInstanceGame(session.account.role, game)) return forbidden();

    const scopedGame = session.account.role === "owner" ? game : "vintage-story";
    const instances = await listInstances(scopedGame ?? undefined);
    const visibleInstances = instances.filter((instance) =>
      canAccessInstanceGame(session.account.role, instance.game),
    );
    const withState = await Promise.all(visibleInstances.map(toInstanceWithState));
    return json(withState);
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSessionAccount();
    if (!session) return unauthorized();
    if (!canUseInstanceMethod(session.account.role, req.method)) return forbidden();

    const body = (await req.json()) as { name?: string; [k: string]: unknown };
    if (!body.name || typeof body.name !== "string") {
      return badRequest("A server name is required");
    }
    const created = await createInstance(body as CreateInstanceInput);
    return json(await toInstanceWithState(created), { status: 201 });
  } catch (e) {
    return serverError(e);
  }
}
