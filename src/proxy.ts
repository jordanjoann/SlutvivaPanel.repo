import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-token";
import { canAccessApiPath, canAccessPagePath } from "@/lib/access-policy";

const PUBLIC_PATHS = new Set(["/login", "/reset-pin"]);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublicAsset(pathname)) return NextResponse.next();

  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (session && pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (session) {
    if (pathname.startsWith("/api/")) {
      if (!canAccessApiPath(session.role, pathname)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.next();
    }

    if (!canAccessPagePath(session.role, pathname)) {
      const destination = session.role === "admin" || session.role === "moderator" ? "/vintage-story" : "/";
      return NextResponse.redirect(new URL(destination, req.url));
    }

    return NextResponse.next();
  }

  if (PUBLIC_PATHS.has(pathname) || canAccessApiPath("viewer", pathname)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const login = new URL("/login", req.url);
  login.searchParams.set("next", `${pathname}${req.nextUrl.search}`);
  return NextResponse.redirect(login);
}

function isPublicAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    /\.[a-z0-9]+$/i.test(pathname)
  );
}

export const config = {
  // World uploads authenticate inside their route so multi-GB bodies can stream
  // directly to disk instead of being cloned by the proxy's 10 MB body buffer.
  matcher: ["/((?!_next/static|_next/image|api/world-upload(?:/|$)).*)"],
};
