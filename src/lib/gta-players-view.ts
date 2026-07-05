import type { GtaPlayerSummary } from "./types";

export type GtaPlayerFilter = "all" | "online" | "offline";

export function matchesGtaPlayerQuery(
  player: GtaPlayerSummary,
  rawQuery: string,
): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;

  return [
    player.name,
    player.id,
    player.serverId?.toString() ?? "",
    ...player.identifiers.map((identifier) => identifier.value),
  ].some((value) => value.toLowerCase().includes(query));
}

export function filterGtaPlayers(
  players: GtaPlayerSummary[],
  filter: GtaPlayerFilter,
  query: string,
): GtaPlayerSummary[] {
  return players.filter((player) => {
    if (filter === "online" && !player.online) return false;
    if (filter === "offline" && player.online) return false;
    return matchesGtaPlayerQuery(player, query);
  });
}

export function initialGtaPlayerId(
  players: GtaPlayerSummary[],
  currentId: string,
): string {
  if (currentId && players.some((player) => player.id === currentId)) {
    return currentId;
  }

  return players.find((player) => player.online)?.id ?? players[0]?.id ?? "";
}
