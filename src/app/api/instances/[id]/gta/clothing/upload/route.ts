import fs from "node:fs/promises";
import path from "node:path";
import {
  CLOTHING_ASSET_ROOT,
  isSupportedClothingUpload,
  listClothingLibrary,
  resolveClothingRawUploadDir,
  resolveClothingUploadPath,
  sanitizeClothingUploadFileName,
  type ClothingUploadResult,
} from "@/lib/server/gta/clothing-assets";
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
    if (files.length === 0) return badRequest("At least one clothing asset file is required");
    const totalSize = files.reduce((total, file) => total + file.size, 0);
    if (totalSize > MAX_UPLOAD_BYTES) {
      return badRequest("The upload is larger than the 300 MB upload limit");
    }
    const unsupported = files.find((file) => !isSupportedClothingUpload(file.name));
    if (unsupported) {
      return badRequest(`${unsupported.name} is not a supported GTA clothing asset`);
    }

    const uploaded: ClothingUploadResult[] = [];
    const rawFiles = files.filter((file) => !file.name.toLowerCase().endsWith(".zip"));
    const rawNames = rawFiles.map((file) => sanitizeClothingUploadFileName(file.name));
    if (new Set(rawNames).size !== rawNames.length) {
      return badRequest("Duplicate loose filenames must be uploaded in a zip to preserve folders");
    }
    const rawUploadDir = rawFiles.length
      ? await resolveClothingRawUploadDir(rawFiles[0].name)
      : null;
    for (const file of files) {
      const isZip = file.name.toLowerCase().endsWith(".zip");
      const destination = isZip
        ? await resolveClothingUploadPath(file.name)
        : rawUploadDestination(rawUploadDir!, file.name);
      const body = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(destination.absolutePath, body);
      uploaded.push({
        fileName: destination.fileName,
        relativePath: destination.relativePath,
        size: body.byteLength,
      });
    }

    await startClothingCatalogRender();

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

function rawUploadDestination(
  uploadDir: string,
  originalName: string,
): { fileName: string; absolutePath: string; relativePath: string } {
  const fileName = sanitizeClothingUploadFileName(originalName);
  const absolutePath = path.join(uploadDir, fileName);
  return {
    fileName,
    absolutePath,
    relativePath: path.relative(CLOTHING_ASSET_ROOT, absolutePath).split(path.sep).join("/"),
  };
}
