import { json, serverError } from "@/lib/server/http";
import {
  getVintageNetworkStatus,
  setupVintageNetwork,
} from "@/lib/server/vintage-network/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return json(await getVintageNetworkStatus());
  } catch (error) {
    return serverError(error);
  }
}

export async function POST() {
  try {
    return json(await setupVintageNetwork());
  } catch (error) {
    return serverError(error);
  }
}
