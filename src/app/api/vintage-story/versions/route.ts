import { listVersions } from "@/lib/server/versions";
import { json, serverError } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return json({ versions: await listVersions() });
  } catch (e) {
    return serverError(e);
  }
}
