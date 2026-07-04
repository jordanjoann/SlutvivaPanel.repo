# Panel Users And Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single JSON-backed panel account with SQLite-backed panel users, role-gated access, Resend welcome emails, and stored-email PIN recovery.

**Architecture:** `panel_users` in the existing panel SQLite database becomes the source of truth for authentication, roles, account profile data, and PIN reset state. `src/lib/server/auth.ts` remains the public auth boundary used by routes and pages, while a new user-store module owns SQLite migration and account mutations. Signed session tokens carry user id and role so the proxy can block non-owner pages and APIs before they reach server handlers.

**Tech Stack:** Next.js App Router, React client forms, TypeScript, Vitest, better-sqlite3, Resend SDK, existing shadcn/Base UI components.

---

## File Structure

- Modify `package.json` and `package-lock.json`: add `resend`.
- Modify `.env.example`: add Resend and panel owner email environment variables.
- Create `src/lib/server/panel-users.ts`: SQLite-backed user store, legacy migration, PIN hashing, reset-token lifecycle, role validation.
- Create `src/lib/server/panel-users.test.ts`: user-store migration, auth, create/update, role, and reset-token tests.
- Modify `src/lib/server/auth.ts`: delegate account operations to the SQLite user store while preserving the existing exported route-facing API names.
- Modify `src/lib/auth-token.ts`: session subject becomes the panel user id and role is signed into the token.
- Create `src/lib/server/email.ts`: Resend config, transport, welcome email, reset email.
- Create `src/lib/server/email.test.ts`: email config and message composition tests.
- Modify auth routes: `src/app/api/auth/login/route.ts`, `src/app/api/auth/account/route.ts`, `src/app/api/auth/session/route.ts`.
- Create recovery routes: `src/app/api/auth/recovery/request/route.ts`, `src/app/api/auth/recovery/reset/route.ts`.
- Create users routes: `src/app/api/users/route.ts`, `src/app/api/users/[id]/role/route.ts`.
- Modify `src/proxy.ts`: allow non-owner access only to dashboard, account, logout/session, and recovery routes; block other APIs for non-owner roles.
- Modify navigation/layout: `src/lib/nav.ts`, `src/components/layout/sidebar.tsx`, `src/components/layout/sidebar-nav.tsx`, `src/components/layout/mobile-nav.tsx`, `src/components/layout/topbar.tsx`, `src/app/(panel)/layout.tsx`.
- Split dashboard: create `src/components/panel/owner-dashboard.tsx` from the current dashboard body, create `src/components/panel/limited-dashboard.tsx`, and modify `src/app/(panel)/page.tsx` to choose by role.
- Modify account UI: `src/app/(panel)/account/page.tsx`, `src/components/auth/account-form.tsx`.
- Create/reset login UI: modify `src/components/auth/login-form.tsx`, create `src/components/auth/reset-pin-form.tsx`, create `src/app/reset-pin/page.tsx`.
- Replace Users page: `src/app/(panel)/users/page.tsx`, create `src/components/users/users-manager.tsx`.

---

### Task 1: Add Resend Dependency And Environment Documentation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`

- [ ] **Step 1: Install Resend**

Run:

```bash
npm install resend
```

Expected: `package.json` contains a `resend` dependency and `package-lock.json` changes.

- [ ] **Step 2: Document email and owner bootstrap env vars**

In `.env.example`, add this block after the panel authentication section:

```env
# ── Outgoing email / panel users ──────────────────────────────
# Resend powers noreply account emails. Never expose the key in
# browser code. PANEL_OWNER_EMAIL is required once when migrating
# the legacy JSON account into SQLite.
RESEND_API_KEY=
PANEL_EMAIL_FROM=Slutvival <noreply@mail.slutvival.com>
PANEL_PUBLIC_URL=https://panel.slutvival.com
PANEL_OWNER_EMAIL=
```

- [ ] **Step 3: Verify dependency install**

Run:

```bash
npm ls resend
```

Expected: exits `0` and prints the installed `resend` package.

- [ ] **Step 4: Commit**

Run:

```bash
git add package.json package-lock.json .env.example
git commit -m "Add Resend panel email configuration"
```

---

### Task 2: Add SQLite Panel User Store

**Files:**
- Create: `src/lib/server/panel-users.ts`
- Create: `src/lib/server/panel-users.test.ts`

- [ ] **Step 1: Write failing user-store tests**

Create `src/lib/server/panel-users.test.ts`:

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PanelUserStore, type PanelRole } from "./panel-users";

let dir = "";

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "slutvival-users-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

function dbPath() {
  return path.join(dir, "panel.sqlite");
}

function writeLegacyAuth(username = "Admin", pin = "9876") {
  const salt = randomBytes(16).toString("hex");
  const legacy = {
    username,
    pinSalt: salt,
    pinHash: pbkdf2Sync(pin, salt, 120_000, 32, "sha256").toString("hex"),
    updatedAt: 1_000,
  };
  const file = path.join(dir, "panel-auth.json");
  return fs.writeFile(file, `${JSON.stringify(legacy, null, 2)}\n`).then(() => file);
}

describe("PanelUserStore", () => {
  it("migrates the legacy JSON account as owner when no SQLite users exist", async () => {
    const legacyAuthFile = await writeLegacyAuth("Admin", "9876");
    const store = new PanelUserStore({
      dbFile: dbPath(),
      legacyAuthFile,
      ownerEmail: "owner@example.com",
    });

    const user = await store.authenticate("Admin", "9876");

    expect(user).toMatchObject({
      username: "Admin",
      email: "owner@example.com",
      role: "owner",
    });
  });

  it("requires PANEL_OWNER_EMAIL before migrating the legacy account", async () => {
    const legacyAuthFile = await writeLegacyAuth("Admin", "9876");
    const store = new PanelUserStore({ dbFile: dbPath(), legacyAuthFile });

    await expect(store.listUsers()).rejects.toThrow(/PANEL_OWNER_EMAIL is required/);
  });

  it("creates users with unique username and email", async () => {
    const store = new PanelUserStore({ dbFile: dbPath(), ownerEmail: "owner@example.com" });
    const user = await store.createUser({
      username: "Moderator",
      email: "mod@example.com",
      role: "moderator",
      pin: "1234",
    });

    expect(user).toMatchObject({
      username: "Moderator",
      email: "mod@example.com",
      role: "moderator",
    });
    await expect(
      store.createUser({
        username: "Moderator",
        email: "other@example.com",
        role: "viewer",
        pin: "1234",
      }),
    ).rejects.toThrow(/Username is already in use/);
    await expect(
      store.createUser({
        username: "Other",
        email: "mod@example.com",
        role: "viewer",
        pin: "1234",
      }),
    ).rejects.toThrow(/Email is already in use/);
  });

  it("authenticates by username and PIN", async () => {
    const store = new PanelUserStore({ dbFile: dbPath(), ownerEmail: "owner@example.com" });
    await store.createUser({
      username: "Viewer",
      email: "viewer@example.com",
      role: "viewer",
      pin: "4444",
    });

    expect(await store.authenticate("Viewer", "4444")).toMatchObject({ role: "viewer" });
    expect(await store.authenticate("Viewer", "9999")).toBeNull();
  });

  it("updates a signed-in user's username, email, and PIN", async () => {
    const store = new PanelUserStore({ dbFile: dbPath(), ownerEmail: "owner@example.com" });
    const user = await store.createUser({
      username: "Viewer",
      email: "viewer@example.com",
      role: "viewer",
      pin: "4444",
    });

    const updated = await store.updateOwnAccount(user.id, {
      username: "ViewerTwo",
      email: "viewer2@example.com",
      pin: "5555",
    });

    expect(updated).toMatchObject({
      username: "ViewerTwo",
      email: "viewer2@example.com",
      role: "viewer",
    });
    expect(await store.authenticate("ViewerTwo", "5555")).not.toBeNull();
    expect(await store.authenticate("Viewer", "4444")).toBeNull();
  });

  it("creates, verifies, expires, and clears PIN reset tokens", async () => {
    const store = new PanelUserStore({ dbFile: dbPath(), ownerEmail: "owner@example.com" });
    const user = await store.createUser({
      username: "Viewer",
      email: "viewer@example.com",
      role: "viewer",
      pin: "4444",
    });

    const reset = await store.createPinReset("viewer@example.com", 1_000, () => "plain-token");

    expect(reset.status).toBe("created");
    if (reset.status !== "created") throw new Error("Expected reset token");
    expect(reset.user.email).toBe("viewer@example.com");
    expect(reset.token).toBe("plain-token");
    expect(await store.resetPinWithToken("plain-token", "5555", 2_000)).toMatchObject({
      id: user.id,
    });
    expect(await store.authenticate("Viewer", "5555")).not.toBeNull();
    expect(await store.resetPinWithToken("plain-token", "6666", 3_000)).toBeNull();
  });

  it("rate limits active PIN reset requests", async () => {
    const store = new PanelUserStore({ dbFile: dbPath(), ownerEmail: "owner@example.com" });
    await store.createUser({
      username: "Viewer",
      email: "viewer@example.com",
      role: "viewer",
      pin: "4444",
    });

    await store.createPinReset("Viewer", 1_000, () => "first-token");
    const reset = await store.createPinReset("viewer@example.com", 61_000, () => "second-token");

    expect(reset.status).toBe("cooldown");
    if (reset.status === "cooldown") expect(reset.retryAfterMs).toBe(240_000);
  });

  it("validates roles", () => {
    expect(PanelUserStore.isRole("owner")).toBe(true);
    expect(PanelUserStore.isRole("admin")).toBe(true);
    expect(PanelUserStore.isRole("moderator")).toBe(true);
    expect(PanelUserStore.isRole("viewer")).toBe(true);
    expect(PanelUserStore.isRole("superadmin" as PanelRole)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/lib/server/panel-users.test.ts
```

Expected: FAIL because `src/lib/server/panel-users.ts` does not exist.

- [ ] **Step 3: Implement the user store module**

Create `src/lib/server/panel-users.ts`. Include these exported types and constants:

```ts
import fs from "node:fs";
import path from "node:path";
import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import Database from "better-sqlite3";
import { config } from "./config";

export type PanelRole = "owner" | "admin" | "moderator" | "viewer";

export type PanelUser = {
  id: string;
  username: string;
  email: string;
  role: PanelRole;
  createdAt: number;
  updatedAt: number;
  lastLoginAt?: number;
};

export type CreatePanelUserInput = {
  username: string;
  email: string;
  role: PanelRole;
  pin: string;
};

export type UpdateOwnAccountInput = {
  username: string;
  email: string;
  pin?: string;
};

export type PinResetResult =
  | { status: "created"; user: PanelUser; token: string; expiresAt: number }
  | { status: "unknown" }
  | { status: "cooldown"; retryAfterMs: number };

type StoreOptions = {
  dbFile?: string;
  legacyAuthFile?: string;
  ownerEmail?: string;
};

const DEFAULT_DB_FILE = "/opt/slutvival/data/slutvival-panel.sqlite";
const HASH_ITERATIONS = 120_000;
const HASH_LENGTH = 32;
const PIN_RESET_TTL_MS = 30 * 60 * 1000;
const PIN_RESET_COOLDOWN_MS = 5 * 60 * 1000;
const ROLES: PanelRole[] = ["owner", "admin", "moderator", "viewer"];
```

Implement the class with this public interface:

```ts
export class PanelUserStore {
  private db: Database.Database;
  private legacyAuthFile: string;
  private ownerEmail?: string;
  private bootstrapped = false;

  constructor(options: StoreOptions = {}) {
    const dbFile = options.dbFile ?? process.env.SLUTVIVAL_PANEL_DB ?? DEFAULT_DB_FILE;
    this.legacyAuthFile =
      options.legacyAuthFile ??
      process.env.SLUTVIVAL_AUTH_FILE ??
      path.join(config.root, "data", "panel-auth.json");
    this.ownerEmail = normalizeEmail(options.ownerEmail ?? process.env.PANEL_OWNER_EMAIL);
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
    this.db = new Database(dbFile);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 5000");
    this.migrate();
  }

  static isRole(value: string): value is PanelRole {
    return ROLES.includes(value as PanelRole);
  }

  async listUsers(): Promise<PanelUser[]> {
    this.ensureBootstrap();
    return this.db
      .prepare("select * from panel_users order by created_at asc")
      .all()
      .map((row) => toUser(row as PanelUserRow));
  }

  async getUserById(id: string): Promise<PanelUser | null> {
    this.ensureBootstrap();
    const row = this.db.prepare("select * from panel_users where id = ?").get(id) as
      | PanelUserRow
      | undefined;
    return row ? toUser(row) : null;
  }

  async authenticate(username: string, pin: string, now = Date.now()): Promise<PanelUser | null> {
    this.ensureBootstrap();
    const row = this.db.prepare("select * from panel_users where lower(username) = lower(?)").get(username.trim()) as
      | PanelUserRow
      | undefined;
    if (!row || !verifyPin(pin, row.pin_salt, row.pin_hash)) return null;
    this.db.prepare("update panel_users set last_login_at = ? where id = ?").run(now, row.id);
    return { ...toUser(row), lastLoginAt: now };
  }

  async createUser(input: CreatePanelUserInput, now = Date.now()): Promise<PanelUser> {
    this.ensureBootstrap();
    const username = normalizeUsername(input.username);
    const email = requireEmail(input.email);
    if (!PanelUserStore.isRole(input.role)) throw new Error("Invalid role.");
    const pinError = validatePin(input.pin);
    if (pinError) throw new Error(pinError);
    this.assertUniqueUsername(username);
    this.assertUniqueEmail(email);
    const salt = randomBytes(16).toString("hex");
    const id = randomBytes(16).toString("hex");
    this.db
      .prepare(`
        insert into panel_users (
          id, username, email, role, pin_salt, pin_hash, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(id, username, email, input.role, salt, hashPin(input.pin, salt), now, now);
    return (await this.getUserById(id))!;
  }

  async updateOwnAccount(id: string, input: UpdateOwnAccountInput, now = Date.now()): Promise<PanelUser> {
    this.ensureBootstrap();
    const current = await this.getUserById(id);
    if (!current) throw new Error("Account not found.");
    const username = normalizeUsername(input.username);
    const email = requireEmail(input.email);
    this.assertUniqueUsername(username, id);
    this.assertUniqueEmail(email, id);

    if (input.pin) {
      const pinError = validatePin(input.pin);
      if (pinError) throw new Error(pinError);
      const salt = randomBytes(16).toString("hex");
      this.db
        .prepare(`
          update panel_users
          set username = ?, email = ?, pin_salt = ?, pin_hash = ?,
              pin_reset_token_hash = null, pin_reset_expires_at = null,
              pin_reset_requested_at = null, updated_at = ?
          where id = ?
        `)
        .run(username, email, salt, hashPin(input.pin, salt), now, id);
    } else {
      this.db
        .prepare("update panel_users set username = ?, email = ?, updated_at = ? where id = ?")
        .run(username, email, now, id);
    }

    return (await this.getUserById(id))!;
  }

  async updateRole(id: string, role: PanelRole, now = Date.now()): Promise<PanelUser> {
    this.ensureBootstrap();
    if (!PanelUserStore.isRole(role)) throw new Error("Invalid role.");
    this.db.prepare("update panel_users set role = ?, updated_at = ? where id = ?").run(role, now, id);
    const user = await this.getUserById(id);
    if (!user) throw new Error("User not found.");
    return user;
  }

  async createPinReset(identifier: string, now = Date.now(), tokenFactory = generateResetToken): Promise<PinResetResult> {
    this.ensureBootstrap();
    const user = this.findByUsernameOrEmail(identifier);
    if (!user) return { status: "unknown" };
    if (user.pin_reset_token_hash && user.pin_reset_expires_at && user.pin_reset_expires_at > now) {
      const nextAllowedAt = (user.pin_reset_requested_at ?? 0) + PIN_RESET_COOLDOWN_MS;
      if (nextAllowedAt > now) return { status: "cooldown", retryAfterMs: nextAllowedAt - now };
    }
    const token = tokenFactory();
    const expiresAt = now + PIN_RESET_TTL_MS;
    this.db
      .prepare(`
        update panel_users
        set pin_reset_token_hash = ?, pin_reset_expires_at = ?, pin_reset_requested_at = ?, updated_at = ?
        where id = ?
      `)
      .run(hashResetToken(token), expiresAt, now, now, user.id);
    return { status: "created", user: toUser(user), token, expiresAt };
  }

  async resetPinWithToken(token: string, pin: string, now = Date.now()): Promise<PanelUser | null> {
    this.ensureBootstrap();
    const pinError = validatePin(pin);
    if (pinError) throw new Error(pinError);
    const rows = this.db
      .prepare("select * from panel_users where pin_reset_token_hash is not null")
      .all() as PanelUserRow[];
    const row = rows.find((candidate) => verifyResetToken(token, candidate.pin_reset_token_hash ?? ""));
    if (!row) return null;
    if (!row.pin_reset_expires_at || row.pin_reset_expires_at <= now) {
      this.clearPinReset(row.id, now);
      return null;
    }
    const salt = randomBytes(16).toString("hex");
    this.db
      .prepare(`
        update panel_users
        set pin_salt = ?, pin_hash = ?, pin_reset_token_hash = null,
            pin_reset_expires_at = null, pin_reset_requested_at = null, updated_at = ?
        where id = ?
      `)
      .run(salt, hashPin(pin, salt), now, row.id);
    return (await this.getUserById(row.id))!;
  }

  rollbackCreatedUser(id: string): void {
    this.db.prepare("delete from panel_users where id = ?").run(id);
  }
}
```

Add private methods and helpers for migration:

```ts
type PanelUserRow = {
  id: string;
  username: string;
  email: string;
  role: PanelRole;
  pin_salt: string;
  pin_hash: string;
  pin_reset_token_hash: string | null;
  pin_reset_expires_at: number | null;
  pin_reset_requested_at: number | null;
  created_at: number;
  updated_at: number;
  last_login_at: number | null;
};

type LegacyAccount = {
  username: string;
  pinSalt: string;
  pinHash: string;
  updatedAt: number;
};
```

Inside `PanelUserStore`, implement:

```ts
  private migrate(): void {
    this.db.exec(`
      create table if not exists panel_users (
        id text primary key,
        username text not null unique,
        email text not null unique,
        role text not null,
        pin_salt text not null,
        pin_hash text not null,
        pin_reset_token_hash text,
        pin_reset_expires_at integer,
        pin_reset_requested_at integer,
        created_at integer not null,
        updated_at integer not null,
        last_login_at integer
      );
      create index if not exists idx_panel_users_role on panel_users(role);
      create index if not exists idx_panel_users_email_lower on panel_users(email);
    `);
  }

  private ensureBootstrap(): void {
    if (this.bootstrapped) return;
    const count = this.db.prepare("select count(*) as count from panel_users").get() as { count: number };
    if (count.count === 0) this.bootstrapOwner();
    this.bootstrapped = true;
  }

  private bootstrapOwner(): void {
    const email = this.ownerEmail;
    if (!email) throw new Error("PANEL_OWNER_EMAIL is required to migrate the owner account.");
    const legacy = readLegacyAccount(this.legacyAuthFile) ?? defaultLegacyAccount();
    const now = Date.now();
    this.db
      .prepare(`
        insert into panel_users (
          id, username, email, role, pin_salt, pin_hash, created_at, updated_at
        ) values (?, ?, ?, 'owner', ?, ?, ?, ?)
      `)
      .run(
        randomBytes(16).toString("hex"),
        normalizeUsername(legacy.username),
        email,
        legacy.pinSalt,
        legacy.pinHash,
        legacy.updatedAt || now,
        now,
      );
  }

  private findByUsernameOrEmail(identifier: string): PanelUserRow | null {
    const normalized = identifier.trim();
    if (!normalized) return null;
    const row = this.db
      .prepare("select * from panel_users where lower(username) = lower(?) or lower(email) = lower(?)")
      .get(normalized, normalized) as PanelUserRow | undefined;
    return row ?? null;
  }

  private clearPinReset(id: string, now = Date.now()): void {
    this.db
      .prepare(`
        update panel_users
        set pin_reset_token_hash = null, pin_reset_expires_at = null,
            pin_reset_requested_at = null, updated_at = ?
        where id = ?
      `)
      .run(now, id);
  }

  private assertUniqueUsername(username: string, exceptId?: string): void {
    const row = this.db
      .prepare("select id from panel_users where lower(username) = lower(?)")
      .get(username) as { id: string } | undefined;
    if (row && row.id !== exceptId) throw new Error("Username is already in use.");
  }

  private assertUniqueEmail(email: string, exceptId?: string): void {
    const row = this.db
      .prepare("select id from panel_users where lower(email) = lower(?)")
      .get(email) as { id: string } | undefined;
    if (row && row.id !== exceptId) throw new Error("Email is already in use.");
  }
```

Add helpers:

```ts
export function validatePin(pin: string): string | null {
  if (!/^\d{4,12}$/.test(pin)) return "PIN must be 4 to 12 digits.";
  return null;
}

export function normalizeUsername(username: string): string {
  const next = username.trim();
  if (next.length < 2) throw new Error("Username must be at least 2 characters.");
  if (next.length > 32) throw new Error("Username must be 32 characters or less.");
  return next;
}

function requireEmail(email: string): string {
  const normalized = normalizeEmail(email);
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("A valid email address is required.");
  }
  return normalized;
}

function normalizeEmail(email: string | undefined): string | undefined {
  return email?.trim().toLowerCase() || undefined;
}

function hashPin(pin: string, salt: string): string {
  return pbkdf2Sync(pin, salt, HASH_ITERATIONS, HASH_LENGTH, "sha256").toString("hex");
}

function verifyPin(pin: string, salt: string, expectedHash: string): boolean {
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(hashPin(pin, salt), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

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

function toUser(row: PanelUserRow): PanelUser {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at ?? undefined,
  };
}

function readLegacyAccount(file: string): LegacyAccount | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<LegacyAccount>;
    if (!parsed.username || !parsed.pinSalt || !parsed.pinHash) return null;
    return {
      username: parsed.username,
      pinSalt: parsed.pinSalt,
      pinHash: parsed.pinHash,
      updatedAt: parsed.updatedAt ?? Date.now(),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function defaultLegacyAccount(): LegacyAccount {
  const salt = randomBytes(16).toString("hex");
  return {
    username: "Admin",
    pinSalt: salt,
    pinHash: hashPin("9876", salt),
    updatedAt: Date.now(),
  };
}
```

- [ ] **Step 4: Run user-store tests**

Run:

```bash
npm test -- src/lib/server/panel-users.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/lib/server/panel-users.ts src/lib/server/panel-users.test.ts
git commit -m "Add SQLite panel user store"
```

---

### Task 3: Move Auth Boundary To SQLite Users

**Files:**
- Modify: `src/lib/auth-token.ts`
- Modify: `src/lib/server/auth.ts`
- Modify: `src/app/api/auth/login/route.ts`
- Modify: `src/app/api/auth/account/route.ts`
- Modify: `src/app/api/auth/session/route.ts`

- [ ] **Step 1: Update signed session token shape**

Modify `src/lib/auth-token.ts`:

```ts
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
```

In `verifySessionToken`, require `v === 2`, `typeof sub === "string"`, and `role` to be one of the panel roles:

```ts
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
```

Add:

```ts
function isSessionRole(value: unknown): value is PanelRole {
  return value === "owner" || value === "admin" || value === "moderator" || value === "viewer";
}
```

- [ ] **Step 2: Refactor `auth.ts` to delegate to `PanelUserStore`**

Replace JSON account logic in `src/lib/server/auth.ts` with this boundary:

```ts
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-token";
import {
  PanelUserStore,
  normalizeUsername,
  validatePin,
  type PanelRole,
  type PanelUser,
} from "./panel-users";

export type PanelAccount = PanelUser;

export type SessionAccount = {
  account: PanelAccount;
  expiresAt: number;
};

const store = new PanelUserStore();

export async function getAccount(): Promise<PanelAccount> {
  const users = await store.listUsers();
  const owner = users.find((user) => user.role === "owner");
  if (!owner) throw new Error("Owner account is not configured.");
  return owner;
}

export async function listPanelUsers(): Promise<PanelUser[]> {
  return store.listUsers();
}

export async function createPanelUser(input: {
  username: string;
  email: string;
  role: PanelRole;
  pin: string;
}): Promise<PanelUser> {
  return store.createUser(input);
}

export async function updatePanelUserRole(id: string, role: PanelRole): Promise<PanelUser> {
  return store.updateRole(id, role);
}

export async function rollbackCreatedPanelUser(id: string): Promise<void> {
  store.rollbackCreatedUser(id);
}

export async function authenticate(username: string, pin: string): Promise<PanelAccount | null> {
  return store.authenticate(username, pin);
}

export async function updateAccount(input: {
  userId: string;
  username: string;
  email: string;
  pin?: string;
}): Promise<PanelAccount> {
  return store.updateOwnAccount(input.userId, {
    username: input.username,
    email: input.email,
    pin: input.pin,
  });
}

export async function createPinReset(identifier: string) {
  return store.createPinReset(identifier);
}

export async function resetPinWithToken(token: string, pin: string) {
  return store.resetPinWithToken(token, pin);
}

export async function getSessionAccount(): Promise<SessionAccount | null> {
  const cookieStore = await cookies();
  const payload = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!payload) return null;

  const account = await store.getUserById(payload.sub);
  if (!account) return null;

  return {
    account,
    expiresAt: payload.exp * 1000,
  };
}

export function requireOwner(session: SessionAccount | null): PanelAccount {
  if (!session || session.account.role !== "owner") {
    throw new Error("Owner access is required.");
  }
  return session.account;
}

export { normalizeUsername, validatePin };
```

- [ ] **Step 3: Update login route to sign user id and role**

In `src/app/api/auth/login/route.ts`, change token creation:

```ts
cookieStore.set(SESSION_COOKIE, await createSessionToken(account.id, account.role), {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
});
```

- [ ] **Step 4: Update account route to include email and user id**

In `src/app/api/auth/account/route.ts`, parse `email` and call:

```ts
const account = await updateAccount({
  userId: session.account.id,
  username,
  email,
  pin: pin || undefined,
});
```

Require email:

```ts
const email = body.email?.trim() ?? "";
if (!email) {
  return Response.json({ error: "Email is required." }, { status: 400 });
}
```

- [ ] **Step 5: Run auth-adjacent checks**

Run:

```bash
npm test -- src/lib/server/panel-users.test.ts
npm run typecheck
```

Expected: tests pass and typecheck passes.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/lib/auth-token.ts src/lib/server/auth.ts src/app/api/auth/login/route.ts src/app/api/auth/account/route.ts src/app/api/auth/session/route.ts
git commit -m "Use SQLite panel users for auth"
```

---

### Task 4: Add Resend Email Boundary

**Files:**
- Create: `src/lib/server/email.ts`
- Create: `src/lib/server/email.test.ts`

- [ ] **Step 1: Write failing email tests**

Create `src/lib/server/email.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  buildPinResetEmail,
  buildWelcomeEmail,
  readEmailConfig,
  requireEmailConfig,
  sendPinResetEmail,
  sendWelcomeEmail,
} from "./email";

describe("readEmailConfig", () => {
  it("returns trimmed config when required values are present", () => {
    expect(
      readEmailConfig({
        RESEND_API_KEY: " re_test ",
        PANEL_EMAIL_FROM: " Slutvival <noreply@mail.slutvival.com> ",
        PANEL_PUBLIC_URL: " https://panel.slutvival.com/ ",
      }),
    ).toEqual({
      apiKey: "re_test",
      from: "Slutvival <noreply@mail.slutvival.com>",
      publicUrl: "https://panel.slutvival.com",
    });
  });

  it("returns null when email is not configured", () => {
    expect(readEmailConfig({})).toBeNull();
  });

  it("throws for partial config", () => {
    expect(() => requireEmailConfig({ RESEND_API_KEY: "re_test" })).toThrow(
      /Panel email configuration is incomplete/,
    );
  });
});

describe("email builders", () => {
  it("builds welcome email with username, role, and starting PIN", () => {
    const email = buildWelcomeEmail({
      loginUrl: "https://panel.slutvival.com/login",
      username: "Viewer",
      role: "viewer",
      pin: "1234",
    });

    expect(email.subject).toBe("Your Slutvival Panel login");
    expect(email.text).toContain("Viewer");
    expect(email.text).toContain("viewer");
    expect(email.text).toContain("1234");
    expect(email.html).toContain("https://panel.slutvival.com/login");
  });

  it("builds reset email with reset URL", () => {
    const email = buildPinResetEmail({
      resetUrl: "https://panel.slutvival.com/reset-pin?token=abc",
      expiresAt: new Date("2026-07-04T12:30:00.000Z"),
    });

    expect(email.subject).toBe("Reset your Slutvival Panel PIN");
    expect(email.text).toContain("https://panel.slutvival.com/reset-pin?token=abc");
    expect(email.html).toContain("https://panel.slutvival.com/reset-pin?token=abc");
  });
});

describe("send helpers", () => {
  it("sends welcome email through the provided transport", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await sendWelcomeEmail(
      {
        to: "viewer@example.com",
        loginUrl: "https://panel.slutvival.com/login",
        username: "Viewer",
        role: "viewer",
        pin: "1234",
      },
      {
        apiKey: "re_test",
        from: "Slutvival <noreply@mail.slutvival.com>",
        publicUrl: "https://panel.slutvival.com",
      },
      { send },
    );

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Slutvival <noreply@mail.slutvival.com>",
        to: "viewer@example.com",
        subject: "Your Slutvival Panel login",
      }),
    );
  });

  it("sends PIN reset email through the provided transport", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await sendPinResetEmail(
      {
        to: "viewer@example.com",
        resetUrl: "https://panel.slutvival.com/reset-pin?token=abc",
        expiresAt: new Date("2026-07-04T12:30:00.000Z"),
      },
      {
        apiKey: "re_test",
        from: "Slutvival <noreply@mail.slutvival.com>",
        publicUrl: "https://panel.slutvival.com",
      },
      { send },
    );

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "viewer@example.com",
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

- [ ] **Step 3: Implement email module**

Create `src/lib/server/email.ts`:

```ts
import { Resend } from "resend";
import type { PanelRole } from "./panel-users";

export type EmailEnv = Record<string, string | undefined>;
export type EmailConfig = {
  apiKey: string;
  from: string;
  publicUrl: string;
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

export function readEmailConfig(env: EmailEnv = process.env): EmailConfig | null {
  const apiKey = optionalTrimmed(env.RESEND_API_KEY);
  const from = optionalTrimmed(env.PANEL_EMAIL_FROM);
  const publicUrl = normalizePublicUrl(optionalTrimmed(env.PANEL_PUBLIC_URL));
  const values = [apiKey, from, publicUrl];
  if (values.every((value) => !value)) return null;
  if (values.some((value) => !value)) {
    throw new Error("Panel email configuration is incomplete.");
  }
  return { apiKey: apiKey!, from: from!, publicUrl: publicUrl! };
}

export function requireEmailConfig(env: EmailEnv = process.env): EmailConfig {
  const config = readEmailConfig(env);
  if (!config) throw new Error("Panel email is not configured.");
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
      if (error) throw new Error(error.message || "Resend rejected the email.");
    },
  };
}

export function buildWelcomeEmail(input: {
  loginUrl: string;
  username: string;
  role: PanelRole;
  pin: string;
}) {
  return {
    subject: "Your Slutvival Panel login",
    text: [
      "A Slutvival Panel account has been created for you.",
      "",
      `Login: ${input.loginUrl}`,
      `Username: ${input.username}`,
      `Role: ${input.role}`,
      `Starting PIN: ${input.pin}`,
      "",
      "Sign in and change your PIN from Account settings.",
    ].join("\n"),
    html: [
      "<p>A Slutvival Panel account has been created for you.</p>",
      `<p><a href="${escapeHtml(input.loginUrl)}">Open Slutvival Panel</a></p>`,
      "<ul>",
      `<li><strong>Username:</strong> ${escapeHtml(input.username)}</li>`,
      `<li><strong>Role:</strong> ${escapeHtml(input.role)}</li>`,
      `<li><strong>Starting PIN:</strong> ${escapeHtml(input.pin)}</li>`,
      "</ul>",
      "<p>Sign in and change your PIN from Account settings.</p>",
    ].join(""),
  };
}

export function buildPinResetEmail(input: { resetUrl: string; expiresAt: Date }) {
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

export async function sendWelcomeEmail(
  input: { to: string; loginUrl: string; username: string; role: PanelRole; pin: string },
  config: EmailConfig = requireEmailConfig(),
  transport: EmailTransport = createResendTransport(config.apiKey),
) {
  const content = buildWelcomeEmail(input);
  await transport.send({ from: config.from, to: input.to, ...content });
}

export async function sendPinResetEmail(
  input: { to: string; resetUrl: string; expiresAt: Date },
  config: EmailConfig = requireEmailConfig(),
  transport: EmailTransport = createResendTransport(config.apiKey),
) {
  const content = buildPinResetEmail(input);
  await transport.send({ from: config.from, to: input.to, ...content });
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
git commit -m "Add panel account email sender"
```

---

### Task 5: Add PIN Recovery API And Public Reset Page

**Files:**
- Create: `src/app/api/auth/recovery/request/route.ts`
- Create: `src/app/api/auth/recovery/reset/route.ts`
- Modify: `src/components/auth/login-form.tsx`
- Create: `src/components/auth/reset-pin-form.tsx`
- Create: `src/app/reset-pin/page.tsx`

- [ ] **Step 1: Add recovery request route**

Create `src/app/api/auth/recovery/request/route.ts`:

```ts
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
```

- [ ] **Step 2: Add reset route**

Create `src/app/api/auth/recovery/reset/route.ts`:

```ts
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
```

- [ ] **Step 3: Replace Forgot PIN toast with recovery dialog**

In `src/components/auth/login-form.tsx`, add dialog imports and state. The submit body for recovery should call:

```ts
const response = await fetch("/api/auth/recovery/request", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identifier: recoveryIdentifier }),
});
```

The dialog should use label text `Username or email` and the button text `Send reset link`.

- [ ] **Step 4: Add reset form and page**

Create `src/components/auth/reset-pin-form.tsx` with the same PIN/confirm-PIN behavior as Account settings. It posts:

```ts
await fetch("/api/auth/recovery/reset", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ token, pin }),
});
```

Create `src/app/reset-pin/page.tsx` as a public page that reads `searchParams.token`, renders `ResetPinForm` when a token exists, and shows `This reset link is missing a token.` otherwise.

- [ ] **Step 5: Run checks**

Run:

```bash
npm test -- src/lib/server/panel-users.test.ts src/lib/server/email.test.ts
npm run typecheck
```

Expected: tests pass and typecheck passes.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/app/api/auth/recovery/request/route.ts src/app/api/auth/recovery/reset/route.ts src/components/auth/login-form.tsx src/components/auth/reset-pin-form.tsx src/app/reset-pin/page.tsx
git commit -m "Add stored-email PIN recovery"
```

---

### Task 6: Add Owner User Management

**Files:**
- Create: `src/app/api/users/route.ts`
- Create: `src/app/api/users/[id]/role/route.ts`
- Modify: `src/app/(panel)/users/page.tsx`
- Create: `src/components/users/users-manager.tsx`
- Modify: `src/lib/nav.ts`

- [ ] **Step 1: Add users API route**

Create `src/app/api/users/route.ts`:

```ts
import { getSessionAccount, createPanelUser, listPanelUsers, rollbackCreatedPanelUser } from "@/lib/server/auth";
import { requireEmailConfig, sendWelcomeEmail } from "@/lib/server/email";
import { PanelUserStore, type PanelRole } from "@/lib/server/panel-users";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isOwner(session: Awaited<ReturnType<typeof getSessionAccount>>) {
  return session?.account.role === "owner";
}

export async function GET() {
  const session = await getSessionAccount();
  if (!isOwner(session)) return Response.json({ error: "Forbidden" }, { status: 403 });
  return Response.json({ users: await listPanelUsers() });
}

export async function POST(req: Request) {
  const session = await getSessionAccount();
  if (!isOwner(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    username?: string;
    email?: string;
    role?: string;
    pin?: string;
  };
  const role = body.role;
  if (!role || !PanelUserStore.isRole(role) || role === "owner") {
    return Response.json({ error: "Role must be admin, moderator, or viewer." }, { status: 400 });
  }

  let emailConfig;
  try {
    emailConfig = requireEmailConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Panel email is not configured.";
    return Response.json({ error: message }, { status: 503 });
  }

  let user;
  try {
    user = await createPanelUser({
      username: body.username ?? "",
      email: body.email ?? "",
      role: role as PanelRole,
      pin: body.pin ?? "",
    });
    await sendWelcomeEmail(
      {
        to: user.email,
        loginUrl: `${emailConfig.publicUrl}/login`,
        username: user.username,
        role: user.role,
        pin: body.pin ?? "",
      },
      emailConfig,
    );
  } catch (error) {
    if (user) await rollbackCreatedPanelUser(user.id);
    const message = error instanceof Error ? error.message : "User creation failed.";
    return Response.json({ error: message }, { status: 400 });
  }

  return Response.json({ ok: true, user });
}
```

- [ ] **Step 2: Add role update route**

Create `src/app/api/users/[id]/role/route.ts`:

```ts
import { getSessionAccount, updatePanelUserRole } from "@/lib/server/auth";
import { PanelUserStore } from "@/lib/server/panel-users";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionAccount();
  if (session?.account.role !== "owner") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (id === session.account.id) {
    return Response.json({ error: "You cannot change your own owner role." }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { role?: string };
  if (!body.role || !PanelUserStore.isRole(body.role) || body.role === "owner") {
    return Response.json({ error: "Role must be admin, moderator, or viewer." }, { status: 400 });
  }

  try {
    const user = await updatePanelUserRole(id, body.role);
    return Response.json({ ok: true, user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Role update failed.";
    return Response.json({ error: message }, { status: 400 });
  }
}
```

- [ ] **Step 3: Replace Users page**

Modify `src/app/(panel)/users/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { UsersIcon } from "lucide-react";
import { PageHeader } from "@/components/panel/page-header";
import { SectionCard } from "@/components/panel/section-card";
import { UsersManager } from "@/components/users/users-manager";
import { getSessionAccount, listPanelUsers } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await getSessionAccount();
  if (!session) redirect("/login");
  if (session.account.role !== "owner") redirect("/");

  const users = await listPanelUsers();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Users & Roles" description="Create panel users and assign initial roles." icon={UsersIcon} />
      <SectionCard>
        <UsersManager users={users} currentUserId={session.account.id} />
      </SectionCard>
    </div>
  );
}
```

- [ ] **Step 4: Create UsersManager client component**

Create `src/components/users/users-manager.tsx`. It should:

- Render a compact create form for username, email, role select, and starting PIN.
- POST to `/api/users`.
- Render existing users with username, email, role, and last login.
- Allow owner to change non-owner roles through `PATCH /api/users/{id}/role`.
- Disable role changes for the current owner row.

Use this prop type:

```ts
import type { PanelUser, PanelRole } from "@/lib/server/panel-users";

export function UsersManager({
  users: initialUsers,
  currentUserId,
}: {
  users: PanelUser[];
  currentUserId: string;
}) {
  // implementation lives here
}
```

Use role options:

```ts
const ROLE_OPTIONS: Exclude<PanelRole, "owner">[] = ["admin", "moderator", "viewer"];
```

- [ ] **Step 5: Mark Users nav as available**

In `src/lib/nav.ts`, change Users nav item:

```ts
{ label: "Users & Roles", href: "/users", icon: Users, available: true },
```

- [ ] **Step 6: Run checks**

Run:

```bash
npm run typecheck
npm run lint
```

Expected: typecheck and lint pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/app/api/users/route.ts src/app/api/users/[id]/role/route.ts 'src/app/(panel)/users/page.tsx' src/components/users/users-manager.tsx src/lib/nav.ts
git commit -m "Add owner user management"
```

---

### Task 7: Gate Non-Owner Access And Limited Dashboard

**Files:**
- Modify: `src/proxy.ts`
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `src/components/layout/sidebar-nav.tsx`
- Modify: `src/components/layout/mobile-nav.tsx`
- Modify: `src/components/layout/topbar.tsx`
- Modify: `src/app/(panel)/layout.tsx`
- Modify: `src/app/(panel)/page.tsx`
- Create: `src/components/panel/owner-dashboard.tsx`
- Create: `src/components/panel/limited-dashboard.tsx`

- [ ] **Step 1: Update proxy role gating**

Modify `src/proxy.ts`:

```ts
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
```

After session verification:

```ts
if (session && session.role !== "owner") {
  if (pathname.startsWith("/api/") && !AUTH_API_PATHS.has(pathname)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!pathname.startsWith("/api/") && !PUBLIC_PATHS.has(pathname) && !NON_OWNER_PAGE_PATHS.has(pathname)) {
    return NextResponse.redirect(new URL("/", req.url));
  }
}
```

- [ ] **Step 2: Move current dashboard into owner component**

Create `src/components/panel/owner-dashboard.tsx` and move the current contents of `src/app/(panel)/page.tsx` into it. Keep the `"use client";` directive at the top and export:

```ts
export function OwnerDashboard() {
  const { host, history, connected } = useHostMetrics();
  // existing dashboard JSX
}
```

- [ ] **Step 3: Add limited dashboard**

Create `src/components/panel/limited-dashboard.tsx`:

```tsx
import { GaugeIcon } from "lucide-react";
import { PageHeader } from "@/components/panel/page-header";
import { SectionCard } from "@/components/panel/section-card";

export function LimitedDashboard() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard" description="Your panel account is active." icon={GaugeIcon} />
      <SectionCard>
        <p className="py-8 text-center text-sm text-muted-foreground">
          Your role does not have panel tools assigned yet.
        </p>
      </SectionCard>
    </div>
  );
}
```

- [ ] **Step 4: Make dashboard page choose by role**

Replace `src/app/(panel)/page.tsx` with a server component:

```tsx
import { redirect } from "next/navigation";
import { LimitedDashboard } from "@/components/panel/limited-dashboard";
import { OwnerDashboard } from "@/components/panel/owner-dashboard";
import { getSessionAccount } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSessionAccount();
  if (!session) redirect("/login");
  return session.account.role === "owner" ? <OwnerDashboard /> : <LimitedDashboard />;
}
```

- [ ] **Step 5: Filter navigation by role**

Update sidebar/mobile/nav props so `PanelLayout` passes `session.account.role`. In `SidebarNav`, filter:

```ts
const visibleGroups =
  role === "owner"
    ? NAV
    : [{ items: NAV[0].items.filter((item) => item.href === "/") }];
```

Update `Topbar` props to accept email and role:

```ts
export function Topbar({
  username,
  email,
  role,
}: {
  username: string;
  email: string;
  role: string;
}) {
  // render email and role instead of "Local administrator"
}
```

- [ ] **Step 6: Run checks**

Run:

```bash
npm run typecheck
npm run lint
```

Expected: typecheck and lint pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/proxy.ts src/components/layout/sidebar.tsx src/components/layout/sidebar-nav.tsx src/components/layout/mobile-nav.tsx src/components/layout/topbar.tsx 'src/app/(panel)/layout.tsx' 'src/app/(panel)/page.tsx' src/components/panel/owner-dashboard.tsx src/components/panel/limited-dashboard.tsx
git commit -m "Gate non-owner panel access"
```

---

### Task 8: Update Account Profile UI

**Files:**
- Modify: `src/app/(panel)/account/page.tsx`
- Modify: `src/components/auth/account-form.tsx`

- [ ] **Step 1: Pass email to AccountForm**

In `src/app/(panel)/account/page.tsx`, update header copy and component props:

```tsx
<PageHeader
  title="Account"
  description="Update your panel profile and PIN."
  icon={UserIcon}
/>
<SectionCard title="Profile" description="Changes apply to your signed-in panel account.">
  <AccountForm username={session.account.username} email={session.account.email} />
</SectionCard>
```

- [ ] **Step 2: Add email field to AccountForm**

In `src/components/auth/account-form.tsx`, change props and state:

```ts
export function AccountForm({
  username: initialUsername,
  email: initialEmail,
}: {
  username: string;
  email: string;
}) {
  const [username, setUsername] = useState(initialUsername);
  const [email, setEmail] = useState(initialEmail);
  // existing PIN state
}
```

Submit body:

```ts
body: JSON.stringify({ username, email, pin: pin || undefined }),
```

Add email input between username and PIN:

```tsx
<div className="grid gap-1.5">
  <Label htmlFor="account-email">Email</Label>
  <Input
    id="account-email"
    type="email"
    autoComplete="email"
    value={email}
    onChange={(event) => setEmail(event.target.value)}
  />
</div>
```

Disable save when username or email is blank:

```tsx
disabled={busy || !username.trim() || !email.trim()}
```

- [ ] **Step 3: Run checks**

Run:

```bash
npm run typecheck
npm run lint
```

Expected: typecheck and lint pass.

- [ ] **Step 4: Commit**

Run:

```bash
git add 'src/app/(panel)/account/page.tsx' src/components/auth/account-form.tsx
git commit -m "Add account email profile field"
```

---

### Task 9: Full Verification

**Files:**
- No new files.

- [ ] **Step 1: Run tests**

Run:

```bash
npm test
```

Expected: all Vitest test files pass.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: exits `0`.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: exits `0`.

- [ ] **Step 4: Build production bundle**

Run:

```bash
npm run build
```

Expected: exits `0`.

- [ ] **Step 5: Commit verification fixes if any were needed**

If any command required a fix, inspect the files and commit the exact fix:

```bash
git status --short
git commit -m "Fix panel users verification issues"
```

Before running `git commit`, stage only the concrete files shown by `git status --short` that were changed for the verification fix. Expected: no commit is needed when all checks pass without edits.

---

### Task 10: Configure Resend, DNS, Secrets, And Deploy

**Files:**
- Modify outside git: `/opt/slutvival/secrets/slutvival-panel.env`
- Verify outside git: Resend dashboard and Cloudflare DNS.

- [ ] **Step 1: Confirm production values**

Before editing secrets, confirm the real owner email address to use for `PANEL_OWNER_EMAIL`. This must be the owner's recovery email and will be stored on the migrated owner account.

Required production env values are `RESEND_API_KEY`, `PANEL_EMAIL_FROM`, `PANEL_PUBLIC_URL`, and `PANEL_OWNER_EMAIL`. Set `PANEL_EMAIL_FROM` to `Slutvival <noreply@mail.slutvival.com>` and `PANEL_PUBLIC_URL` to `https://panel.slutvival.com`. Set `RESEND_API_KEY` to the secret key already provided by the owner, and set `PANEL_OWNER_EMAIL` to the confirmed owner inbox.

- [ ] **Step 2: Add `mail.slutvival.com` in Resend**

Use the Resend dashboard to add `mail.slutvival.com` as a sending domain. Copy the exact generated DNS records.

Expected: Resend shows pending DNS verification for `mail.slutvival.com`.

- [ ] **Step 3: Add Resend DNS records in Cloudflare**

In Cloudflare, add the exact DKIM, SPF, return-path, and related records generated by Resend. Add a DMARC TXT record for `_dmarc.mail.slutvival.com` if one is not already present:

```text
v=DMARC1; p=none; adkim=s; aspf=s
```

Expected: Resend eventually marks the domain verified.

- [ ] **Step 4: Update production secret env without printing values**

Edit `/opt/slutvival/secrets/slutvival-panel.env` with an editor or a non-echoing shell workflow. Verify only variable names:

```bash
awk -F= '/^[[:space:]]*#/ {next} /^[[:space:]]*$/ {next} {print $1}' /opt/slutvival/secrets/slutvival-panel.env
```

Expected output includes:

```text
RESEND_API_KEY
PANEL_EMAIL_FROM
PANEL_PUBLIC_URL
PANEL_OWNER_EMAIL
```

- [ ] **Step 5: Rebuild and restart panel**

Run:

```bash
cd /opt/slutvival/docker/stacks/slutvival-panel
docker compose up -d --build
```

Expected: `slutvival-panel` is rebuilt and running.

- [ ] **Step 6: Manual verification**

In the browser:

```text
https://panel.slutvival.com/login
```

Verify:

- Legacy owner account migrates and owner can sign in.
- Owner sees full panel navigation and Users page.
- Owner creates a viewer with username, email, and starting PIN.
- Viewer receives welcome email from `noreply@mail.slutvival.com`.
- Viewer signs in and sees only the empty dashboard and Account.
- Viewer cannot open `/vintage-story`, `/users`, or management APIs directly.
- Viewer can update their own username, email, and PIN.
- Forgot PIN sends to the viewer's stored email and the reset link updates the PIN.

- [ ] **Step 7: Push**

Run:

```bash
git status --short --branch
git push origin main
```

Expected: `main` is clean and aligned with `origin/main`.

---

## Self-Review

- Spec coverage: SQLite users, roles, owner-only access, empty non-owner dashboard, create-user welcome emails, stored-email PIN recovery, account profile updates, Resend DNS setup, and production env are covered.
- Scope boundary: delete/disable users, final RBAC permissions, inbound mail, and broader notifications remain out of scope.
- External setup values: Resend DNS records and owner email are not hard-coded because they are deployment values. The plan requires confirming them during Task 10.
- Type consistency: `PanelRole`, `PanelUser`, `PanelUserStore`, `createPinReset`, `resetPinWithToken`, `sendWelcomeEmail`, and `sendPinResetEmail` are introduced before route/UI tasks consume them.
- Verification: focused Vitest coverage is added for storage and email boundaries, then full `npm test`, `typecheck`, `lint`, and production build run before deployment.
