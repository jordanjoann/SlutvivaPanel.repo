import type { PanelRole } from "@/lib/server/panel-users";

export const SESSION_COOKIE = "slutvival_session";
export const SESSION_MAX_AGE_SECONDS = 72 * 60 * 60;

export type SessionPayload = {
  sub: string;
  role: PanelRole;
  exp: number;
  iat: number;
  v: 2;
};

const FALLBACK_SECRET = "slutvival-panel-local-auth-v2";

export async function createSessionToken(
  userId: string,
  role: PanelRole,
  now = Date.now(),
): Promise<string> {
  const issuedAt = Math.floor(now / 1000);
  const payload: SessionPayload = {
    sub: userId,
    role,
    iat: issuedAt,
    exp: issuedAt + SESSION_MAX_AGE_SECONDS,
    v: 2,
  };
  const encoded = base64UrlEncodeText(JSON.stringify(payload));
  return `${encoded}.${await sign(encoded)}`;
}

export async function verifySessionToken(
  token: string | undefined,
  now = Date.now(),
): Promise<SessionPayload | null> {
  if (!token) return null;

  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra !== undefined) return null;

  const expected = await sign(encoded);
  if (!constantTimeEqual(signature, expected)) return null;

  try {
    const payload = JSON.parse(base64UrlDecodeText(encoded)) as Partial<SessionPayload>;
    if (
      typeof payload.sub !== "string" ||
      !payload.sub ||
      !isSessionRole(payload.role) ||
      payload.v !== 2 ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    if (payload.exp * 1000 <= now) return null;
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

function isSessionRole(value: unknown): value is PanelRole {
  return value === "owner" || value === "admin" || value === "moderator" || value === "viewer";
}

async function sign(value: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(process.env.SLUTVIVAL_AUTH_SECRET ?? FALLBACK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

function base64UrlEncodeText(value: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecodeText(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;

  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}
