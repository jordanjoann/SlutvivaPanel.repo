import type { Instance } from "@/lib/types";
import { canAccessInstanceGame, canUseInstanceMethod } from "@/lib/access-policy";
import { getSessionAccount } from "@/lib/server/auth";
import { updateInstance, deleteInstance } from "@/lib/server/store";
import { supervisor } from "@/lib/server/supervisor";
import {
  forbidden,
  json,
  ok,
  notFound,
  serverError,
  loadInstance,
  toInstanceWithState,
  unauthorized,
} from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const session = await getSessionAccount();
    if (!session) return unauthorized();
    if (!canUseInstanceMethod(session.account.role, "GET")) return forbidden();

    const { id } = await params;
    const res = await loadInstance(id);
    if ("response" in res) return res.response;
    if (!canAccessInstanceGame(session.account.role, res.instance.game)) return forbidden();
    return json(await toInstanceWithState(res.instance));
  } catch (e) {
    return serverError(e);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const session = await getSessionAccount();
    if (!session) return unauthorized();
    if (!canUseInstanceMethod(session.account.role, req.method)) return forbidden();

    const { id } = await params;
    const patch = (await req.json()) as Partial<Instance>;
    const updated = await updateInstance(id, patch);
    if (!updated) return notFound(`Server '${id}' not found`);
    return json(await toInstanceWithState(updated));
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const session = await getSessionAccount();
    if (!session) return unauthorized();
    if (!canUseInstanceMethod(session.account.role, "DELETE")) return forbidden();

    const { id } = await params;
    supervisor.forget(id);
    const removed = await deleteInstance(id);
    if (!removed) return notFound(`Server '${id}' not found`);
    return ok();
  } catch (e) {
    return serverError(e);
  }
}
