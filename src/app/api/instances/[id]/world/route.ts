import type { WorldInfo } from "@/lib/types";
import { getWorld, updateWorld } from "@/lib/server/world";
import { json, serverError, loadInstance } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const res = await loadInstance(id);
    if ("response" in res) return res.response;
    return json(await getWorld(res.instance));
  } catch (e) {
    return serverError(e);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const res = await loadInstance(id);
    if ("response" in res) return res.response;
    const patch = (await req.json()) as Partial<WorldInfo>;
    return json(await updateWorld(res.instance, patch));
  } catch (e) {
    return serverError(e);
  }
}
