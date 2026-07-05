import { listGtaPlayers } from "@/lib/server/gta/players";
import {
  badRequest,
  forbidden,
  json,
  loadInstance,
  serverError,
  unauthorized,
} from "@/lib/server/http";
import { getSessionAccount } from "@/lib/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const session = await getSessionAccount();
    if (!session) return unauthorized();
    if (session.account.role !== "owner") return forbidden();

    const { id } = await params;
    const res = await loadInstance(id);
    if ("response" in res) return res.response;
    if (res.instance.game !== "gta") {
      return badRequest("GTA player routes require a GTA instance");
    }

    return json(await listGtaPlayers(res.instance));
  } catch (e) {
    return serverError(e);
  }
}
