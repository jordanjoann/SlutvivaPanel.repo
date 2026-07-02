import fs from "node:fs/promises";
import path from "node:path";
import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-token";
import { config } from "./config";

export type PanelAccount = {
  username: string;
  updatedAt: number;
};

type StoredAccount = PanelAccount & {
  pinSalt: string;
  pinHash: string;
};

const AUTH_FILE =
  process.env.SLUTVIVAL_AUTH_FILE ??
  path.join(
    /* turbopackIgnore: true */ config.root,
    "data",
    "panel-auth.json",
  );
const HASH_ITERATIONS = 120_000;
const HASH_LENGTH = 32;
const DEFAULT_USERNAME = "Admin";
const DEFAULT_PIN = "9876";

export async function getAccount(): Promise<PanelAccount> {
  const account = await readStoredAccount();
  return publicAccount(account);
}

export async function authenticate(username: string, pin: string): Promise<PanelAccount | null> {
  const account = await readStoredAccount();
  if (account.username.toLowerCase() !== username.trim().toLowerCase()) return null;
  if (!verifyPin(pin, account)) return null;
  return publicAccount(account);
}

export async function updateAccount(input: {
  username: string;
  pin?: string;
}): Promise<PanelAccount> {
  const current = await readStoredAccount();
  const username = normalizeUsername(input.username);
  const next: StoredAccount = {
    ...current,
    username,
    updatedAt: Date.now(),
  };

  if (input.pin !== undefined) {
    next.pinSalt = randomBytes(16).toString("hex");
    next.pinHash = hashPin(input.pin, next.pinSalt);
  }

  await writeStoredAccount(next);
  return publicAccount(next);
}

export async function getSessionAccount(): Promise<{
  account: PanelAccount;
  expiresAt: number;
} | null> {
  const cookieStore = await cookies();
  const payload = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!payload) return null;

  return {
    account: await getAccount(),
    expiresAt: payload.exp * 1000,
  };
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

async function readStoredAccount(): Promise<StoredAccount> {
  try {
    const raw = await fs.readFile(
      /* turbopackIgnore: true */ AUTH_FILE,
      "utf8",
    );
    const parsed = JSON.parse(raw) as Partial<StoredAccount>;
    if (
      !parsed.username ||
      !parsed.pinSalt ||
      !parsed.pinHash ||
      typeof parsed.updatedAt !== "number"
    ) {
      throw new Error(`Invalid auth file: ${AUTH_FILE}`);
    }
    return parsed as StoredAccount;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const account = defaultAccount();
    await writeStoredAccount(account);
    return account;
  }
}

async function writeStoredAccount(account: StoredAccount): Promise<void> {
  await fs.mkdir(/* turbopackIgnore: true */ path.dirname(AUTH_FILE), {
    recursive: true,
  });
  const tempFile = `${AUTH_FILE}.${process.pid}.tmp`;
  await fs.writeFile(
    /* turbopackIgnore: true */ tempFile,
    `${JSON.stringify(account, null, 2)}\n`,
    {
      encoding: "utf8",
      mode: 0o600,
    },
  );
  await fs.rename(
    /* turbopackIgnore: true */ tempFile,
    /* turbopackIgnore: true */ AUTH_FILE,
  );
  await fs.chmod(/* turbopackIgnore: true */ AUTH_FILE, 0o600);
}

function defaultAccount(): StoredAccount {
  const pinSalt = randomBytes(16).toString("hex");
  return {
    username: DEFAULT_USERNAME,
    pinSalt,
    pinHash: hashPin(DEFAULT_PIN, pinSalt),
    updatedAt: Date.now(),
  };
}

function hashPin(pin: string, salt: string): string {
  return pbkdf2Sync(pin, salt, HASH_ITERATIONS, HASH_LENGTH, "sha256").toString("hex");
}

function verifyPin(pin: string, account: StoredAccount): boolean {
  const expected = Buffer.from(account.pinHash, "hex");
  const actual = Buffer.from(hashPin(pin, account.pinSalt), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function publicAccount(account: StoredAccount): PanelAccount {
  return {
    username: account.username,
    updatedAt: account.updatedAt,
  };
}
