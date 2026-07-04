import {
  LayoutDashboard,
  Mountain,
  Car,
  FlaskConical,
  Skull,
  Wrench,
  Gamepad2,
  ShieldAlert,
  Blocks,
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
      { label: "Project Zomboid", href: "/project-zomboid", icon: Skull, badge: "Soon" },
      { label: "Garry's Mod", href: "/garrys-mod", icon: Wrench, badge: "Soon" },
      { label: "Palworld", href: "/palworld", icon: Gamepad2, badge: "Soon" },
      { label: "7 Days to Die", href: "/seven-days-to-die", icon: ShieldAlert, badge: "Soon" },
      { label: "Minecraft", href: "/minecraft", icon: Blocks, badge: "Soon" },
    ],
  },
  {
    label: "Platform",
    items: [
      { label: "Discord", href: "/discord", icon: MessagesSquare, available: true },
      { label: "Users & Roles", href: "/users", icon: Users, available: true },
      { label: "Settings", href: "/settings", icon: Settings, available: true },
    ],
  },
];
