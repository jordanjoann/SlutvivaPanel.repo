import { getDiscordStatus } from "@/lib/server/discord";
import { json, serverError } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return json(getDiscordStatus());
  } catch (e) {
    return serverError(e);
  }
}
