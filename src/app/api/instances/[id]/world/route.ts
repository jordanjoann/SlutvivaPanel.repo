import type { WorldInfo } from "@/lib/types";
import { getWorld, updateWorld } from "@/lib/server/world";
import {
  deployWorld,
  WorldDeploymentError,
} from "@/lib/server/world-deployment";
import { badRequest, json, serverError, loadInstance } from "@/lib/server/http";

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

export async function PUT(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const res = await loadInstance(id);
    if ("response" in res) return res.response;
    if (!req.body) return badRequest("World save file required.");

    const fileName = new URL(req.url).searchParams.get("filename") ?? "";
    const contentLengthHeader = req.headers.get("content-length");
    const contentLength = contentLengthHeader ? Number(contentLengthHeader) : undefined;
    if (contentLength !== undefined && (!Number.isSafeInteger(contentLength) || contentLength < 0)) {
      return badRequest("Invalid upload size.");
    }

    return json(
      await deployWorld(res.instance, {
        fileName,
        body: req.body,
        contentLength,
      }),
    );
  } catch (error) {
    if (error instanceof WorldDeploymentError) return badRequest(error.message);
    return serverError(error);
  }
}
