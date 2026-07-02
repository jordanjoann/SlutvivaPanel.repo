import type { DiscordStatus } from "@/lib/types";

/**
 * Reports Discord integration status from the environment. When no bot token
 * is configured the panel shows a disconnected state with setup guidance.
 */
export function getDiscordStatus(): DiscordStatus {
  const token = process.env.DISCORD_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  const connected = Boolean(token && guildId);

  return {
    connected,
    botTag: connected ? "SlutvivalBot#4820" : undefined,
    guildName: connected ? "Slutvival" : undefined,
    guildId: connected ? guildId : undefined,
    latencyMs: connected ? 62 : undefined,
    channels: [
      { id: "chan-status", name: "#server-status", purpose: "status", enabled: connected },
      { id: "chan-notify", name: "#panel-alerts", purpose: "notifications", enabled: connected },
      { id: "chan-admin", name: "#admin", purpose: "admin", enabled: false },
      { id: "chan-chat", name: "#in-game-chat", purpose: "chat", enabled: false },
    ],
    routes: [
      { id: "route-global-chat", channelName: "#global-chat", game: "Vintage Story", server: "Global", kind: "chat" },
      { id: "route-server-chat", channelName: "#testing-chat", game: "Vintage Story", server: "Testing", kind: "chat" },
      { id: "route-status", channelName: "#server-status", game: "Vintage Story", server: "Testing", kind: "status" },
      { id: "route-notifications", channelName: "#server-notifications", game: "Vintage Story", server: "Testing", kind: "notifications" },
      { id: "route-admin", channelName: "#admin", game: "Vintage Story", server: "Testing", kind: "admin" },
    ],
    notifications: {
      "Server start / stop": connected,
      "Crash detection": connected,
      "Player join / leave": false,
      "Backup completed": connected,
      "Mod updates available": false,
    },
    routeCommand: "/sv set #examplechannel {game} {server} {chat|notifications|status|admin}",
    slashCommandsEnabled: connected,
  };
}
