import { cookies } from "next/headers";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth-token";
import { authenticate, validatePin } from "@/lib/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    username?: string;
    pin?: string;
  };
  const username = body.username?.trim() ?? "";
  const pin = body.pin?.trim() ?? "";

  if (!username || !pin) {
    return Response.json({ error: "Username and PIN are required." }, { status: 400 });
  }

  const pinError = validatePin(pin);
  if (pinError) {
    return Response.json({ error: pinError }, { status: 400 });
  }

  const account = await authenticate(username, pin);
  if (!account) {
    return Response.json({ error: "Invalid username or PIN." }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return Response.json({ ok: true, account });
}
