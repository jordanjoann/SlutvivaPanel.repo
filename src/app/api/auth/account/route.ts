import { getSessionAccount, updateAccount, validatePin } from "@/lib/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await getSessionAccount();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  return Response.json({
    account: session.account,
    expiresAt: session.expiresAt,
  });
}

export async function PUT(req: Request) {
  const session = await getSessionAccount();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    username?: string;
    pin?: string;
  };
  const username = body.username?.trim() ?? "";
  const pin = body.pin?.trim();

  if (!username) {
    return Response.json({ error: "Username is required." }, { status: 400 });
  }

  if (pin) {
    const pinError = validatePin(pin);
    if (pinError) return Response.json({ error: pinError }, { status: 400 });
  }

  try {
    const account = await updateAccount({
      username,
      pin: pin || undefined,
    });
    return Response.json({ ok: true, account });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Account update failed.";
    return Response.json({ error: message }, { status: 400 });
  }
}
