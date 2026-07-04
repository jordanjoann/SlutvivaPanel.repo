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

let store: PanelUserStore | null = null;

function getStore(): PanelUserStore {
  store ??= new PanelUserStore();
  return store;
}

export async function getAccount(): Promise<PanelAccount> {
  const users = await getStore().listUsers();
  const owner = users.find((user) => user.role === "owner");
  if (!owner) throw new Error("Owner account is not configured.");
  return owner;
}

export async function listPanelUsers(): Promise<PanelUser[]> {
  return getStore().listUsers();
}

export async function createPanelUser(input: {
  username: string;
  email: string;
  role: PanelRole;
  pin: string;
}): Promise<PanelUser> {
  return getStore().createUser(input);
}

export async function updatePanelUserRole(id: string, role: PanelRole): Promise<PanelUser> {
  return getStore().updateRole(id, role);
}

export async function rollbackCreatedPanelUser(id: string): Promise<void> {
  getStore().rollbackCreatedUser(id);
}

export async function authenticate(username: string, pin: string): Promise<PanelAccount | null> {
  return getStore().authenticate(username, pin);
}

export async function updateAccount(input: {
  userId: string;
  username: string;
  email: string;
  pin?: string;
}): Promise<PanelAccount> {
  return getStore().updateOwnAccount(input.userId, {
    username: input.username,
    email: input.email,
    pin: input.pin,
  });
}

export async function createPinReset(identifier: string) {
  return getStore().createPinReset(identifier);
}

export async function resetPinWithToken(token: string, pin: string) {
  return getStore().resetPinWithToken(token, pin);
}

export async function getSessionAccount(): Promise<SessionAccount | null> {
  const cookieStore = await cookies();
  const payload = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (!payload) return null;

  const account = await getStore().getUserById(payload.sub);
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
