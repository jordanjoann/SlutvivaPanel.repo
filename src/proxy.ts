import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-token";

const PUBLIC_PATHS = new Set(["/login", "/reset-pin"]);
const NON_OWNER_PAGE_PATHS = new Set(["/", "/account"]);
const AUTH_API_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/session",
  "/api/auth/account",
  "/api/auth/recovery/request",
  "/api/auth/recovery/reset",
]);

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublicAsset(pathname)) return NextResponse.next();

  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const isAuthApi = AUTH_API_PATHS.has(pathname);

  if (session && pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (session && session.role !== "owner") {
    if (pathname.startsWith("/api/") && !AUTH_API_PATHS.has(pathname)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!pathname.startsWith("/api/") && !PUBLIC_PATHS.has(pathname) && !NON_OWNER_PAGE_PATHS.has(pathname)) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  if (session || PUBLIC_PATHS.has(pathname) || isAuthApi) {
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
  matcher: ["/((?!_next/static|_next/image).*)"],
};
