import { SERVER_TABS } from "@/lib/games";
import { NAV, type NavGroup } from "@/lib/nav";
import type { PanelRole } from "@/lib/server/panel-users";
import { isLimitedVintageManagerRole } from "./access-policy";

const LIMITED_SERVER_TABS = new Set(["overview", "players", "mods"]);

export * from "./access-policy";

export function serverTabsForRole(role: PanelRole | undefined) {
  if (role === "owner") return SERVER_TABS;
  if (role && isLimitedVintageManagerRole(role)) {
    return SERVER_TABS.filter((tab) => LIMITED_SERVER_TABS.has(tab.key));
  }
  return [];
}

export function visibleNavForRole(role: PanelRole): NavGroup[] {
  if (role === "owner") return NAV;
  if (isLimitedVintageManagerRole(role)) {
    return [
      { items: NAV[0].items.filter((item) => item.href === "/") },
      {
        label: "Software & Games",
        items: NAV[1].items.filter((item) => item.href === "/vintage-story"),
      },
    ];
  }
  return [{ items: NAV[0].items.filter((item) => item.href === "/") }];
}
