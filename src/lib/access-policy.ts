import type { PanelRole } from "@/lib/server/panel-users";
import type { GameId, PowerAction } from "@/lib/types";

const AUTH_API_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/session",
  "/api/auth/account",
  "/api/auth/recovery/request",
  "/api/auth/recovery/reset",
]);

const PUBLIC_PATHS = new Set(["/login", "/reset-pin"]);
const BASE_NON_OWNER_PAGE_PATHS = new Set(["/", "/account"]);
const LIMITED_POWER_ACTIONS = new Set<PowerAction>(["start", "restart"]);
const LIMITED_PLAYER_ACTIONS = new Set(["kick", "whitelist"]);
const LIMITED_MOD_OPERATIONS = new Set(["update"]);
const LIMITED_INSTANCE_METHODS = new Set(["GET"]);

export function isVintageManagerRole(role: PanelRole): boolean {
  return role === "owner" || role === "admin" || role === "moderator";
}

export function isLimitedVintageManagerRole(role: PanelRole): boolean {
  return role === "admin" || role === "moderator";
}

export function canAccessPagePath(role: PanelRole, pathname: string): boolean {
  if (role === "owner") return true;
  if (PUBLIC_PATHS.has(pathname) || BASE_NON_OWNER_PAGE_PATHS.has(pathname)) return true;
  if (!isLimitedVintageManagerRole(role)) return false;

  if (pathname === "/vintage-story") return true;
  const match = pathname.match(/^\/vintage-story\/[^/]+(?:\/([^/]+))?$/);
  if (!match) return false;
  const segment = match[1] ?? "";
  return segment === "" || segment === "players" || segment === "mods";
}

export function canAccessApiPath(role: PanelRole, pathname: string): boolean {
  if (role === "owner") return true;
  if (AUTH_API_PATHS.has(pathname)) return true;
  if (!isLimitedVintageManagerRole(role)) return false;

  if (pathname === "/api/instances") return true;
  if (/^\/api\/instances\/[^/]+$/.test(pathname)) return true;
  if (/^\/api\/instances\/[^/]+\/(players|mods|power)$/.test(pathname)) return true;
  return false;
}

export function canUsePowerAction(role: PanelRole, action: PowerAction): boolean {
  if (role === "owner") return true;
  return isLimitedVintageManagerRole(role) && LIMITED_POWER_ACTIONS.has(action);
}

export function canUseInstanceMethod(role: PanelRole, method: string): boolean {
  if (role === "owner") return true;
  return isLimitedVintageManagerRole(role) && LIMITED_INSTANCE_METHODS.has(method.toUpperCase());
}

export function canAccessInstanceGame(role: PanelRole, game: GameId): boolean {
  if (role === "owner") return true;
  return isLimitedVintageManagerRole(role) && game === "vintage-story";
}

export function canUsePlayerAction(role: PanelRole, action: string): boolean {
  if (role === "owner") return true;
  return isLimitedVintageManagerRole(role) && LIMITED_PLAYER_ACTIONS.has(action);
}

export function canUseModOperation(role: PanelRole, operation: string): boolean {
  if (role === "owner") return true;
  return isLimitedVintageManagerRole(role) && LIMITED_MOD_OPERATIONS.has(operation);
}
