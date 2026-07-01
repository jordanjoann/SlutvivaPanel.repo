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
      { id: "chan-console", name: "#console-relay", purpose: "console", enabled: false },
      { id: "chan-chat", name: "#in-game-chat", purpose: "chat", enabled: false },
    ],
    notifications: {
      "Server start / stop": connected,
      "Crash detection": connected,
      "Player join / leave": false,
      "Backup completed": connected,
      "Mod updates available": false,
    },
    slashCommandsEnabled: connected,
  };
}
