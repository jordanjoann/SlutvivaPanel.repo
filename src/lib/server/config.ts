import path from "node:path";
import os from "node:os";

/**
 * Central path + infrastructure configuration.
 *
 * Production (Linux host) mirrors the Slutvival infra layout exactly:
 *
 *   /opt/slutvival
 *   └── games
 *       └── vintage-story
 *           └── {serverId}
 *               ├── server.yml
 *               ├── docker-compose.yml
 *               ├── .env
 *               ├── README.md
 *               ├── notes/
 *               └── vintage/            (dataPath)
 *                   ├── Mods
 *                   ├── Managed-Mods
 *                   ├── ModConfig
 *                   ├── Saves
 *                   ├── Logs
 *                   ├── Backups
 *                   └── BackupSaves
 *
 * On a Windows dev box there is no /opt, so we fall back to a local
 * `.slutvival-data` directory under the project so the panel runs and
 * seeds demo instances without touching the real infra.
 */

function resolveRoot(): string {
  if (process.env.SLUTVIVAL_ROOT) return process.env.SLUTVIVAL_ROOT;
  if (process.platform === "win32") {
    return path.join(process.cwd(), ".slutvival-data");
  }
  return "/opt/slutvival";
}

const ROOT = resolveRoot();

export const config = {
  root: ROOT,
  gamesRoot: path.join(ROOT, "games"),
  vintageStoryRoot: path.join(ROOT, "games", "vintage-story"),

  docker: {
    network: process.env.SLUTVIVAL_DOCKER_NETWORK ?? "slutvival-net",
    socket:
      process.env.DOCKER_SOCKET ??
      (process.platform === "win32"
        ? "//./pipe/docker_engine"
        : "/var/run/docker.sock"),
    image: process.env.VINTAGE_STORY_IMAGE ?? "slutvival/vintage-story:latest",
  },

  domains: {
    panel: process.env.PANEL_DOMAIN ?? "panel.slutvival.com",
    files: "files.slutvival.com",
    logs: "logs.slutvival.com",
    status: "status.slutvival.com",
    grafana: "grafana.slutvival.com",
  },

  /** Seed demo instances on first run when the games dir is empty. */
  demoSeed: process.env.PANEL_DEMO_SEED !== "false",

  /** Preferred runtime order. First that is usable wins per instance. */
  preferredRuntime: (process.env.PANEL_RUNTIME ?? "auto") as
    | "auto"
    | "docker"
    | "process"
    | "simulated",

  isWindows: process.platform === "win32",
  hostname: os.hostname(),
} as const;

/** The directory holding a single Vintage Story instance. */
export function instanceDir(serverId: string): string {
  return path.join(config.vintageStoryRoot, serverId);
}

/** The Vintage Story `--dataPath` for an instance. */
export function instanceDataPath(serverId: string): string {
  return path.join(instanceDir(serverId), "vintage");
}

export function serverYmlPath(serverId: string): string {
  return path.join(instanceDir(serverId), "server.yml");
}

/** Well-known sub-directories inside a VS data path. */
export function vsPaths(serverId: string) {
  const data = instanceDataPath(serverId);
  return {
    data,
    mods: path.join(data, "Mods"),
    managedMods: path.join(data, "Managed-Mods"),
    modConfig: path.join(data, "ModConfig"),
    saves: path.join(data, "Saves"),
    logs: path.join(data, "Logs"),
    backups: path.join(data, "Backups"),
    backupSaves: path.join(data, "BackupSaves"),
    serverConfig: path.join(data, "serverconfig.json"),
  };
}

export const VS_DATA_SUBDIRS = [
  "Mods",
  "Managed-Mods",
  "ModConfig",
  "Saves",
  "Logs",
  "Backups",
  "BackupSaves",
] as const;
