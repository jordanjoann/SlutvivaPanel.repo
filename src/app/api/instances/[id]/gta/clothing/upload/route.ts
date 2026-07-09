import fs from "node:fs/promises";
import {
  listClothingLibrary,
  resolveClothingUploadPath,
  type ClothingUploadResult,
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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const MAX_UPLOAD_BYTES = 300 * 1024 * 1024;

export async function POST(req: Request, { params }: Ctx) {
  try {
    const session = await getSessionAccount();
    if (!session) return unauthorized();
    if (session.account.role !== "owner") return forbidden();

    const { id } = await params;
    const res = await loadInstance(id);
    if ("response" in res) return res.response;
    if (res.instance.game !== "gta") {
      return badRequest("GTA clothing upload routes require a GTA instance");
    }

    const form = await req.formData().catch(() => null);
    if (!form) return badRequest("Multipart form data is required");

    const files = form.getAll("files").filter((entry): entry is File => entry instanceof File);
    if (files.length === 0) return badRequest("At least one zip file is required");

    const uploaded: ClothingUploadResult[] = [];
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith(".zip")) {
        return badRequest("Only .zip clothing archives can be uploaded");
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        return badRequest(`${file.name} is larger than the 300 MB upload limit`);
      }

      const destination = await resolveClothingUploadPath(file.name);
      const body = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(destination.absolutePath, body);
      uploaded.push({
        fileName: destination.fileName,
        relativePath: destination.relativePath,
        size: body.byteLength,
      });
    }

    return json({
      uploaded,
      library: await listClothingLibrary(
        (assetId) => `/api/instances/${id}/gta/clothing/preview?assetId=${assetId}`,
      ),
    });
  } catch (e) {
    return serverError(e);
  }
}
