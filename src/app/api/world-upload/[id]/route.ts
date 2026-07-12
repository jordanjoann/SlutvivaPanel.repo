import { getSessionAccount } from "@/lib/server/auth";
import {
  deployWorld,
  WorldDeploymentError,
} from "@/lib/server/world-deployment";
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

export async function PUT(req: Request, { params }: Ctx) {
  try {
    const session = await getSessionAccount();
    if (!session) return unauthorized();
    if (session.account.role !== "owner") return forbidden();

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
