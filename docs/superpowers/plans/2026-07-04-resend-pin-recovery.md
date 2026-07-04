# Resend PIN Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Resend-backed outgoing email for `noreply@mail.slutvival.com` and wire the existing "Forgot PIN" flow to send a short-lived reset link.

**Architecture:** Resend is used only from server-side code through a small email boundary. PIN reset state is stored as an optional hashed-token field in the existing auth JSON file, keeping all account state behind `src/lib/server/auth.ts`. The public login and reset pages call unauthenticated auth recovery API routes that return generic responses for reset requests.

**Tech Stack:** Next.js App Router route handlers, React client forms, TypeScript, Vitest, Resend Node SDK, local JSON auth storage.

---

## File Structure

- Modify `package.json` and `package-lock.json`: add the `resend` dependency.
- Modify `.env.example`: document `RESEND_API_KEY`, `PANEL_EMAIL_FROM`, `PANEL_RECOVERY_EMAIL`, and `PANEL_PUBLIC_URL`.
- Create `src/lib/server/email.ts`: parse email environment, wrap Resend, build PIN recovery email content.
- Create `src/lib/server/email.test.ts`: cover config parsing and mocked send behavior.
- Modify `src/lib/server/auth.ts`: add optional `pinReset` storage, token generation, token verification, cooldown, and reset helpers.
- Create `src/lib/server/auth.test.ts`: cover reset token lifecycle and PIN update behavior.
- Create `src/app/api/auth/recovery/request/route.ts`: request a recovery email.
- Create `src/app/api/auth/recovery/reset/route.ts`: reset the PIN with a valid token.
- Modify `src/proxy.ts`: allow `/reset-pin` and the two recovery API routes through the auth proxy.
- Modify `src/components/auth/login-form.tsx`: replace the "Forgot PIN" toast with a recovery dialog.
- Create `src/components/auth/reset-pin-form.tsx`: client form for setting a new PIN from a reset link.
- Create `src/app/reset-pin/page.tsx`: public reset page.
- Modify `/opt/slutvival/secrets/slutvival-panel.env` during deployment only: add the Resend secret and email settings. Never commit this file.

---

### Task 1: Add Resend Dependency And Env Documentation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`

- [ ] **Step 1: Install the Resend SDK**

Run:

```bash
npm install resend
```

Expected: `package.json` includes `resend`, and `package-lock.json` updates.

- [ ] **Step 2: Document email environment variables**

Modify `.env.example` by adding this section after the panel auth block:

```env
# ── Outgoing email / PIN recovery ─────────────────────────────
# Resend powers noreply transactional email. Never expose the key
# in browser code.
RESEND_API_KEY=
PANEL_EMAIL_FROM=Slutvival <noreply@mail.slutvival.com>
PANEL_RECOVERY_EMAIL=
PANEL_PUBLIC_URL=https://panel.slutvival.com
```

- [ ] **Step 3: Verify package metadata**

Run:

```bash
npm ls resend
```

Expected: exits `0` and shows the installed `resend` version.

- [ ] **Step 4: Commit**

Run:

```bash
git add package.json package-lock.json .env.example
git commit -m "Add Resend email configuration"
```

---

### Task 2: Add Server Email Boundary

**Files:**
- Create: `src/lib/server/email.ts`
- Create: `src/lib/server/email.test.ts`

- [ ] **Step 1: Write failing email config tests**

Create `src/lib/server/email.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  buildPinResetEmail,
  readEmailConfig,
  requireEmailConfig,
  sendPinResetEmail,
} from "./email";

describe("readEmailConfig", () => {
  it("returns a trimmed config when all required values are present", () => {
    expect(
      readEmailConfig({
        RESEND_API_KEY: " re_test ",
        PANEL_EMAIL_FROM: " Slutvival <noreply@mail.slutvival.com> ",
        PANEL_RECOVERY_EMAIL: " owner@example.com ",
        PANEL_PUBLIC_URL: " https://panel.slutvival.com/ ",
      }),
    ).toEqual({
      apiKey: "re_test",
      from: "Slutvival <noreply@mail.slutvival.com>",
      recoveryEmail: "owner@example.com",
      publicUrl: "https://panel.slutvival.com",
    });
  });

  it("returns null when email recovery is not configured", () => {
    expect(readEmailConfig({})).toBeNull();
  });

  it("throws a clear error when the config is partial", () => {
    expect(() =>
      requireEmailConfig({
        RESEND_API_KEY: "re_test",
        PANEL_EMAIL_FROM: "Slutvival <noreply@mail.slutvival.com>",
      }),
    ).toThrow(/PIN recovery email configuration is incomplete/);
  });
});

describe("buildPinResetEmail", () => {
  it("builds text and HTML bodies with the reset URL", () => {
    const email = buildPinResetEmail({
      resetUrl: "https://panel.slutvival.com/reset-pin?token=abc",
      expiresAt: new Date("2026-07-04T12:30:00.000Z"),
    });

    expect(email.subject).toBe("Reset your Slutvival Panel PIN");
    expect(email.text).toContain("https://panel.slutvival.com/reset-pin?token=abc");
    expect(email.html).toContain("https://panel.slutvival.com/reset-pin?token=abc");
  });
});

describe("sendPinResetEmail", () => {
  it("sends the PIN reset email through the provided transport", async () => {
    const send = vi.fn().mockResolvedValue(undefined);

    await sendPinResetEmail(
      {
        resetUrl: "https://panel.slutvival.com/reset-pin?token=abc",
        expiresAt: new Date("2026-07-04T12:30:00.000Z"),
      },
      {
        apiKey: "re_test",
        from: "Slutvival <noreply@mail.slutvival.com>",
        recoveryEmail: "owner@example.com",
        publicUrl: "https://panel.slutvival.com",
      },
      { send },
    );

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Slutvival <noreply@mail.slutvival.com>",
        to: "owner@example.com",
        subject: "Reset your Slutvival Panel PIN",
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/lib/server/email.test.ts
```

Expected: FAIL because `src/lib/server/email.ts` does not exist.

- [ ] **Step 3: Implement email boundary**

Create `src/lib/server/email.ts`:

```ts
import { Resend } from "resend";

export type EmailEnv = Record<string, string | undefined>;

export type EmailConfig = {
  apiKey: string;
  from: string;
  recoveryEmail: string;
  publicUrl?: string;
};

export type OutgoingEmail = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type EmailTransport = {
  send(email: OutgoingEmail): Promise<void>;
};

export type PinResetEmailInput = {
  resetUrl: string;
  expiresAt: Date;
};

export function readEmailConfig(env: EmailEnv = process.env): EmailConfig | null {
  const apiKey = optionalTrimmed(env.RESEND_API_KEY);
  const from = optionalTrimmed(env.PANEL_EMAIL_FROM);
  const recoveryEmail = optionalTrimmed(env.PANEL_RECOVERY_EMAIL);
  const publicUrl = normalizePublicUrl(optionalTrimmed(env.PANEL_PUBLIC_URL));
  const values = [apiKey, from, recoveryEmail];

  if (values.every((value) => !value)) return null;
  if (values.some((value) => !value)) {
    throw new Error("PIN recovery email configuration is incomplete.");
  }

  return {
    apiKey: apiKey!,
    from: from!,
    recoveryEmail: recoveryEmail!,
    publicUrl,
  };
}

export function requireEmailConfig(env: EmailEnv = process.env): EmailConfig {
  const config = readEmailConfig(env);
  if (!config) throw new Error("PIN recovery email is not configured.");
  return config;
}

export function createResendTransport(apiKey: string): EmailTransport {
  const resend = new Resend(apiKey);
  return {
    async send(email) {
      const { error } = await resend.emails.send({
        from: email.from,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
      if (error) {
        throw new Error(error.message || "Resend rejected the email.");
      }
    },
  };
}

export function buildPinResetEmail(input: PinResetEmailInput) {
  const expiry = input.expiresAt.toISOString();
  return {
    subject: "Reset your Slutvival Panel PIN",
    text: [
      "A PIN reset was requested for the Slutvival Panel.",
      "",
      `Reset link: ${input.resetUrl}`,
      "",
      `This link expires at ${expiry}.`,
      "If you did not request this, ignore this email.",
    ].join("\n"),
    html: [
      "<p>A PIN reset was requested for the Slutvival Panel.</p>",
      `<p><a href="${escapeHtml(input.resetUrl)}">Reset your PIN</a></p>`,
      `<p>This link expires at <strong>${escapeHtml(expiry)}</strong>.</p>`,
      "<p>If you did not request this, ignore this email.</p>",
    ].join(""),
  };
}

export async function sendPinResetEmail(
  input: PinResetEmailInput,
  config: EmailConfig = requireEmailConfig(),
  transport: EmailTransport = createResendTransport(config.apiKey),
): Promise<void> {
  const content = buildPinResetEmail(input);
  await transport.send({
    from: config.from,
    to: config.recoveryEmail,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });
}

function optionalTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function normalizePublicUrl(value: string | undefined): string | undefined {
  return value?.replace(/\/+$/, "");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
```

- [ ] **Step 4: Run email tests**

Run:

```bash
npm test -- src/lib/server/email.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/lib/server/email.ts src/lib/server/email.test.ts
git commit -m "Add Resend email sender"
```

---

### Task 3: Add PIN Reset Token Lifecycle

**Files:**
- Modify: `src/lib/server/auth.ts`
- Create: `src/lib/server/auth.test.ts`

- [ ] **Step 1: Write failing auth reset tests**

Create `src/lib/server/auth.test.ts`:

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalAuthFile = process.env.SLUTVIVAL_AUTH_FILE;

afterEach(() => {
  vi.resetModules();
  if (originalAuthFile === undefined) {
    delete process.env.SLUTVIVAL_AUTH_FILE;
  } else {
    process.env.SLUTVIVAL_AUTH_FILE = originalAuthFile;
  }
});

async function loadAuth() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "slutvival-auth-"));
  process.env.SLUTVIVAL_AUTH_FILE = path.join(dir, "panel-auth.json");
  vi.resetModules();
  return import("./auth");
}

describe("PIN reset lifecycle", () => {
  it("stores only a reset token hash", async () => {
    const auth = await loadAuth();

    const reset = await auth.createPinReset("Admin", 1_000, () => "plain-token");

    expect(reset.status).toBe("created");
    const raw = await fs.readFile(process.env.SLUTVIVAL_AUTH_FILE!, "utf8");
    expect(raw).not.toContain("plain-token");
    expect(JSON.parse(raw).pinReset.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns unknown without creating a token for a non-matching username", async () => {
    const auth = await loadAuth();

    const reset = await auth.createPinReset("SomeoneElse", 1_000, () => "plain-token");

    expect(reset).toEqual({ status: "unknown" });
    const raw = await fs.readFile(process.env.SLUTVIVAL_AUTH_FILE!, "utf8");
    expect(JSON.parse(raw).pinReset).toBeUndefined();
  });

  it("updates the PIN and clears the reset token when the token is valid", async () => {
    const auth = await loadAuth();
    await auth.createPinReset("Admin", 1_000, () => "plain-token");

    const account = await auth.resetPinWithToken("plain-token", "4321", 2_000);

    expect(account?.username).toBe("Admin");
    expect(await auth.authenticate("Admin", "4321")).not.toBeNull();
    expect(await auth.authenticate("Admin", "9876")).toBeNull();
    const raw = await fs.readFile(process.env.SLUTVIVAL_AUTH_FILE!, "utf8");
    expect(JSON.parse(raw).pinReset).toBeUndefined();
  });

  it("rejects expired reset tokens and clears them", async () => {
    const auth = await loadAuth();
    await auth.createPinReset("Admin", 1_000, () => "plain-token");

    const account = await auth.resetPinWithToken("plain-token", "4321", 1_801_001);

    expect(account).toBeNull();
    expect(await auth.authenticate("Admin", "9876")).not.toBeNull();
    const raw = await fs.readFile(process.env.SLUTVIVAL_AUTH_FILE!, "utf8");
    expect(JSON.parse(raw).pinReset).toBeUndefined();
  });

  it("rate limits repeated reset creation", async () => {
    const auth = await loadAuth();
    await auth.createPinReset("Admin", 1_000, () => "first-token");

    const reset = await auth.createPinReset("Admin", 61_000, () => "second-token");

    expect(reset.status).toBe("cooldown");
    if (reset.status === "cooldown") {
      expect(reset.retryAfterMs).toBe(240_000);
    }
  });

  it("clears an active reset token when the account PIN is updated", async () => {
    const auth = await loadAuth();
    await auth.createPinReset("Admin", 1_000, () => "plain-token");

    await auth.updateAccount({ username: "Admin", pin: "5555" });

    const raw = await fs.readFile(process.env.SLUTVIVAL_AUTH_FILE!, "utf8");
    expect(JSON.parse(raw).pinReset).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/lib/server/auth.test.ts
```

Expected: FAIL because reset helpers do not exist.

- [ ] **Step 3: Implement reset state in `auth.ts`**

Modify `src/lib/server/auth.ts`:

```ts
import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
```

Add types and constants near `StoredAccount`:

```ts
type StoredPinReset = {
  tokenHash: string;
  expiresAt: number;
  requestedAt: number;
};

type StoredAccount = PanelAccount & {
  pinSalt: string;
  pinHash: string;
  pinReset?: StoredPinReset;
};

export type PinResetCreationResult =
  | { status: "created"; token: string; expiresAt: number }
  | { status: "unknown" }
  | { status: "cooldown"; retryAfterMs: number };

const PIN_RESET_TTL_MS = 30 * 60 * 1000;
const PIN_RESET_COOLDOWN_MS = 5 * 60 * 1000;
```

Add exported helpers after `updateAccount`:

```ts
export async function createPinReset(
  username: string,
  now = Date.now(),
  tokenFactory = generateResetToken,
): Promise<PinResetCreationResult> {
  const account = await readStoredAccount();
  if (account.username.toLowerCase() !== username.trim().toLowerCase()) {
    return { status: "unknown" };
  }

  if (account.pinReset && account.pinReset.expiresAt > now) {
    const nextAllowedAt = account.pinReset.requestedAt + PIN_RESET_COOLDOWN_MS;
    if (nextAllowedAt > now) {
      return { status: "cooldown", retryAfterMs: nextAllowedAt - now };
    }
  }

  const token = tokenFactory();
  const next: StoredAccount = {
    ...account,
    pinReset: {
      tokenHash: hashResetToken(token),
      expiresAt: now + PIN_RESET_TTL_MS,
      requestedAt: now,
    },
  };
  await writeStoredAccount(next);

  return {
    status: "created",
    token,
    expiresAt: next.pinReset!.expiresAt,
  };
}

export async function clearPinReset(): Promise<void> {
  const account = await readStoredAccount();
  if (!account.pinReset) return;
  const next: StoredAccount = { ...account };
  delete next.pinReset;
  await writeStoredAccount(next);
}

export async function resetPinWithToken(
  token: string,
  pin: string,
  now = Date.now(),
): Promise<PanelAccount | null> {
  const account = await readStoredAccount();
  if (!account.pinReset) return null;
  if (account.pinReset.expiresAt <= now) {
    await clearPinReset();
    return null;
  }
  if (!verifyResetToken(token, account.pinReset.tokenHash)) return null;

  const pinSalt = randomBytes(16).toString("hex");
  const next: StoredAccount = {
    ...account,
    pinSalt,
    pinHash: hashPin(pin, pinSalt),
    updatedAt: now,
  };
  delete next.pinReset;
  await writeStoredAccount(next);
  return publicAccount(next);
}
```

Inside `updateAccount`, clear reset state when a PIN is changed:

```ts
if (input.pin !== undefined) {
  next.pinSalt = randomBytes(16).toString("hex");
  next.pinHash = hashPin(input.pin, next.pinSalt);
  delete next.pinReset;
}
```

Loosen `readStoredAccount` validation only enough to accept optional valid reset metadata:

```ts
if (
  !parsed.username ||
  !parsed.pinSalt ||
  !parsed.pinHash ||
  typeof parsed.updatedAt !== "number" ||
  (parsed.pinReset !== undefined && !isValidPinReset(parsed.pinReset))
) {
  throw new Error(`Invalid auth file: ${AUTH_FILE}`);
}
```

Add helper functions near `verifyPin`:

```ts
function generateResetToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function verifyResetToken(token: string, expectedHash: string): boolean {
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(hashResetToken(token), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function isValidPinReset(value: unknown): value is StoredPinReset {
  if (!value || typeof value !== "object") return false;
  const reset = value as Partial<StoredPinReset>;
  return (
    typeof reset.tokenHash === "string" &&
    /^[a-f0-9]{64}$/.test(reset.tokenHash) &&
    typeof reset.expiresAt === "number" &&
    typeof reset.requestedAt === "number"
  );
}
```

- [ ] **Step 4: Run auth tests**

Run:

```bash
npm test -- src/lib/server/auth.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/lib/server/auth.ts src/lib/server/auth.test.ts
git commit -m "Add PIN reset token lifecycle"
```

---

### Task 4: Add Recovery API Routes And Proxy Access

**Files:**
- Create: `src/app/api/auth/recovery/request/route.ts`
- Create: `src/app/api/auth/recovery/reset/route.ts`
- Modify: `src/proxy.ts`

- [ ] **Step 1: Create request route**

Create `src/app/api/auth/recovery/request/route.ts`:

```ts
import { clearPinReset, createPinReset } from "@/lib/server/auth";
import { readEmailConfig, sendPinResetEmail } from "@/lib/server/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACCEPTED_MESSAGE = "If PIN recovery is available for that account, a reset email has been sent.";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { username?: string };
  const username = body.username?.trim() ?? "";
  if (!username) {
    return Response.json({ error: "Username is required." }, { status: 400 });
  }

  let emailConfig;
  try {
    emailConfig = readEmailConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : "PIN recovery email is misconfigured.";
    return Response.json({ error: message }, { status: 503 });
  }

  if (!emailConfig) {
    return Response.json({ error: "PIN recovery email is not configured." }, { status: 503 });
  }

  const reset = await createPinReset(username);
  if (reset.status !== "created") {
    return Response.json({ ok: true, message: ACCEPTED_MESSAGE });
  }

  const resetUrl = new URL("/reset-pin", emailConfig.publicUrl ?? new URL(req.url).origin);
  resetUrl.searchParams.set("token", reset.token);

  try {
    await sendPinResetEmail(
      {
        resetUrl: resetUrl.toString(),
        expiresAt: new Date(reset.expiresAt),
      },
      emailConfig,
    );
  } catch (error) {
    await clearPinReset();
    const message = error instanceof Error ? error.message : "PIN recovery email could not be sent.";
    return Response.json({ error: message }, { status: 502 });
  }

  return Response.json({ ok: true, message: ACCEPTED_MESSAGE });
}
```

- [ ] **Step 2: Create reset route**

Create `src/app/api/auth/recovery/reset/route.ts`:

```ts
import { resetPinWithToken, validatePin } from "@/lib/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    token?: string;
    pin?: string;
  };
  const token = body.token?.trim() ?? "";
  const pin = body.pin?.trim() ?? "";

  if (!token) {
    return Response.json({ error: "Reset token is required." }, { status: 400 });
  }

  const pinError = validatePin(pin);
  if (pinError) return Response.json({ error: pinError }, { status: 400 });

  const account = await resetPinWithToken(token, pin);
  if (!account) {
    return Response.json({ error: "Reset link is invalid or expired." }, { status: 400 });
  }

  return Response.json({ ok: true, account });
}
```

- [ ] **Step 3: Update proxy public allowlist**

Modify `src/proxy.ts`:

```ts
const PUBLIC_PATHS = new Set(["/login", "/reset-pin"]);
const AUTH_API_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/session",
  "/api/auth/recovery/request",
  "/api/auth/recovery/reset",
]);
```

- [ ] **Step 4: Run route typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/app/api/auth/recovery/request/route.ts src/app/api/auth/recovery/reset/route.ts src/proxy.ts
git commit -m "Add PIN recovery API routes"
```

---

### Task 5: Wire Login Recovery UI

**Files:**
- Modify: `src/components/auth/login-form.tsx`

- [ ] **Step 1: Replace the current recovery action**

Modify `src/components/auth/login-form.tsx` to import the dialog pieces and `MailIcon`:

```ts
import { Loader2Icon, LogInIcon, MailIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
```

Add state near the existing `busy` state:

```ts
const [recoveryOpen, setRecoveryOpen] = useState(false);
const [recoveryUsername, setRecoveryUsername] = useState("");
const [recoveryBusy, setRecoveryBusy] = useState(false);
```

Add this function inside `LoginForm`:

```ts
async function requestRecovery(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const requestedUsername = recoveryUsername.trim();
  if (!requestedUsername) {
    toast.error("Username is required.");
    return;
  }

  setRecoveryBusy(true);
  try {
    const response = await fetch("/api/auth/recovery/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: requestedUsername }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    if (!response.ok) throw new Error(data.error ?? "PIN recovery failed.");

    toast.success(data.message ?? "Recovery email requested.");
    setRecoveryOpen(false);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "PIN recovery failed.");
  } finally {
    setRecoveryBusy(false);
  }
}
```

Replace the current "Forgot PIN" button with a button that opens a dialog and preloads the current username:

```tsx
<Button
  type="button"
  variant="ghost"
  onClick={() => {
    setRecoveryUsername(username);
    setRecoveryOpen(true);
  }}
>
  Forgot PIN
</Button>
<Dialog open={recoveryOpen} onOpenChange={setRecoveryOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Reset PIN</DialogTitle>
      <DialogDescription>Send a reset link to the configured recovery inbox.</DialogDescription>
    </DialogHeader>
    <form className="grid gap-4" onSubmit={requestRecovery}>
      <div className="grid gap-1.5">
        <Label htmlFor="recovery-username">Username</Label>
        <Input
          id="recovery-username"
          autoComplete="username"
          value={recoveryUsername}
          onChange={(event) => setRecoveryUsername(event.target.value)}
        />
      </div>
      <DialogFooter className="mx-0 mb-0 rounded-none border-0 bg-transparent p-0">
        <Button type="submit" disabled={recoveryBusy || !recoveryUsername.trim()}>
          {recoveryBusy ? <Loader2Icon className="animate-spin" /> : <MailIcon />}
          Send reset link
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
```

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

Run:

```bash
git add src/components/auth/login-form.tsx
git commit -m "Wire forgot PIN recovery dialog"
```

---

### Task 6: Add Public Reset PIN Page

**Files:**
- Create: `src/components/auth/reset-pin-form.tsx`
- Create: `src/app/reset-pin/page.tsx`

- [ ] **Step 1: Create reset form component**

Create `src/components/auth/reset-pin-form.tsx`:

```tsx
"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRoundIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetPinForm({ token }: { token: string }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pin !== confirmPin) {
      toast.error("PIN confirmation does not match.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/auth/recovery/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, pin }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "PIN reset failed.");

      toast.success("PIN reset. Sign in with the new PIN.");
      router.replace("/login");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "PIN reset failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <div className="grid gap-1.5">
        <Label htmlFor="new-pin">New PIN</Label>
        <Input
          id="new-pin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={pin}
          onChange={(event) => setPin(event.target.value)}
          autoFocus
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="confirm-new-pin">Confirm PIN</Label>
        <Input
          id="confirm-new-pin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={confirmPin}
          onChange={(event) => setConfirmPin(event.target.value)}
        />
      </div>
      <Button type="submit" size="lg" disabled={busy || !token || !pin.trim() || !confirmPin.trim()}>
        {busy ? <Loader2Icon className="animate-spin" /> : <KeyRoundIcon />}
        Reset PIN
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Create reset page**

Create `src/app/reset-pin/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { KeyRoundIcon } from "lucide-react";
import { ResetPinForm } from "@/components/auth/reset-pin-form";
import { getSessionAccount } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function ResetPinPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  if (await getSessionAccount()) redirect("/");

  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <KeyRoundIcon className="size-5" />
          </div>
          <div>
            <h1 className="font-heading text-lg font-semibold">Reset PIN</h1>
          </div>
        </div>
        {token ? (
          <ResetPinForm token={token} />
        ) : (
          <p className="text-sm text-muted-foreground">This reset link is missing a token.</p>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

Run:

```bash
git add src/components/auth/reset-pin-form.tsx src/app/reset-pin/page.tsx
git commit -m "Add reset PIN page"
```

---

### Task 7: Full Verification

**Files:**
- No new files.

- [ ] **Step 1: Run tests**

Run:

```bash
npm test
```

Expected: all Vitest files pass.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Commit any verification fixes**

If a verification command required a code fix, inspect the changed files and commit only the files changed for that fix:

```bash
git status --short
git add path/to/fixed-file.ts
git commit -m "Fix PIN recovery verification issues"
```

Expected: no commit is needed if all verification commands pass on the first run.

---

### Task 8: Configure Resend, DNS, And Production Secrets

**Files:**
- Modify outside git: `/opt/slutvival/secrets/slutvival-panel.env`
- Verify outside git: Resend dashboard/domain status and Cloudflare DNS records.

- [ ] **Step 1: Confirm deployment values**

Use these values:

```env
PANEL_EMAIL_FROM=Slutvival <noreply@mail.slutvival.com>
PANEL_PUBLIC_URL=https://panel.slutvival.com
```

Before editing the secret env file, get the recovery destination address from the owner. Do not proceed with deployment until this value is known. The resulting env line must use that real inbox address:

```env
PANEL_RECOVERY_EMAIL=owner@example.com
```

The example address above must be replaced during execution with the real recovery inbox address. The Resend API key must be the key provided by the owner for this setup. Do not write the key to any tracked file.

- [ ] **Step 2: Add `mail.slutvival.com` in Resend**

In the Resend dashboard, add `mail.slutvival.com` as a sending domain. If the provided API key has full access, the same can be done through Resend's domain API; if it has sending-only access, use the dashboard.

Expected: Resend shows the generated DNS records for `mail.slutvival.com`.

- [ ] **Step 3: Add DNS records in Cloudflare**

In Cloudflare, add the exact records generated by Resend for `mail.slutvival.com`.

Expected records usually include one MX record for the Resend return path, one TXT SPF record that includes Amazon SES, and three DKIM CNAME records. Use the exact hostnames and targets from the Resend dashboard because the DKIM labels are generated per domain.

Also add this DMARC record for the sending subdomain when no stricter record already covers it:

```text
TXT _dmarc.mail.slutvival.com "v=DMARC1; p=none; adkim=s; aspf=s"
```

Expected: DNS records exist in Cloudflare and Resend domain verification eventually reports verified.

- [ ] **Step 4: Update production secret env file without exposing the key**

Edit `/opt/slutvival/secrets/slutvival-panel.env` so it contains:

```env
RESEND_API_KEY=the-owner-provided-resend-key
PANEL_EMAIL_FROM=Slutvival <noreply@mail.slutvival.com>
PANEL_RECOVERY_EMAIL=owner@example.com
PANEL_PUBLIC_URL=https://panel.slutvival.com
```

The key and recovery address shown above are examples of the required variable shape, not literal values. Use the real key and the real recovery inbox during execution. Use an editor or a shell session that does not echo the secret. After editing, verify only variable names:

```bash
awk -F= '/^[[:space:]]*#/ {next} /^[[:space:]]*$/ {next} {print $1}' /opt/slutvival/secrets/slutvival-panel.env
```

Expected: output includes `RESEND_API_KEY`, `PANEL_EMAIL_FROM`, `PANEL_RECOVERY_EMAIL`, and `PANEL_PUBLIC_URL`, but does not print their values.

- [ ] **Step 5: Rebuild and restart the panel container**

Run:

```bash
cd /opt/slutvival/docker/stacks/slutvival-panel
docker compose up -d --build
```

Expected: `slutvival-panel` is recreated and running.

- [ ] **Step 6: Manual recovery verification**

Use the panel login page:

```text
https://panel.slutvival.com/login
```

Request a PIN reset for the real panel username. Confirm:

- A Resend event appears in the Resend dashboard.
- The recovery inbox receives a message from `noreply@mail.slutvival.com`.
- The reset link opens `https://panel.slutvival.com/reset-pin?token=...`.
- Setting a new PIN succeeds.
- Signing in with the new PIN succeeds.
- Signing in with the old PIN fails.

- [ ] **Step 7: Final commit and push**

Commit any remaining tracked code changes:

```bash
git status --short
git add package.json package-lock.json .env.example src/lib/server/email.ts src/lib/server/email.test.ts src/lib/server/auth.ts src/lib/server/auth.test.ts src/app/api/auth/recovery/request/route.ts src/app/api/auth/recovery/reset/route.ts src/proxy.ts src/components/auth/login-form.tsx src/components/auth/reset-pin-form.tsx src/app/reset-pin/page.tsx
git commit -m "Add Resend PIN recovery"
git push origin main
```

Expected: `main` is clean and aligned with `origin/main`.

---

## Self-Review

- Spec coverage: Resend provider setup, `noreply@mail.slutvival.com`, server-only env, short-lived reset links, generic request responses, token hashing, cooldown, and scoped PIN recovery are covered.
- Dynamic external data: Resend-generated DNS values and the owner's recovery inbox are not hard-coded because they are external setup values. The plan requires collecting or reading them during Task 8 before deployment.
- Type consistency: `EmailConfig`, `EmailTransport`, `PinResetCreationResult`, `createPinReset`, `clearPinReset`, and `resetPinWithToken` are introduced before use by routes.
- Verification: Unit tests cover email config/sending boundary and auth token lifecycle; full repo test/typecheck/lint runs before deployment.
