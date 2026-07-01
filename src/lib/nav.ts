import {
  LayoutDashboard,
  Mountain,
  Car,
  FlaskConical,
  MessagesSquare,
  Users,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** When false the page is a "coming soon" stub. */
  available?: boolean;
  badge?: string;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    items: [{ label: "Dashboard", href: "/", icon: LayoutDashboard, available: true }],
  },
  {
    label: "Software & Games",
    items: [
      { label: "Vintage Story", href: "/vintage-story", icon: Mountain, available: true },
      { label: "GTA / FiveM", href: "/gta", icon: Car, badge: "Soon" },
      { label: "Abiotic Factor", href: "/abiotic-factor", icon: FlaskConical, badge: "Soon" },
    ],
  },
  {
    label: "Platform",
    items: [
      { label: "Discord", href: "/discord", icon: MessagesSquare, available: true },
      { label: "Users & Roles", href: "/users", icon: Users, badge: "Soon" },
      { label: "Settings", href: "/settings", icon: Settings, available: true },
    ],
  },
];
