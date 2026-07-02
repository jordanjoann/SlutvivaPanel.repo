import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth-token";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return Response.json({ ok: true });
}
