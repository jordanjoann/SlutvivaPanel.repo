import { readClothingPreview } from "@/lib/server/gta/clothing-assets";
import { getSessionAccount } from "@/lib/server/auth";
import {
  badRequest,
  forbidden,
  loadInstance,
  notFound,
  serverError,
  unauthorized,
} from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const session = await getSessionAccount();
    if (!session) return unauthorized();
    if (session.account.role !== "owner") return forbidden();

    const { id } = await params;
    const res = await loadInstance(id);
    if ("response" in res) return res.response;
    if (res.instance.game !== "gta") {
      return badRequest("GTA clothing preview routes require a GTA instance");
    }

    const assetId = new URL(req.url).searchParams.get("assetId");
    if (!assetId) return badRequest("A clothing asset id is required");

    const preview = await readClothingPreview(assetId);
    if (!preview) return notFound("Preview image not found");
    const body = new ArrayBuffer(preview.body.byteLength);
    new Uint8Array(body).set(preview.body);

    return new Response(body, {
      headers: {
        "Content-Type": preview.mimeType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    return serverError(e);
  }
}
