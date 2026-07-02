import type { ModSearchResult, ServerSettings } from "@/lib/types";
import {
  addBlacklistedMod,
  getServerSettings,
  removeBlacklistedMod,
  updateServerSettings,
} from "@/lib/server/server-settings";
import { badRequest, json, loadInstance, serverError } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const res = await loadInstance(id);
    if ("response" in res) return res.response;
    return json({ settings: await getServerSettings(res.instance) });
  } catch (e) {
    return serverError(e);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const res = await loadInstance(id);
    if ("response" in res) return res.response;

    const body = (await req.json()) as { settings?: ServerSettings };
    if (!body.settings) return badRequest("settings required");

    return json(await updateServerSettings(res.instance, body.settings));
  } catch (e) {
    return serverError(e);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const res = await loadInstance(id);
    if ("response" in res) return res.response;

    const body = (await req.json()) as {
      op?: "blacklist" | "removeBlacklist";
      mod?: ModSearchResult;
      modId?: string;
    };

    switch (body.op) {
      case "blacklist":
        if (!body.mod) return badRequest("mod required");
        return json({ settings: await addBlacklistedMod(res.instance, body.mod) });
      case "removeBlacklist":
        if (!body.modId) return badRequest("modId required");
        return json({ settings: await removeBlacklistedMod(res.instance, body.modId) });
      default:
        return badRequest("unknown op");
    }
  } catch (e) {
    return serverError(e);
  }
}
