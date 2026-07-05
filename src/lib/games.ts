import type { GameId, GameMeta } from "./types";

export const GAMES: Record<GameId, GameMeta> = {
  "vintage-story": {
    id: "vintage-story",
    name: "Vintage Story",
    tagline: "Uncompromising wilderness survival sandbox.",
    available: true,
    accent: "#d98a9e",
  },
  gta: {
    id: "gta",
    name: "GTA 5",
    tagline: "Roleplay and racing servers on FiveM.",
    available: true,
    accent: "#e6b566",
  },
  "abiotic-factor": {
    id: "abiotic-factor",
    name: "Abiotic Factor",
    tagline: "Co-op science-facility survival horror.",
    available: false,
    accent: "#6fbf9f",
  },
  "project-zomboid": {
    id: "project-zomboid",
    name: "Project Zomboid",
    tagline: "Persistent Kentucky survival servers.",
    available: false,
    accent: "#c77d5a",
  },
  "garrys-mod": {
    id: "garrys-mod",
    name: "Garry's Mod",
    tagline: "Sandbox, TTT, DarkRP, and custom Lua servers.",
    available: false,
    accent: "#6fa8dc",
  },
  palworld: {
    id: "palworld",
    name: "Palworld",
    tagline: "Open-world survival and base-building servers.",
    available: false,
    accent: "#69c3d0",
  },
  "seven-days-to-die": {
    id: "seven-days-to-die",
    name: "7 Days to Die",
    tagline: "Blood moon survival worlds with persistent saves.",
    available: false,
    accent: "#d16f5d",
  },
  minecraft: {
    id: "minecraft",
    name: "Minecraft",
    tagline: "The block game. Vanilla, modded, everything.",
    available: false,
    accent: "#7cc47c",
  },
  terraria: {
    id: "terraria",
    name: "Terraria",
    tagline: "2D adventure and boss-rush worlds.",
    available: false,
    accent: "#7fa8d9",
  },
};

export const GAME_LIST: GameMeta[] = Object.values(GAMES);

/** The identical tab set every managed server exposes. */
export const SERVER_TABS = [
  { key: "overview", label: "Overview", segment: "" },
  { key: "console", label: "Console", segment: "console" },
  { key: "players", label: "Players", segment: "players" },
  { key: "world", label: "World", segment: "world" },
  { key: "files", label: "Files", segment: "files" },
  { key: "mods", label: "Mods", segment: "mods" },
  { key: "backups", label: "Backups", segment: "backups" },
  { key: "settings", label: "Settings", segment: "settings" },
  { key: "danger", label: "Danger Zone", segment: "danger", danger: true },
] as const;
