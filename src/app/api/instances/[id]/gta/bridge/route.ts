import { handleGtaBridgeEvent } from "@/lib/server/gta/players";
import { badRequest, json, loadInstance, serverError } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const res = await loadInstance(id);
    if ("response" in res) return res.response;
    if (res.instance.game !== "gta") {
      return badRequest("GTA bridge route requires a GTA instance");
    }

    const body = await readJsonBody(req);
    if (body === undefined) return badRequest("JSON body is required");

    try {
      return json(await handleGtaBridgeEvent(res.instance, body));
    } catch (error) {
      if (isBridgeValidationError(error)) {
        return badRequest(errorMessage(error));
      }
      throw error;
    }
  } catch (e) {
    return serverError(e);
  }
}

async function readJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

function isBridgeValidationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message === "Invalid GTA bridge token" ||
    error.message === "Unknown GTA bridge event type" ||
    error.message.startsWith("Malformed GTA bridge payload")
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
