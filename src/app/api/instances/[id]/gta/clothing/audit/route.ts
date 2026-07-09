import {
  listClothingAudit,
  saveClothingAuditTag,
} from "@/lib/server/gta/clothing-audit";
import { getSessionAccount } from "@/lib/server/auth";
import {
  badRequest,
  forbidden,
  json,
  loadInstance,
  serverError,
  unauthorized,
} from "@/lib/server/http";
import { isClothingAuditTag } from "@/lib/gta-clothing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const auth = await requireGtaOwner(params);
    if ("response" in auth) return auth.response;
    return json(
      await listClothingAudit(
        auth.instance,
        (itemId) => `/api/instances/${auth.id}/gta/clothing/audit/preview?itemId=${itemId}`,
      ),
    );
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const auth = await requireGtaOwner(params);
    if ("response" in auth) return auth.response;

    const body = (await req.json().catch(() => null)) as {
      itemId?: unknown;
      tag?: unknown;
    } | null;
    if (!body || typeof body.itemId !== "string") {
      return badRequest("A clothing audit item id is required");
    }
    if (!isClothingAuditTag(body.tag)) {
      return badRequest("A valid clothing audit tag is required");
    }

    await saveClothingAuditTag(auth.instance, body.itemId, body.tag);
    return json(
      await listClothingAudit(
        auth.instance,
        (itemId) => `/api/instances/${auth.id}/gta/clothing/audit/preview?itemId=${itemId}`,
      ),
    );
  } catch (e) {
    return serverError(e);
  }
}

async function requireGtaOwner(params: Promise<{ id: string }>) {
  const session = await getSessionAccount();
  if (!session) return { response: unauthorized() };
  if (session.account.role !== "owner") return { response: forbidden() };

  const { id } = await params;
  const res = await loadInstance(id);
  if ("response" in res) return res;
  if (res.instance.game !== "gta") {
    return { response: badRequest("GTA clothing audit routes require a GTA instance") };
  }
  return { id, instance: res.instance };
}
