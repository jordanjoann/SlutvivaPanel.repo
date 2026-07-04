import { resetPinWithToken, validatePin } from "@/lib/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { token?: string; pin?: string };
  const token = body.token?.trim() ?? "";
  const pin = body.pin?.trim() ?? "";

  if (!token) return Response.json({ error: "Reset token is required." }, { status: 400 });
  const pinError = validatePin(pin);
  if (pinError) return Response.json({ error: pinError }, { status: 400 });

  const account = await resetPinWithToken(token, pin);
  if (!account) {
    return Response.json({ error: "Reset link is invalid or expired." }, { status: 400 });
  }

  return Response.json({ ok: true, account });
}
