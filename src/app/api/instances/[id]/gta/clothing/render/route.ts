import { listClothingLibrary } from "@/lib/server/gta/clothing-assets";
import { startClothingCatalogRender } from "@/lib/server/gta/clothing-renderer";
import { getSessionAccount } from "@/lib/server/auth";
import {
  badRequest,
  forbidden,
  json,
  loadInstance,
  serverError,
  unauthorized,
} from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  try {
    const session = await getSessionAccount();
    if (!session) return unauthorized();
    if (session.account.role !== "owner") return forbidden();

    const { id } = await params;
    const res = await loadInstance(id);
    if ("response" in res) return res.response;
    if (res.instance.game !== "gta") {
      return badRequest("GTA clothing render routes require a GTA instance");
    }

    const body = await req.json().catch(() => ({})) as { force?: unknown };
    await startClothingCatalogRender({ force: body.force === true });
    return json(await listClothingLibrary(
      (assetId) => `/api/instances/${id}/gta/clothing/preview?assetId=${assetId}`,
    ));
  } catch (error) {
    return serverError(error);
  }
}
