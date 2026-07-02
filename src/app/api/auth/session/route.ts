import { getSessionAccount } from "@/lib/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await getSessionAccount();
  return Response.json({
    authenticated: Boolean(session),
    account: session?.account ?? null,
    expiresAt: session?.expiresAt ?? null,
  });
}
