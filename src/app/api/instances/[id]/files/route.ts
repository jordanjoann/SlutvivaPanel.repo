import * as files from "@/lib/server/files";
import { json, ok, badRequest, serverError } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** List a directory: GET ?path=relative/dir */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const path = new URL(req.url).searchParams.get("path") ?? "";
    return json({ path, entries: await files.listDir(id, path) });
  } catch (e) {
    return serverError(e);
  }
}

/** Mutations: { op: "mkdir"|"createFile"|"rename"|"delete", ... } */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      op?: string;
      path?: string;
      from?: string;
      to?: string;
    };
    switch (body.op) {
      case "mkdir":
        if (!body.path) return badRequest("path required");
        await files.mkdirp(id, body.path);
        return ok();
      case "createFile":
        if (!body.path) return badRequest("path required");
        await files.createFile(id, body.path);
        return ok();
      case "rename":
        if (!body.from || !body.to) return badRequest("from and to required");
        await files.rename(id, body.from, body.to);
        return ok();
      case "delete":
        if (!body.path) return badRequest("path required");
        await files.remove(id, body.path);
        return ok();
      default:
        return badRequest("unknown op");
    }
  } catch (e) {
    return serverError(e);
  }
}

/** Upload: multipart form with `path` (target dir) and one or more `files`. */
export async function PUT(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const form = await req.formData();
    const dir = (form.get("path") as string) ?? "";
    const uploaded = form.getAll("files").filter((f): f is File => f instanceof File);
    for (const file of uploaded) {
      const buf = Buffer.from(await file.arrayBuffer());
      const target = dir ? `${dir}/${file.name}` : file.name;
      await files.writeBuffer(id, target, buf);
    }
    return json({ ok: true, count: uploaded.length });
  } catch (e) {
    return serverError(e);
  }
}
