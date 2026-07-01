import type { Instance } from "@/lib/types";
import { updateInstance, deleteInstance } from "@/lib/server/store";
import { supervisor } from "@/lib/server/supervisor";
import {
  json,
  ok,
  notFound,
  serverError,
  loadInstance,
  toInstanceWithState,
} from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const res = await loadInstance(id);
    if ("response" in res) return res.response;
    return json(await toInstanceWithState(res.instance));
  } catch (e) {
    return serverError(e);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
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
    const { id } = await params;
    supervisor.forget(id);
    const removed = await deleteInstance(id);
    if (!removed) return notFound(`Server '${id}' not found`);
    return ok();
  } catch (e) {
    return serverError(e);
  }
}
