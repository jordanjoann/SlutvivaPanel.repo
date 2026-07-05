import type {
  GtaPlayerPosition,
  GtaPlayerSummary,
  GtaPlayerVehicle,
} from "./types";

export interface GtaMapBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export const GTA_MAP_BOUNDS = {
  minX: -4500,
  maxX: 4500,
  minY: -4500,
  maxY: 8500,
} as const satisfies GtaMapBounds;

export type GtaMappedPlayer = GtaPlayerSummary & {
  position: GtaPlayerPosition;
};

export function mappedGtaPlayers(players: GtaPlayerSummary[]): GtaMappedPlayer[] {
  return players.filter(hasMapPosition);
}

export function hasMapPosition(player: GtaPlayerSummary): player is GtaMappedPlayer {
  return (
    player.online &&
    player.position !== undefined &&
    Number.isFinite(player.position.x) &&
    Number.isFinite(player.position.y) &&
    Number.isFinite(player.position.z)
  );
}

export function projectGtaPosition(
  position: GtaPlayerPosition,
  bounds: GtaMapBounds = GTA_MAP_BOUNDS,
): { xPercent: number; yPercent: number } {
  const xPercent = ((position.x - bounds.minX) / (bounds.maxX - bounds.minX)) * 100;
  const yPercent = 100 - ((position.y - bounds.minY) / (bounds.maxY - bounds.minY)) * 100;

  return {
    xPercent: clampPercent(xPercent),
    yPercent: clampPercent(yPercent),
  };
}

export function formatGtaCoords(position: GtaPlayerPosition): string {
  return [
    Math.round(position.x),
    Math.round(position.y),
    Math.round(position.z),
  ].join(", ");
}

export function formatGtaHealth(value: number | undefined): string {
  return value === undefined ? "Unknown" : String(Math.round(value));
}

export function formatGtaVehicle(vehicle: GtaPlayerVehicle | undefined): string {
  if (!vehicle?.inVehicle) return "On foot";
  if (vehicle.model?.trim()) return vehicle.model.trim();
  if (vehicle.modelHash !== undefined) return `Vehicle ${Math.round(vehicle.modelHash)}`;
  return "In vehicle";
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value * 100) / 100));
}
