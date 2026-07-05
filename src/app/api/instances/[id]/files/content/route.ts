import fs from "node:fs/promises";
import * as files from "@/lib/server/files";
import { json, badRequest, serverError } from "@/lib/server/http";
import { requireInstanceGameAccess } from "@/lib/server/instance-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Read a file: GET ?path=relative/file&download=1 */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const access = await requireInstanceGameAccess(id);
    if ("response" in access) return access.response;

    const url = new URL(req.url);
    const path = url.searchParams.get("path");
    if (!path) return badRequest("path required");

    if (url.searchParams.get("download")) {
      const { abs } = await files.statFile(id, path);
      const buf = await fs.readFile(abs);
      return new Response(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${path.split("/").pop()}"`,
        },
      });
    }
    return json(await files.readFile(id, path));
  } catch (e) {
    return serverError(e);
  }
}

/** Write a file: PUT { path, content } */
export async function PUT(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const access = await requireInstanceGameAccess(id);
    if ("response" in access) return access.response;

    const { path, content } = (await req.json()) as {
      path?: string;
      content?: string;
    };
    if (!path || content === undefined) {
      return badRequest("path and content required");
    }
    return json(await files.writeFile(id, path, content));
  } catch (e) {
    return serverError(e);
  }
}
