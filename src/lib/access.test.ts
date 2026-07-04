import { describe, expect, it } from "vitest";
import {
  canAccessApiPath,
  canAccessPagePath,
  canAccessInstanceGame,
  canUseInstanceMethod,
  canUseModOperation,
  canUsePlayerAction,
  canUsePowerAction,
  serverTabsForRole,
  visibleNavForRole,
} from "./access";

describe("role access policy", () => {
  it("gives owners full page and API access", () => {
    expect(canAccessPagePath("owner", "/vintage-story/test/files")).toBe(true);
    expect(canAccessPagePath("owner", "/vintage-story/test/console")).toBe(true);
    expect(canAccessApiPath("owner", "/api/instances/test/files")).toBe(true);
    expect(canUsePowerAction("owner", "kill")).toBe(true);
    expect(canUsePlayerAction("owner", "ban")).toBe(true);
    expect(canUseModOperation("owner", "install")).toBe(true);
  });

  it("limits admins and moderators to Vintage Story overview, players, and mods", () => {
    for (const role of ["admin", "moderator"] as const) {
      expect(canAccessPagePath(role, "/vintage-story")).toBe(true);
      expect(canAccessPagePath(role, "/vintage-story/test")).toBe(true);
      expect(canAccessPagePath(role, "/vintage-story/test/players")).toBe(true);
      expect(canAccessPagePath(role, "/vintage-story/test/mods")).toBe(true);
      expect(canAccessPagePath(role, "/vintage-story/test/console")).toBe(false);
      expect(canAccessPagePath(role, "/vintage-story/test/world")).toBe(false);
      expect(canAccessPagePath(role, "/vintage-story/test/files")).toBe(false);
      expect(canAccessPagePath(role, "/vintage-story/test/settings")).toBe(false);
      expect(canAccessPagePath(role, "/vintage-story/test/backups")).toBe(false);
    }
  });

  it("keeps viewers out of Vintage Story management", () => {
    expect(canAccessPagePath("viewer", "/")).toBe(true);
    expect(canAccessPagePath("viewer", "/account")).toBe(true);
    expect(canAccessPagePath("viewer", "/vintage-story")).toBe(false);
    expect(canAccessApiPath("viewer", "/api/instances/test/players")).toBe(false);
  });

  it("allows limited Vintage Story API reads for admins and moderators only", () => {
    for (const role of ["admin", "moderator"] as const) {
      expect(canAccessApiPath(role, "/api/instances")).toBe(true);
      expect(canAccessApiPath(role, "/api/instances/test")).toBe(true);
      expect(canAccessApiPath(role, "/api/instances/test/players")).toBe(true);
      expect(canAccessApiPath(role, "/api/instances/test/mods")).toBe(true);
      expect(canAccessApiPath(role, "/api/instances/test/power")).toBe(true);
      expect(canAccessApiPath(role, "/api/instances/test/console")).toBe(false);
      expect(canAccessApiPath(role, "/api/instances/test/world")).toBe(false);
      expect(canAccessApiPath(role, "/api/instances/test/files")).toBe(false);
      expect(canAccessApiPath(role, "/api/instances/test/settings")).toBe(false);
      expect(canAccessApiPath(role, "/api/instances/test/backups")).toBe(false);
      expect(canAccessApiPath(role, "/api/mods/search")).toBe(false);
    }
  });

  it("keeps limited instance access read-only and scoped to Vintage Story", () => {
    for (const role of ["admin", "moderator"] as const) {
      expect(canUseInstanceMethod(role, "GET")).toBe(true);
      expect(canUseInstanceMethod(role, "POST")).toBe(false);
      expect(canUseInstanceMethod(role, "PATCH")).toBe(false);
      expect(canUseInstanceMethod(role, "DELETE")).toBe(false);
      expect(canAccessInstanceGame(role, "vintage-story")).toBe(true);
      expect(canAccessInstanceGame(role, "minecraft")).toBe(false);
    }

    expect(canUseInstanceMethod("owner", "DELETE")).toBe(true);
    expect(canAccessInstanceGame("owner", "minecraft")).toBe(true);
    expect(canUseInstanceMethod("viewer", "GET")).toBe(false);
    expect(canAccessInstanceGame("viewer", "vintage-story")).toBe(false);
  });

  it("restricts limited actions to start, restart, kick, whitelist, and mod update", () => {
    for (const role of ["admin", "moderator"] as const) {
      expect(canUsePowerAction(role, "start")).toBe(true);
      expect(canUsePowerAction(role, "restart")).toBe(true);
      expect(canUsePowerAction(role, "stop")).toBe(false);
      expect(canUsePowerAction(role, "kill")).toBe(false);

      expect(canUsePlayerAction(role, "kick")).toBe(true);
      expect(canUsePlayerAction(role, "whitelist")).toBe(true);
      expect(canUsePlayerAction(role, "ban")).toBe(false);
      expect(canUsePlayerAction(role, "role")).toBe(false);

      expect(canUseModOperation(role, "update")).toBe(true);
      expect(canUseModOperation(role, "install")).toBe(false);
      expect(canUseModOperation(role, "remove")).toBe(false);
      expect(canUseModOperation(role, "enable")).toBe(false);
      expect(canUseModOperation(role, "disable")).toBe(false);
    }
  });

  it("shows limited Vintage Story tabs and nav only to admins and moderators", () => {
    expect(serverTabsForRole("admin").map((tab) => tab.key)).toEqual([
      "overview",
      "players",
      "mods",
    ]);
    expect(serverTabsForRole("moderator").map((tab) => tab.key)).toEqual([
      "overview",
      "players",
      "mods",
    ]);
    expect(serverTabsForRole("owner").map((tab) => tab.key)).toContain("console");
    expect(visibleNavForRole("viewer").flatMap((group) => group.items.map((item) => item.href))).toEqual([
      "/",
    ]);
    expect(visibleNavForRole("admin").flatMap((group) => group.items.map((item) => item.href))).toContain(
      "/vintage-story",
    );
  });
});
