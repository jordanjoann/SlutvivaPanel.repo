import Docker from "dockerode";
import type {
  DiscordRoute,
  DiscordRouteKind,
  DiscordStatus,
  Instance,
} from "@/lib/types";
import { GAMES } from "@/lib/games";
import { config } from "./config";

type PlatformRoute = {
  channelId?: number | string;
  channelName?: string;
  game?: string;
  serverKey?: string;
  serverName?: string;
  kind?: number | string;
  updatedUtc?: string;
};

type PlatformRouteFile = {
  routes?: PlatformRoute[];
};

type DiscordCredentials = {
  token: string;
  guildId: string;
};

type PlatformState = {
  running: boolean;
  ready: boolean;
  botTag?: string;
  slashCommandsEnabled: boolean;
};

const PLATFORM_CONTAINER =
  process.env.SLUTVIVAL_DISCORD_CONTAINER ??
  process.env.SLUTVIVAL_PLATFORM_CONTAINER ??
  "slutvival-platform";
const PLATFORM_ROUTE_FILE =
  process.env.SLUTVIVAL_DISCORD_ROUTE_FILE ?? "/app/data/discord-routes.json";
const DISCORD_API_BASE = "https://discord.com/api/v10";
const KIND_BY_CODE: Record<string, DiscordRouteKind> = {
  "0": "chat",
  "1": "notifications",
  "2": "status",
  "3": "admin",
  chat: "chat",
  notifications: "notifications",
  status: "status",
  admin: "admin",
};

let dockerClient: Docker | null = null;

function docker(): Docker {
  if (!dockerClient) dockerClient = new Docker({ socketPath: config.docker.socket });
  return dockerClient;
}

export async function getDiscordStatus(): Promise<DiscordStatus> {
  const [credentials, platform, routes] = await Promise.all([
    getCredentials(),
    getPlatformState(),
    readRoutes(),
  ]);
  const mappedRoutes = routes.map(mapRoute).filter((route): route is DiscordRoute => route !== null);
  const enabledKinds = new Set(mappedRoutes.map((route) => route.kind));
  const channels = uniqueChannels(mappedRoutes);
  const connected = Boolean(credentials?.token && credentials.guildId && platform.running && platform.ready);

  return {
    connected,
    botTag: platform.botTag,
    guildId: credentials?.guildId,
    channels,
    routes: mappedRoutes,
    notifications: {
      "Server start / stop": enabledKinds.has("status") || enabledKinds.has("notifications"),
      "Crash detection": enabledKinds.has("status") || enabledKinds.has("notifications"),
      "Player join / leave": enabledKinds.has("notifications"),
      "Backup completed": enabledKinds.has("admin"),
      "Mod updates available": enabledKinds.has("notifications"),
    },
    routeCommand: "/sv set channel:#channel game:vintage-story server:<server> kind:<chat|notifications|status|admin>",
    slashCommandsEnabled: connected && platform.slashCommandsEnabled,
  };
}

export async function publishDiscordNotification(
  instance: Instance,
  kind: Extract<DiscordRouteKind, "notifications" | "status" | "admin">,
  message: string,
): Promise<boolean> {
  const body = message.trim();
  if (!body) return false;
  const content = formatServerNotification(instance, body);

  const [credentials, routes] = await Promise.all([getCredentials(), readRoutes()]);
  if (!credentials?.token) return false;

  const route = selectRoute(routes, instance, kind);
  if (!route?.channelId) return false;

  const response = await fetch(`${DISCORD_API_BASE}/channels/${route.channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${credentials.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content: truncateDiscordMessage(content) }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Discord send failed with HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
  }

  return true;
}

async function getCredentials(): Promise<DiscordCredentials | null> {
  const fromEnv = {
    token: process.env.DISCORD_TOKEN?.trim() ?? "",
    guildId: process.env.DISCORD_GUILD_ID?.trim() ?? "",
  };
  if (fromEnv.token && fromEnv.guildId) return fromEnv;

  const env = await inspectPlatformEnv();
  const token = env.DISCORD_TOKEN?.trim() ?? "";
  const guildId = env.DISCORD_GUILD_ID?.trim() ?? "";
  return token && guildId ? { token, guildId } : null;
}

async function inspectPlatformEnv(): Promise<Record<string, string>> {
  try {
    const info = await docker().getContainer(PLATFORM_CONTAINER).inspect();
    const entries = info.Config?.Env ?? [];
    return Object.fromEntries(
      entries.map((entry) => {
        const idx = entry.indexOf("=");
        return idx === -1 ? [entry, ""] : [entry.slice(0, idx), entry.slice(idx + 1)];
      }),
    );
  } catch {
    return {};
  }
}

async function getPlatformState(): Promise<PlatformState> {
  try {
    const container = docker().getContainer(PLATFORM_CONTAINER);
    const [inspect, logs] = await Promise.all([
      container.inspect(),
      container.logs({ stdout: true, stderr: true, tail: 200 }),
    ]);
    const text = dockerStreamToString(Buffer.isBuffer(logs) ? logs : Buffer.from(String(logs)));
    const ready = /Gateway\s+Ready|Discord gateway ready as/i.test(text);
    const botTag = botNameFromLogs(text);
    const slashCommandsEnabled = /Registered \/sv slash commands/i.test(text);
    return {
      running: Boolean(inspect.State?.Running),
      ready,
      botTag,
      slashCommandsEnabled,
    };
  } catch {
    return { running: false, ready: false, slashCommandsEnabled: false };
  }
}

async function readRoutes(): Promise<PlatformRoute[]> {
  const raw = await dockerExec(["cat", PLATFORM_ROUTE_FILE]).catch(() => "");
  if (!raw.trim()) return [];

  try {
    const parsed = JSON.parse(preserveSnowflakes(raw)) as PlatformRoute[] | PlatformRouteFile;
    return Array.isArray(parsed) ? parsed : parsed.routes ?? [];
  } catch {
    return [];
  }
}

async function dockerExec(cmd: string[]): Promise<string> {
  const container = docker().getContainer(PLATFORM_CONTAINER);
  const exec = await container.exec({
    Cmd: cmd,
    AttachStdout: true,
    AttachStderr: true,
  });
  const stream = (await exec.start({ hijack: true, stdin: false })) as NodeJS.ReadableStream;
  const output = dockerStreamToString(await readStreamBuffer(stream));
  return output;
}

function mapRoute(route: PlatformRoute): DiscordRoute | null {
  const kind = routeKind(route.kind);
  const channelId = stringValue(route.channelId);
  if (!kind || !channelId) return null;

  return {
    id: `${kind}-${channelId}-${stringValue(route.game)}-${stringValue(route.serverKey)}`,
    channelName: stringValue(route.channelName) || `#${channelId}`,
    game: stringValue(route.game),
    server: stringValue(route.serverName) || stringValue(route.serverKey),
    kind,
  };
}

function uniqueChannels(routes: DiscordRoute[]) {
  const seen = new Map<string, DiscordStatus["channels"][number]>();
  for (const route of routes) {
    const key = route.channelName;
    if (!seen.has(key)) {
      seen.set(key, {
        id: route.id,
        name: route.channelName,
        purpose: route.kind,
        enabled: true,
      });
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function selectRoute(
  routes: PlatformRoute[],
  instance: Instance,
  kind: Extract<DiscordRouteKind, "notifications" | "status" | "admin">,
): PlatformRoute | null {
  const candidates = routeCandidates(kind)
    .flatMap((routeKind) => scoreRoutes(routes, instance, routeKind))
    .filter((route) => route.score > 0)
    .sort((a, b) => b.score - a.score);
  if (candidates[0]) return candidates[0].route;

  const candidateKinds = new Set<DiscordRouteKind>(routeCandidates(kind));
  const loose = routes
    .filter((route) => {
      const candidate = routeKind(route.kind);
      return candidate ? candidateKinds.has(candidate) : false;
    })
    .filter((route) => gameMatches(route.game))
    .sort((a, b) => Number(new Date(stringValue(b.updatedUtc))) - Number(new Date(stringValue(a.updatedUtc))));
  return loose.length === 1 ? loose[0] : null;
}

function scoreRoutes(
  routes: PlatformRoute[],
  instance: Instance,
  kind: Extract<DiscordRouteKind, "notifications" | "status" | "admin">,
) {
  const serverTokens = instanceServerTokens(instance);
  return routes
    .filter((route) => routeKind(route.kind) === kind)
    .filter((route) => gameMatches(route.game))
    .map((route) => {
      const routeServer = normalizeToken(route.serverKey);
      const routeName = normalizeToken(route.serverName);
      const global = routeServer === "global" || routeServer === "hub";
      const exact = serverTokens.has(routeServer) || serverTokens.has(routeName);
      return {
        route,
        score: exact ? 100 : global ? 10 : 0,
      };
    });
}

function routeCandidates(kind: Extract<DiscordRouteKind, "notifications" | "status" | "admin">) {
  if (kind === "status") return ["status", "notifications"] as const;
  if (kind === "notifications") return ["notifications", "status"] as const;
  return ["admin"] as const;
}

function gameMatches(game: unknown) {
  const normalized = normalizeToken(game);
  return !normalized || normalized === "vintage-story" || normalized === "vintage";
}

function instanceServerTokens(instance: Instance) {
  return new Set(
    [
      instance.id,
      instance.name,
      instance.worldName,
      instance.group,
      slugish(instance.name),
      slugish(instance.id),
    ]
      .map(normalizeToken)
      .filter(Boolean),
  );
}

function routeKind(kind: unknown): DiscordRouteKind | null {
  return KIND_BY_CODE[normalizeToken(kind)] ?? null;
}

function normalizeToken(value: unknown): string {
  return stringValue(value).trim().toLowerCase();
}

function slugish(value: unknown): string {
  return stringValue(value).replace(/[-_]+/g, " ");
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function truncateDiscordMessage(value: string): string {
  return value.length > 1900 ? `${value.slice(0, 1897)}...` : value;
}

function formatServerNotification(instance: Instance, body: string): string {
  const gameName = GAMES[instance.game]?.name ?? instance.game;
  const label = `${gameName}: ${instance.name}`;
  return `**${escapeDiscordMarkdown(label)}** ${body}`;
}

function escapeDiscordMarkdown(value: string): string {
  return value.replace(/([\\*_~`>|])/g, "\\$1");
}

function preserveSnowflakes(raw: string): string {
  return raw.replace(/("(?:channelId|guildId|roleId)"\s*:\s*)(\d{15,25})/g, '$1"$2"');
}

function botNameFromLogs(text: string): string | undefined {
  for (const line of text.split(/\r?\n/).reverse()) {
    if (!line.includes("Discord gateway ready as")) continue;
    try {
      const parsed = JSON.parse(line) as { State?: { User?: string }; Message?: string };
      if (parsed.State?.User) return parsed.State.User;
      const messageMatch = /Discord gateway ready as ([^\r\n"]+)/i.exec(parsed.Message ?? "");
      if (messageMatch?.[1]) return messageMatch[1].trim();
    } catch {
      const match = /Discord gateway ready as ([^\r\n"]+)/i.exec(line);
      if (match?.[1]) return match[1].trim();
    }
  }
  return undefined;
}

async function readStreamBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks);
}

function dockerStreamToString(buffer: Buffer): string {
  const chunks: Buffer[] = [];
  let offset = 0;
  while (offset + 8 <= buffer.length && (buffer[offset] === 1 || buffer[offset] === 2)) {
    const size = buffer.readUInt32BE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (end > buffer.length) break;
    chunks.push(buffer.subarray(start, end));
    offset = end;
  }
  return chunks.length ? Buffer.concat(chunks).toString("utf8") : buffer.toString("utf8");
}
