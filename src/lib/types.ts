/**
 * Slutvival Panel — shared domain types.
 *
 * These types are the contract between the backend service layer
 * (`src/lib/server/*`) and the client. Keep them serializable (JSON-safe):
 * no Date objects — use epoch milliseconds (number) for timestamps.
 */

import type { VintageStoryWorldGenerationConfig } from "./vintage-story-world";

/* ------------------------------------------------------------------ */
/* Games                                                              */
/* ------------------------------------------------------------------ */

export type GameId =
  | "vintage-story"
  | "gta"
  | "abiotic-factor"
  | "project-zomboid"
  | "garrys-mod"
  | "palworld"
  | "seven-days-to-die"
  | "minecraft"
  | "terraria";

export interface GameMeta {
  id: GameId;
  name: string;
  /** Short marketing blurb shown on the game landing screens. */
  tagline: string;
  /** Whether the panel can manage this game today. */
  available: boolean;
  accent?: string;
}

/* ------------------------------------------------------------------ */
/* Server instances                                                   */
/* ------------------------------------------------------------------ */

export type ServerStatus =
  | "running"
  | "stopped"
  | "starting"
  | "stopping"
  | "restarting"
  | "crashed"
  | "installing"
  | "updating"
  | "unknown";

/** How a given instance is actually launched / supervised. */
export type RuntimeKind = "docker" | "process" | "simulated";
export type ServerEngine = "stratum" | "vanilla" | "fxserver";

export interface InstanceResources {
  /** Hard memory limit handed to the container / process, in MB. */
  memoryLimitMB: number;
  /** Fractional CPU limit (e.g. 2 = two cores). 0 = unlimited. */
  cpuLimit: number;
}

export interface InstanceDockerConfig {
  containerName: string;
  image: string;
  network: string;
}

/**
 * The canonical, persisted description of a server instance.
 * Mirrors the on-disk `server.yml` for Vintage Story instances.
 */
export interface Instance {
  id: string;
  name: string;
  game: GameId;
  description?: string;
  /** Free-form grouping label shown in the instance list (e.g. "Main"). */
  group?: string;
  /** Whether this instance is isolated for development workflows. */
  development: boolean;

  version: string;
  port: number;
  /** Absolute data path on the host (never deleted on update). */
  dataPath: string;

  runtime: RuntimeKind;
  serverEngine: ServerEngine;
  docker: InstanceDockerConfig;
  resources: InstanceResources;

  /* Gameplay / advertising config surfaced as first-class controls */
  motd?: string;
  worldName?: string;
  seed?: string;
  maxPlayers: number;
  passwordProtected: boolean;
  publicAdvertised: boolean;

  autoRestart: boolean;
  autoBackup: boolean;

  createdAt: number;
  updatedAt: number;
}

export interface CreateInstanceInput extends Partial<Instance> {
  name: string;
  serverPassword?: string;
  initialWorldConfig?: Partial<VintageStoryWorldGenerationConfig>;
}

/** Live, non-persisted runtime facts about an instance. */
export interface InstanceRuntimeState {
  status: ServerStatus;
  runtime: RuntimeKind;
  /** True when a real backend (docker/process) is attached, false when simulated. */
  live: boolean;
  uptimeSeconds: number;
  playersOnline: number;
  stats: ServerStats;
}

/** An instance joined with its current runtime state (list/overview payload). */
export interface InstanceWithState extends Instance {
  state: InstanceRuntimeState;
}

export interface VintageStoryNetworkStatus {
  publicAddress: string;
  publicHost: string;
  publicPort: number;
  registryPort: number;
  hubExists: boolean;
  stratumInstalled: boolean;
  nimbusInstalled: boolean;
  nimbusConfigured: boolean;
  nimbusProxyRunning: boolean;
}

export interface VintageStoryNetworkSetupResult {
  ok: true;
  status: VintageStoryNetworkStatus;
}

/* ------------------------------------------------------------------ */
/* Server settings                                                    */
/* ------------------------------------------------------------------ */

export interface ModBlacklistEntry {
  id: string;
  name: string;
  author?: string;
  summary?: string;
  iconUrl?: string;
  side?: "Client" | "Server" | "Universal";
  latestVersion?: string;
}

export interface ServerSettings {
  general: {
    serverName: string;
    serverDescription: string;
    welcomeMessage: string;
    advertiseServer: boolean;
    maxPlayers: number;
    passTimeWhenEmpty: boolean;
    password: string;
    whitelistMode: boolean;
    allowPvp: boolean;
    allowFireSpread: boolean;
    allowFallingBlocks: boolean;
  };
  admin: {
    entityDebugMode: boolean;
    masterServerUrl: string;
    modDbUrl: string;
    antiAbuseLevel: number;
    maxOwnedGroupChannelsPerUser: number;
    numberOfLandClaims: number;
    landClaimMinSize: number;
    landClaimMaxSize: number;
    chatRateLimitMs: number;
    dieBelowDiskSpaceMb: number;
  };
  world: {
    maxChunkRadius: number;
  };
  network: {
    port: number;
    upnp: boolean;
    compressPackets: boolean;
    clientConnectionTimeoutSeconds: number;
  };
  mods: {
    modPaths: string[];
    modBlacklist: ModBlacklistEntry[];
  };
}

/* ------------------------------------------------------------------ */
/* Metrics & stats                                                    */
/* ------------------------------------------------------------------ */

export interface ServerStats {
  cpuPercent: number;
  memoryUsedMB: number;
  memoryLimitMB: number;
  memoryPercent: number;
  netRxKBs: number;
  netTxKBs: number;
  diskUsedMB: number;
  diskTotalMB: number;
  threads: number;
}

export interface MetricPoint {
  /** epoch ms */
  t: number;
  [series: string]: number;
}

export interface HostProcess {
  pid: number;
  name: string;
  command?: string;
  user?: string;
  state?: string;
  cpuPercent: number;
  memoryMB: number;
}

export interface DockerContainerUsage {
  id: string;
  name: string;
  status: ServerStatus;
  cpuPercent: number;
  memoryMB: number;
}

/** Snapshot powering the Grafana-style dashboard header. */
export interface HostMetrics {
  cpuPercent: number;
  perCore: number[];
  memUsedMB: number;
  memTotalMB: number;
  diskUsedMB: number;
  diskTotalMB: number;
  netRxKBs: number;
  netTxKBs: number;
  diskReadKBs: number;
  diskWriteKBs: number;
  load: [number, number, number];
  containersRunning: number;
  containersTotal: number;
  serversOnline: number;
  serversTotal: number;
  playersOnline: number;
  topProcesses: HostProcess[];
  containers: DockerContainerUsage[];
  /** True when values come from a real host probe rather than simulation. */
  live: boolean;
  t: number;
}

/* ------------------------------------------------------------------ */
/* Players                                                            */
/* ------------------------------------------------------------------ */

export interface Player {
  uid: string;
  name: string;
  online: boolean;
  role?: string;
  pingMs: number;
  playtimeSeconds: number;
  isOp: boolean;
  isWhitelisted: boolean;
  avatarUrl?: string;
  lastSeen: number;
}

/* ------------------------------------------------------------------ */
/* Console                                                            */
/* ------------------------------------------------------------------ */

export type ConsoleStream = "stdout" | "stderr" | "system" | "command";
export type LogLevel = "debug" | "info" | "notification" | "warning" | "error";

export interface ConsoleLine {
  id: number;
  t: number;
  stream: ConsoleStream;
  level: LogLevel;
  text: string;
}

/* ------------------------------------------------------------------ */
/* Files                                                              */
/* ------------------------------------------------------------------ */

export interface FileNode {
  name: string;
  /** Path relative to the instance data root, POSIX-style, no leading slash. */
  path: string;
  type: "file" | "dir";
  size: number;
  modified: number;
  /** Unix-style mode string, e.g. "rw-r--r--" (best-effort on Windows). */
  mode?: string;
}

export interface FileContent {
  path: string;
  content: string;
  language: string;
  size: number;
  modified: number;
  /** True when the file was too large or binary to load as text. */
  truncated?: boolean;
  binary?: boolean;
}

/* ------------------------------------------------------------------ */
/* Mods                                                               */
/* ------------------------------------------------------------------ */

export interface InstalledMod {
  id: string;
  name: string;
  author?: string;
  description?: string;
  iconUrl?: string;
  installedVersion: string;
  latestVersion?: string;
  enabled: boolean;
  side?: "Client" | "Server" | "Universal";
  fileName: string;
  dependencies?: ModDependency[];
}

export interface ModDependency {
  modId: string;
  version?: string;
  satisfied: boolean;
}

export interface ModVersion {
  version: string;
  releasedAt: number;
  gameVersions: string[];
  downloadUrl?: string;
  fileId?: string;
}

export interface ModSearchResult {
  id: string;
  name: string;
  author?: string;
  summary?: string;
  iconUrl?: string;
  downloads: number;
  follows?: number;
  side?: "Client" | "Server" | "Universal";
  latestVersion: string;
  tags?: string[];
  versions: ModVersion[];
  dependencies?: ModDependency[];
}

/* ------------------------------------------------------------------ */
/* Backups                                                            */
/* ------------------------------------------------------------------ */

export type BackupKind = "manual" | "auto" | "pre-update" | "restore-point";

export interface Backup {
  id: string;
  name: string;
  kind: BackupKind;
  /** Logical size of the snapshot if restored. */
  sizeBytes: number;
  /** New bytes stored by this snapshot after deduplicating unchanged files. */
  storedBytes?: number;
  fileCount?: number;
  createdAt: number;
  expiresAt?: number;
  worldName?: string;
  note?: string;
  storage?: "local" | "backblaze";
  status?: "uploaded" | "failed" | "deleted";
  checksumSha256?: string;
}

export interface BackupPolicyStatus {
  enabled: boolean;
  intervalMinutes: number;
  keepRestorePoints: number;
  restorePoints: number;
  protectedBackups: number;
  logicalBytes: number;
  storedBytes: number;
  lastRestorePointAt?: number;
  nextRestorePointAt?: number;
}

/* ------------------------------------------------------------------ */
/* World                                                              */
/* ------------------------------------------------------------------ */

export interface WorldInfo {
  name: string;
  seed: string;
  playStyle: string;
  worldType: string;
  sizeBytes: number;
  createdAt: number;
  lastPlayed: number;
  settings: Record<string, string>;
}

/* ------------------------------------------------------------------ */
/* Version / update                                                   */
/* ------------------------------------------------------------------ */

export interface GameVersion {
  version: string;
  channel: "stable" | "unstable" | "rc";
  releasedAt: number;
  latest: boolean;
}

export type UpdateStage =
  | "idle"
  | "backup"
  | "download"
  | "stop"
  | "replace"
  | "start"
  | "done"
  | "error";

export interface UpdateProgress {
  stage: UpdateStage;
  targetVersion: string;
  percent: number;
  message: string;
}

/* ------------------------------------------------------------------ */
/* Discord                                                            */
/* ------------------------------------------------------------------ */

export interface DiscordChannel {
  id: string;
  name: string;
  purpose: "notifications" | "admin" | "chat" | "status";
  enabled: boolean;
}

export type DiscordRouteKind = "chat" | "notifications" | "status" | "admin";

export interface DiscordRoute {
  id: string;
  channelName: string;
  game: string;
  server: string;
  kind: DiscordRouteKind;
}

export interface DiscordStatus {
  connected: boolean;
  botTag?: string;
  guildName?: string;
  guildId?: string;
  latencyMs?: number;
  channels: DiscordChannel[];
  routes: DiscordRoute[];
  notifications: Record<string, boolean>;
  routeCommand: string;
  slashCommandsEnabled: boolean;
}

/* ------------------------------------------------------------------ */
/* API envelopes                                                      */
/* ------------------------------------------------------------------ */

export type PowerAction = "start" | "stop" | "restart" | "kill";

export interface ApiError {
  error: string;
  detail?: string;
}
