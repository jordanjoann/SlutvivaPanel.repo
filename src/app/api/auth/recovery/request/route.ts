import { createPinReset } from "@/lib/server/auth";
import { requireEmailConfig, sendPinResetEmail } from "@/lib/server/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACCEPTED_MESSAGE = "If that account exists, a reset email has been sent.";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { identifier?: string };
  const identifier = body.identifier?.trim() ?? "";
  if (!identifier) return Response.json({ error: "Username or email is required." }, { status: 400 });

  const reset = await createPinReset(identifier);
  if (reset.status !== "created") {
    return Response.json({ ok: true, message: ACCEPTED_MESSAGE });
  }

  let emailConfig;
  try {
    emailConfig = requireEmailConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Panel email is not configured.";
    return Response.json({ error: message }, { status: 503 });
  }

  const resetUrl = new URL("/reset-pin", emailConfig.publicUrl);
  resetUrl.searchParams.set("token", reset.token);

  try {
    await sendPinResetEmail(
      {
        to: reset.user.email,
        resetUrl: resetUrl.toString(),
        expiresAt: new Date(reset.expiresAt),
      },
      emailConfig,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "PIN recovery email could not be sent.";
    return Response.json({ error: message }, { status: 502 });
  }

  return Response.json({ ok: true, message: ACCEPTED_MESSAGE });
}
