import * as mods from "@/lib/server/mods";
import { canAccessInstanceGame, canUseModOperation } from "@/lib/access-policy";
import { getSessionAccount } from "@/lib/server/auth";
import type { ModSearchResult } from "@/lib/types";
import {
  json,
  ok,
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

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const session = await getSessionAccount();
    if (!session) return unauthorized();

    const { id } = await params;
    const res = await loadInstance(id);
    if ("response" in res) return res.response;
    if (!canAccessInstanceGame(session.account.role, res.instance.game)) return forbidden();

    return json({ mods: await mods.listInstalled(id) });
  } catch (e) {
    return serverError(e);
  }
}

/** { op: "enable"|"disable"|"update"|"remove"|"install", modId?, mod?, version? } */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      op?: string;
      modId?: string;
      version?: string;
      mod?: ModSearchResult;
      fileName?: string;
    };
    const session = await getSessionAccount();
    if (!session) return unauthorized();
    if (!body.op) return badRequest("unknown op");
    if (!canUseModOperation(session.account.role, body.op)) return forbidden();

    const res = await loadInstance(id);
    if ("response" in res) return res.response;
    if (!canAccessInstanceGame(session.account.role, res.instance.game)) return forbidden();

    switch (body.op) {
      case "enable":
      case "disable": {
        if (!body.modId) return badRequest("modId required");
        const r = await mods.setModEnabled(id, body.modId, body.op === "enable");
        return r ? json(r) : notFound("mod not found");
      }
      case "update": {
        if (!body.modId) return badRequest("modId required");
        const r = await mods.updateMod(id, body.modId);
        return r ? json(r) : notFound("mod not found");
      }
      case "remove": {
        if (!body.modId) return badRequest("modId required");
        const removed = await mods.removeMod(id, body.modId);
        return removed ? ok() : notFound("mod not found");
      }
      case "install": {
        if (!body.mod) return badRequest("mod required");
        return json(await mods.installMod(id, body.mod, body.version));
      }
      case "installFile": {
        if (!body.fileName) return badRequest("fileName required");
        return json(await mods.installFile(id, body.fileName));
      }
      default:
        return badRequest("unknown op");
    }
  } catch (e) {
    return serverError(e);
  }
}
