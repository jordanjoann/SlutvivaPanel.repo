import {
  clearClothingDecision,
  listClothingLibrary,
  saveClothingDecision,
} from "@/lib/server/gta/clothing-assets";
import { getSessionAccount } from "@/lib/server/auth";
import {
  badRequest,
  forbidden,
  json,
  loadInstance,
  serverError,
  unauthorized,
} from "@/lib/server/http";
import { isClothingTarget } from "@/lib/gta-clothing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const auth = await requireGtaOwner(params);
    if ("response" in auth) return auth.response;
    return json(await clothingLibraryPayload(auth.id));
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const auth = await requireGtaOwner(params);
    if ("response" in auth) return auth.response;

    const body = (await req.json().catch(() => null)) as {
      assetId?: unknown;
      target?: unknown;
      notes?: unknown;
    } | null;

    if (!body || typeof body.assetId !== "string") {
      return badRequest("A clothing asset id is required");
    }
    if (!isClothingTarget(body.target)) {
      return badRequest("A valid clothing target is required");
    }

    await saveClothingDecision(
      body.assetId,
      body.target,
      typeof body.notes === "string" ? body.notes : undefined,
    );
    return json(await clothingLibraryPayload(auth.id));
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const auth = await requireGtaOwner(params);
    if ("response" in auth) return auth.response;

    const assetId = new URL(req.url).searchParams.get("assetId");
    if (!assetId) return badRequest("A clothing asset id is required");

    await clearClothingDecision(assetId);
    return json(await clothingLibraryPayload(auth.id));
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
    return { response: badRequest("GTA clothing routes require a GTA instance") };
  }
  return { id };
}

async function clothingLibraryPayload(id: string) {
  return listClothingLibrary(
    (assetId) => `/api/instances/${id}/gta/clothing/preview?assetId=${assetId}`,
  );
}
