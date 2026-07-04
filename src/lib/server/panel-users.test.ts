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
    expect(reset.expiresAt).toBe(86_401_000);
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
