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

const DEFAULT_DB_FILE = "/opt/slutvival/data/slutvival-panel.sqlite";
const HASH_ITERATIONS = 120_000;
const HASH_LENGTH = 32;
const PIN_RESET_TTL_MS = 30 * 60 * 1000;
const PIN_RESET_COOLDOWN_MS = 5 * 60 * 1000;
const ROLES: PanelRole[] = ["owner", "admin", "moderator", "viewer"];

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
      (options.dbFile
        ? path.join(path.dirname(options.dbFile), "panel-auth.json")
        : path.join(config.root, "data", "panel-auth.json"));
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
    const row = this.db
      .prepare("select * from panel_users where lower(username) = lower(?)")
      .get(username.trim()) as PanelUserRow | undefined;

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

  async updateOwnAccount(
    id: string,
    input: UpdateOwnAccountInput,
    now = Date.now(),
  ): Promise<PanelUser> {
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

  async createPinReset(
    identifier: string,
    now = Date.now(),
    tokenFactory = generateResetToken,
  ): Promise<PinResetResult> {
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
        set pin_reset_token_hash = ?, pin_reset_expires_at = ?,
            pin_reset_requested_at = ?, updated_at = ?
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
      create index if not exists idx_panel_users_email on panel_users(email);
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
}

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
