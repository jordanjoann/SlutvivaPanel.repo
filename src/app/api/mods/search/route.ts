import { searchCatalog } from "@/lib/server/mods";
import { json, serverError } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams.get("q") ?? "";
    return json({ results: searchCatalog(q) });
  } catch (e) {
    return serverError(e);
  }
}
