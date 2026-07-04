import { describe, expect, it } from "vitest";
import { createSessionToken, verifySessionToken } from "./auth-token";

describe("session tokens", () => {
  it("signs the panel user id and role into the session payload", async () => {
    const token = await createSessionToken("user-1", "viewer", 1_000);

    await expect(verifySessionToken(token, 2_000)).resolves.toMatchObject({
      sub: "user-1",
      role: "viewer",
      v: 2,
    });
  });

  it("rejects legacy local-only session payloads", async () => {
    const legacy = await createSessionToken("user-1", "owner", 1_000);
    const [encoded, signature] = legacy.split(".");
    const legacyPayload = Buffer.from(
      JSON.stringify({ sub: "local", iat: 1, exp: 10_000, v: 1 }),
      "utf8",
    )
      .toString("base64url");

    await expect(verifySessionToken(`${legacyPayload}.${signature}`, 2_000)).resolves.toBeNull();
    await expect(verifySessionToken(encoded ? `${encoded}.bad` : undefined, 2_000)).resolves.toBeNull();
  });
});
