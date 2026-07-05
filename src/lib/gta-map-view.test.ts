import { describe, expect, it } from "vitest";
import {
  formatGtaCoords,
  formatGtaHealth,
  formatGtaVehicle,
  mappedGtaPlayers,
  projectGtaPosition,
} from "./gta-map-view";
import type { GtaPlayerSummary } from "./types";

describe("GTA map view helpers", () => {
  it("filters to online players with valid positions", () => {
    const withPosition = player({
      id: "gta_1",
      name: "Nova",
      online: true,
      position: { x: 100, y: 200, z: 30 },
    });
    const offline = player({
      id: "gta_2",
      name: "Offline",
      online: false,
      position: { x: 100, y: 200, z: 30 },
    });
    const missingPosition = player({
      id: "gta_3",
      name: "No Coords",
      online: true,
    });

    expect(mappedGtaPlayers([withPosition, offline, missingPosition])).toEqual([
      withPosition,
    ]);
  });

  it("excludes online players with non-finite positions", () => {
    const valid = player({
      id: "gta_1",
      name: "Nova",
      online: true,
      position: { x: 100, y: 200, z: 30 },
    });
    const invalidX = player({
      id: "gta_2",
      name: "Invalid X",
      online: true,
      position: { x: Number.NaN, y: 200, z: 30 },
    });
    const invalidY = player({
      id: "gta_3",
      name: "Invalid Y",
      online: true,
      position: { x: 100, y: Number.POSITIVE_INFINITY, z: 30 },
    });

    expect(mappedGtaPlayers([valid, invalidX, invalidY])).toEqual([valid]);
  });

  it("projects GTA coordinates into clamped map percentages", () => {
    expect(projectGtaPosition({ x: 0, y: 2000, z: 25 })).toEqual({
      xPercent: 50,
      yPercent: 50,
    });
    expect(projectGtaPosition({ x: 9000, y: -9000, z: 0 })).toEqual({
      xPercent: 100,
      yPercent: 100,
    });
    expect(
      projectGtaPosition(
        { x: 0, y: 0, z: 0 },
        { minX: -1000, maxX: 1000, minY: -1000, maxY: 1000 },
      ),
    ).toEqual({ xPercent: 50, yPercent: 50 });
  });

  it("formats hover telemetry", () => {
    expect(formatGtaCoords({ x: 10.4, y: -20.6, z: 30.2 })).toBe(
      "10, -21, 30",
    );
    expect(formatGtaHealth(undefined)).toBe("Unknown");
    expect(formatGtaHealth(187)).toBe("187");
    expect(formatGtaHealth(187.6)).toBe("188");
    expect(formatGtaVehicle(undefined)).toBe("On foot");
    expect(formatGtaVehicle({ inVehicle: false })).toBe("On foot");
    expect(formatGtaVehicle({ inVehicle: true, model: "adder" })).toBe("adder");
    expect(formatGtaVehicle({ inVehicle: true, modelHash: 123 })).toBe(
      "Vehicle 123",
    );
    expect(formatGtaVehicle({ inVehicle: true })).toBe("In vehicle");
  });
});

function player(
  patch: Partial<GtaPlayerSummary> & Pick<GtaPlayerSummary, "id" | "name" | "online">,
): GtaPlayerSummary {
  return {
    id: patch.id,
    name: patch.name,
    online: patch.online,
    serverId: patch.serverId,
    pingMs: patch.pingMs,
    position: patch.position,
    heading: patch.heading,
    health: patch.health,
    armour: patch.armour,
    vehicle: patch.vehicle,
    lastHeartbeatAt: patch.lastHeartbeatAt,
    identifiers: [],
    firstSeenAt: 1_700_000_000_000,
    lastSeenAt: 1_700_000_000_000,
    totalPlaytimeSeconds: 0,
    sessions: [],
    punishments: [],
  };
}
