# GTA Server Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GTA `Map` tab that shows live online player positions with hover details for name, server ID, ping, health, armour, vehicle, heading, and coordinates.

**Architecture:** Extend the existing GTA players bridge instead of creating a parallel map subsystem. The `slutvival-admin` FiveM resource sends live telemetry in heartbeat payloads, the existing file-backed GTA player store keeps the latest online telemetry, and the new `/gta/[id]/map` page consumes the existing owner-only GTA players API. Map projection and formatting live in pure client-safe helpers so the background can later be swapped for a calibrated Los Santos image.

**Tech Stack:** Next.js App Router, TypeScript, Vitest, SWR, existing panel UI components, lucide-react icons, FiveM Lua server resource, Docker Compose.

---

## File Structure

- Modify `src/lib/types.ts`: add serializable GTA live telemetry types and optional telemetry fields on `GtaBridgePlayer` and `GtaPlayerSummary`.
- Modify `src/lib/server/gta/players.ts`: validate bridge telemetry, persist latest live telemetry on online player records, expose telemetry in player summaries, and clear live-only fields when a player goes offline.
- Modify `src/lib/server/gta/players.test.ts`: cover telemetry storage, stale/offline marker behavior, and malformed telemetry rejection.
- Modify `src/app/api/instances/[id]/gta/bridge/route.test.ts`: cover bridge route handling for telemetry payloads and malformed telemetry errors.
- Modify `src/lib/server/gta/server-data.ts`: update generated `slutvival-admin/server.lua` to collect ped coordinates, heading, health, armour, vehicle data, and heartbeat every 2 seconds.
- Modify `src/lib/server/gta/server-data.test.ts`: assert the generated Lua contains telemetry collection and the 2-second heartbeat interval.
- Create `src/lib/gta-map-view.ts`: pure helpers for mapped player filtering, coordinate projection, clamping, and hover detail formatting.
- Create `src/lib/gta-map-view.test.ts`: unit tests for map filtering, projection, and formatting.
- Modify `src/app/(panel)/gta/[id]/layout.tsx`: add `Map` tab between `Players` and `Files`.
- Create `src/app/(panel)/gta/[id]/map/page.tsx`: client page with live map surface, pan/zoom/reset controls, online count, bridge state, markers, and hover/tap details.

---

## Task 1: Add GTA Live Telemetry To The Player Domain

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/server/gta/players.ts`
- Test: `src/lib/server/gta/players.test.ts`

- [ ] **Step 1: Add failing telemetry tests**

Append these tests inside the existing `describe("GTA players", () => { ... })` block in `src/lib/server/gta/players.test.ts`:

```ts
  it("stores live map telemetry from heartbeat players", async () => {
    const inst = instance();
    const now = Date.UTC(2026, 6, 5, 12, 0, 0);

    const roster = await recordGtaHeartbeat(
      inst,
      [
        bridgePlayer({
          position: { x: 101.25, y: -202.5, z: 33.75 },
          heading: 91.5,
          health: 187,
          armour: 42,
          vehicle: {
            inVehicle: true,
            model: "adder",
            modelHash: 3078201489,
            plate: "MAP001",
          },
        }),
      ],
      now,
    );

    expect(roster.players[0]).toMatchObject({
      online: true,
      position: { x: 101.25, y: -202.5, z: 33.75 },
      heading: 91.5,
      health: 187,
      armour: 42,
      vehicle: {
        inVehicle: true,
        model: "adder",
        modelHash: 3078201489,
        plate: "MAP001",
      },
      lastHeartbeatAt: now,
    });
  });

  it("clears live map telemetry when a player drops", async () => {
    const inst = instance();
    const joinedAt = Date.UTC(2026, 6, 5, 12, 0, 0);
    const joined = await recordGtaPlayerJoin(
      inst,
      bridgePlayer({
        position: { x: 10, y: 20, z: 30 },
        heading: 180,
        health: 160,
        armour: 25,
        vehicle: { inVehicle: false },
      }),
      joinedAt,
    );

    await recordGtaPlayerDrop(
      inst,
      { playerId: joined.player.id, serverId: 7, reason: "Quit" },
      joinedAt + 10_000,
    );

    const roster = await listGtaPlayers(inst, joinedAt + 10_001);

    expect(roster.players[0]).toMatchObject({ online: false });
    expect(roster.players[0].position).toBeUndefined();
    expect(roster.players[0].heading).toBeUndefined();
    expect(roster.players[0].health).toBeUndefined();
    expect(roster.players[0].armour).toBeUndefined();
    expect(roster.players[0].vehicle).toBeUndefined();
  });

  it("rejects malformed live telemetry in bridge heartbeat payloads", async () => {
    const inst = instance();
    await writeBridgeToken(inst, "token123");

    await expect(
      handleGtaBridgeEvent(inst, {
        type: "heartbeat",
        serverToken: "token123",
        players: [
          {
            ...bridgePlayer(),
            position: { x: "bad", y: 0, z: 0 },
          },
        ],
      }),
    ).rejects.toThrow(/Malformed GTA bridge payload/i);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
PATH=/home/ubuntu/.npm/_npx/4e81eea606e3d9df/node_modules/node/bin:$PATH npm test -- src/lib/server/gta/players.test.ts
```

Expected: failure because `GtaBridgePlayer` does not accept `position`, `heading`, `health`, `armour`, or `vehicle`, and summaries do not return those fields.

- [ ] **Step 3: Add telemetry types**

In `src/lib/types.ts`, replace the current `GtaBridgePlayer` interface with this block and add the telemetry interfaces directly above it:

```ts
export interface GtaPlayerPosition {
  x: number;
  y: number;
  z: number;
}

export interface GtaPlayerVehicle {
  inVehicle: boolean;
  model?: string;
  modelHash?: number;
  plate?: string;
}

export interface GtaBridgePlayer {
  serverId: number;
  name: string;
  pingMs: number;
  identifiers: GtaPlayerIdentifier[];
  position?: GtaPlayerPosition;
  heading?: number;
  health?: number;
  armour?: number;
  vehicle?: GtaPlayerVehicle;
}
```

In the existing `GtaPlayerSummary` interface, add these optional fields after `pingMs?: number;`:

```ts
  position?: GtaPlayerPosition;
  heading?: number;
  health?: number;
  armour?: number;
  vehicle?: GtaPlayerVehicle;
  lastHeartbeatAt?: number;
```

- [ ] **Step 4: Extend stored player shape**

In `src/lib/server/gta/players.ts`, update the import list from `@/lib/types` to include the new telemetry types:

```ts
  GtaPlayerPosition,
  GtaPlayerVehicle,
```

Add the same optional fields to `StoredGtaPlayer` after `pingMs?: number;`:

```ts
  position?: GtaPlayerPosition;
  heading?: number;
  health?: number;
  armour?: number;
  vehicle?: GtaPlayerVehicle;
```

- [ ] **Step 5: Add telemetry assignment helpers**

Add these helpers near the other player normalization helpers in `src/lib/server/gta/players.ts`:

```ts
function assignLiveTelemetry(
  player: StoredGtaPlayer,
  bridgePlayer: GtaBridgePlayer,
): void {
  if (bridgePlayer.position !== undefined) {
    player.position = bridgePlayer.position;
  } else {
    delete player.position;
  }

  if (bridgePlayer.heading !== undefined) {
    player.heading = bridgePlayer.heading;
  } else {
    delete player.heading;
  }

  if (bridgePlayer.health !== undefined) {
    player.health = bridgePlayer.health;
  } else {
    delete player.health;
  }

  if (bridgePlayer.armour !== undefined) {
    player.armour = bridgePlayer.armour;
  } else {
    delete player.armour;
  }

  if (bridgePlayer.vehicle !== undefined) {
    player.vehicle = bridgePlayer.vehicle;
  } else {
    delete player.vehicle;
  }
}

function clearLiveTelemetry(player: StoredGtaPlayer): void {
  delete player.position;
  delete player.heading;
  delete player.health;
  delete player.armour;
  delete player.vehicle;
}
```

- [ ] **Step 6: Store telemetry during upsert and clear it on offline transitions**

In `upsertBridgePlayer`, after setting `current.pingMs = bridgePlayer.pingMs;`, add:

```ts
    assignLiveTelemetry(current, bridgePlayer);
```

In the `created` object inside `upsertBridgePlayer`, add:

```ts
    position: bridgePlayer.position,
    heading: bridgePlayer.heading,
    health: bridgePlayer.health,
    armour: bridgePlayer.armour,
    vehicle: bridgePlayer.vehicle,
```

In `recordGtaPlayerDropUnlocked`, after `delete player.pingMs;`, add:

```ts
  clearLiveTelemetry(player);
```

In every helper that marks stale or missing heartbeat players offline, call `clearLiveTelemetry(player)` in the same branch that deletes `serverId` and `pingMs`.

- [ ] **Step 7: Return telemetry in player summaries**

In the `playerSummary` object returned by `src/lib/server/gta/players.ts`, include these fields:

```ts
    position: player.position,
    heading: player.heading,
    health: player.health,
    armour: player.armour,
    vehicle: player.vehicle,
    lastHeartbeatAt: player.lastHeartbeatAt,
```

- [ ] **Step 8: Validate telemetry in bridge payloads**

In `src/lib/server/gta/players.ts`, update `isGtaBridgePlayer` so it also requires optional telemetry fields to be valid:

```ts
    (value.position === undefined || isGtaPlayerPosition(value.position)) &&
    (value.heading === undefined || isFiniteNumber(value.heading)) &&
    (value.health === undefined || isNonNegativeFiniteNumber(value.health)) &&
    (value.armour === undefined || isNonNegativeFiniteNumber(value.armour)) &&
    (value.vehicle === undefined || isGtaPlayerVehicle(value.vehicle))
```

Add these helpers near the other validation helpers:

```ts
function isGtaPlayerPosition(value: unknown): value is GtaPlayerPosition {
  return (
    isPlainRecord(value) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.z)
  );
}

function isGtaPlayerVehicle(value: unknown): value is GtaPlayerVehicle {
  return (
    isPlainRecord(value) &&
    typeof value.inVehicle === "boolean" &&
    (value.model === undefined || typeof value.model === "string") &&
    (value.modelHash === undefined || isFiniteNumber(value.modelHash)) &&
    (value.plate === undefined || typeof value.plate === "string")
  );
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}
```

- [ ] **Step 9: Run focused telemetry tests**

Run:

```bash
PATH=/home/ubuntu/.npm/_npx/4e81eea606e3d9df/node_modules/node/bin:$PATH npm test -- src/lib/server/gta/players.test.ts
```

Expected: all GTA player tests pass.

- [ ] **Step 10: Commit telemetry domain changes**

Run:

```bash
git status --short
git add src/lib/types.ts src/lib/server/gta/players.ts src/lib/server/gta/players.test.ts
git commit -m "feat: track GTA live player telemetry"
```

---

## Task 2: Extend The Bridge Route Tests And Generated FiveM Resource

**Files:**
- Modify: `src/app/api/instances/[id]/gta/bridge/route.test.ts`
- Modify: `src/lib/server/gta/server-data.ts`
- Modify: `src/lib/server/gta/server-data.test.ts`

- [ ] **Step 1: Add bridge route telemetry tests**

Append these tests to `src/app/api/instances/[id]/gta/bridge/route.test.ts`:

```ts
  it("passes telemetry heartbeat payloads to the bridge service", async () => {
    const event = {
      type: "heartbeat",
      serverToken: "token",
      players: [
        {
          serverId: 7,
          name: "Bocephus",
          pingMs: 44,
          identifiers: [{ type: "license", value: "license:abc123" }],
          position: { x: 10, y: 20, z: 30 },
          heading: 270,
          health: 199,
          armour: 100,
          vehicle: { inVehicle: false },
        },
      ],
    };
    const { POST } = await import("./route");

    const response = await POST(bridgeRequest(event), params());

    expect(response.status).toBe(200);
    expect(handleGtaBridgeEvent).toHaveBeenCalledWith(gtaInstance(), event);
  });

  it("returns 400 for malformed telemetry rejected by the service", async () => {
    handleGtaBridgeEvent.mockRejectedValueOnce(
      new Error("Malformed GTA bridge payload: heartbeat players are required"),
    );
    const { POST } = await import("./route");

    const response = await POST(
      bridgeRequest({
        type: "heartbeat",
        serverToken: "token",
        players: [{ position: { x: "bad", y: 0, z: 0 } }],
      }),
      params(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Malformed GTA bridge payload: heartbeat players are required",
    });
  });
```

- [ ] **Step 2: Run bridge route tests to verify expected behavior**

Run:

```bash
PATH=/home/ubuntu/.npm/_npx/4e81eea606e3d9df/node_modules/node/bin:$PATH npm test -- 'src/app/api/instances/[id]/gta/bridge/route.test.ts'
```

Expected: the first new route test passes because route forwarding already works; the second test passes if malformed bridge errors are already mapped. If either fails, inspect the exact route error mapping before changing production code.

- [ ] **Step 3: Add failing resource generation assertions**

In `src/lib/server/gta/server-data.test.ts`, add expectations to the existing generated resource test, or create a new test if clearer:

```ts
  it("generates GTA admin resource telemetry collection", async () => {
    const inst = instance();

    await ensureGtaServerData(inst, { cloneBaseResources: false });

    const lua = await fs.readFile(
      path.join(
        inst.dataPath,
        "resources",
        "[slutvival]",
        "slutvival-admin",
        "server.lua",
      ),
      "utf8",
    );
    expect(lua).toContain("GetEntityCoords");
    expect(lua).toContain("GetEntityHeading");
    expect(lua).toContain("GetPedArmour");
    expect(lua).toContain("GetVehiclePedIsIn");
    expect(lua).toContain("GetVehicleNumberPlateText");
    expect(lua).toContain("Wait(2000)");
  });
```

- [ ] **Step 4: Run server-data tests to verify they fail**

Run:

```bash
PATH=/home/ubuntu/.npm/_npx/4e81eea606e3d9df/node_modules/node/bin:$PATH npm test -- src/lib/server/gta/server-data.test.ts
```

Expected: failure because the generated Lua does not collect telemetry and still waits 60000 ms.

- [ ] **Step 5: Replace the Lua player collection block**

In `src/lib/server/gta/server-data.ts`, update the `SLUTVIVAL_ADMIN_SERVER_LUA` string. Add these Lua helpers after `collectIdentifiers`:

```lua
local function safeNumber(value)
  if type(value) == "number" then
    return value
  end

  return nil
end

local function collectPosition(ped)
  if not ped or ped == 0 then
    return nil
  end

  local coords = GetEntityCoords(ped)

  if not coords then
    return nil
  end

  return {
    x = safeNumber(coords.x),
    y = safeNumber(coords.y),
    z = safeNumber(coords.z),
  }
end

local function collectVehicle(ped)
  if not ped or ped == 0 then
    return nil
  end

  local vehicle = GetVehiclePedIsIn(ped, false)

  if not vehicle or vehicle == 0 then
    return {
      inVehicle = false,
    }
  end

  return {
    inVehicle = true,
    modelHash = GetEntityModel(vehicle),
    plate = GetVehicleNumberPlateText(vehicle),
  }
end
```

Replace the current `collectPlayer` function with:

```lua
local function collectPlayer(player, playerName)
  local ped = GetPlayerPed(player)

  return {
    serverId = tonumber(player),
    name = playerName or GetPlayerName(player) or "",
    pingMs = GetPlayerPing(player),
    identifiers = collectIdentifiers(player),
    position = collectPosition(ped),
    heading = ped and ped ~= 0 and GetEntityHeading(ped) or nil,
    health = ped and ped ~= 0 and GetEntityHealth(ped) or nil,
    armour = ped and ped ~= 0 and GetPedArmour(ped) or nil,
    vehicle = collectVehicle(ped),
  }
end
```

Replace `Wait(60000)` with:

```lua
    Wait(2000)
```

- [ ] **Step 6: Run resource generation tests**

Run:

```bash
PATH=/home/ubuntu/.npm/_npx/4e81eea606e3d9df/node_modules/node/bin:$PATH npm test -- src/lib/server/gta/server-data.test.ts 'src/app/api/instances/[id]/gta/bridge/route.test.ts'
```

Expected: all selected tests pass.

- [ ] **Step 7: Commit bridge resource changes**

Run:

```bash
git status --short
git add src/app/api/instances/[id]/gta/bridge/route.test.ts src/lib/server/gta/server-data.ts src/lib/server/gta/server-data.test.ts
git commit -m "feat: collect GTA map telemetry"
```

---

## Task 3: Add Pure GTA Map View Helpers

**Files:**
- Create: `src/lib/gta-map-view.ts`
- Create: `src/lib/gta-map-view.test.ts`

- [ ] **Step 1: Write failing map helper tests**

Create `src/lib/gta-map-view.test.ts`:

```ts
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

  it("projects GTA coordinates into clamped map percentages", () => {
    expect(projectGtaPosition({ x: 0, y: 2000, z: 25 })).toEqual({
      xPercent: 50,
      yPercent: 50,
    });
    expect(projectGtaPosition({ x: 9000, y: -9000, z: 0 })).toEqual({
      xPercent: 100,
      yPercent: 100,
    });
  });

  it("formats hover telemetry", () => {
    expect(formatGtaCoords({ x: 10.4, y: -20.6, z: 30.2 })).toBe(
      "10, -21, 30",
    );
    expect(formatGtaHealth(undefined)).toBe("Unknown");
    expect(formatGtaHealth(187)).toBe("187");
    expect(formatGtaVehicle(undefined)).toBe("On foot");
    expect(formatGtaVehicle({ inVehicle: false })).toBe("On foot");
    expect(formatGtaVehicle({ inVehicle: true, model: "adder" })).toBe("adder");
    expect(formatGtaVehicle({ inVehicle: true, modelHash: 123 })).toBe(
      "Vehicle 123",
    );
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
```

- [ ] **Step 2: Run helper tests to verify they fail**

Run:

```bash
PATH=/home/ubuntu/.npm/_npx/4e81eea606e3d9df/node_modules/node/bin:$PATH npm test -- src/lib/gta-map-view.test.ts
```

Expected: failure because `src/lib/gta-map-view.ts` does not exist.

- [ ] **Step 3: Implement map helpers**

Create `src/lib/gta-map-view.ts`:

```ts
import type {
  GtaPlayerPosition,
  GtaPlayerSummary,
  GtaPlayerVehicle,
} from "./types";

export const GTA_MAP_BOUNDS = {
  minX: -4500,
  maxX: 4500,
  minY: -4500,
  maxY: 8500,
} as const;

export type GtaMapBounds = typeof GTA_MAP_BOUNDS;

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
```

- [ ] **Step 4: Run helper tests**

Run:

```bash
PATH=/home/ubuntu/.npm/_npx/4e81eea606e3d9df/node_modules/node/bin:$PATH npm test -- src/lib/gta-map-view.test.ts
```

Expected: all helper tests pass.

- [ ] **Step 5: Commit map helpers**

Run:

```bash
git status --short
git add src/lib/gta-map-view.ts src/lib/gta-map-view.test.ts
git commit -m "feat: add GTA map view helpers"
```

---

## Task 4: Add The GTA Map Tab And Page

**Files:**
- Modify: `src/app/(panel)/gta/[id]/layout.tsx`
- Create: `src/app/(panel)/gta/[id]/map/page.tsx`

- [ ] **Step 1: Add failing source-level route placement test**

Create `src/app/(panel)/gta/[id]/map/page.test.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pagePath = path.join(
  process.cwd(),
  "src/app/(panel)/gta/[id]/map/page.tsx",
);
const layoutPath = path.join(
  process.cwd(),
  "src/app/(panel)/gta/[id]/layout.tsx",
);

describe("GTA map page source", () => {
  it("defines a map page with live telemetry affordances", () => {
    const source = fs.readFileSync(pagePath, "utf8");

    expect(source).toContain("api.gta.players.list");
    expect(source).toContain("mappedGtaPlayers");
    expect(source).toContain("projectGtaPosition");
    expect(source).toContain("Health");
    expect(source).toContain("Armour");
    expect(source).toContain("Vehicle");
  });

  it("adds Map between Players and Files in the GTA tabs", () => {
    const source = fs.readFileSync(layoutPath, "utf8");
    const playersIndex = source.indexOf('label: "Players"');
    const mapIndex = source.indexOf('label: "Map"');
    const filesIndex = source.indexOf('label: "Files"');

    expect(playersIndex).toBeGreaterThan(-1);
    expect(mapIndex).toBeGreaterThan(playersIndex);
    expect(filesIndex).toBeGreaterThan(mapIndex);
  });
});
```

- [ ] **Step 2: Run page test to verify it fails**

Run:

```bash
PATH=/home/ubuntu/.npm/_npx/4e81eea606e3d9df/node_modules/node/bin:$PATH npm test -- 'src/app/(panel)/gta/[id]/map/page.test.ts'
```

Expected: failure because `src/app/(panel)/gta/[id]/map/page.tsx` does not exist and the `Map` tab is not present.

- [ ] **Step 3: Add the Map tab**

In `src/app/(panel)/gta/[id]/layout.tsx`, update `TABS` to:

```ts
const TABS = [
  { key: "overview", label: "Overview", segment: "" },
  { key: "console", label: "Console", segment: "console" },
  { key: "players", label: "Players", segment: "players" },
  { key: "map", label: "Map", segment: "map" },
  { key: "files", label: "Files", segment: "files" },
  { key: "settings", label: "Settings", segment: "settings" },
] as const;
```

- [ ] **Step 4: Create the Map page client component**

Create `src/app/(panel)/gta/[id]/map/page.tsx` with a client component that follows this structure:

```tsx
"use client";

import * as React from "react";
import useSWR from "swr";
import { useParams } from "next/navigation";
import {
  CrosshairIcon,
  MapIcon,
  RotateCcwIcon,
  UsersIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatRelative } from "@/lib/format";
import {
  formatGtaCoords,
  formatGtaHealth,
  formatGtaVehicle,
  mappedGtaPlayers,
  projectGtaPosition,
  type GtaMappedPlayer,
} from "@/lib/gta-map-view";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/panel/page-header";
import { SectionCard } from "@/components/panel/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type MapView = {
  scale: number;
  x: number;
  y: number;
};

const INITIAL_VIEW: MapView = { scale: 1, x: 0, y: 0 };

export default function GtaMapPage() {
  const { id } = useParams<{ id: string }>();
  const [view, setView] = React.useState<MapView>(INITIAL_VIEW);
  const [dragStart, setDragStart] = React.useState<{ x: number; y: number; view: MapView } | null>(null);
  const [activePlayerId, setActivePlayerId] = React.useState("");
  const { data, isLoading } = useSWR(
    ["gta-map", id],
    () => api.gta.players.list(id),
    { refreshInterval: 2000 },
  );

  const players = data?.players ?? [];
  const mappedPlayers = mappedGtaPlayers(players);
  const activePlayer =
    mappedPlayers.find((player) => player.id === activePlayerId) ?? null;
  const onlineCount = data?.onlineCount ?? 0;
  const unmappedCount = Math.max(0, onlineCount - mappedPlayers.length);

  function resetView() {
    setView(INITIAL_VIEW);
  }

  function onWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const nextScale = clamp(view.scale + (event.deltaY > 0 ? -0.1 : 0.1), 0.7, 2.5);
    setView((current) => ({ ...current, scale: nextScale }));
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart({
      x: event.clientX,
      y: event.clientY,
      view,
    });
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragStart) return;
    setView({
      ...dragStart.view,
      x: dragStart.view.x + event.clientX - dragStart.x,
      y: dragStart.view.y + event.clientY - dragStart.y,
    });
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (dragStart) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragStart(null);
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Map"
        description="Live GTA player positions and health telemetry."
        icon={MapIcon}
      />

      {isLoading && !data ? (
        <MapSkeleton />
      ) : (
        <SectionCard
          title="Live server map"
          description={`${mappedPlayers.length} mapped, ${unmappedCount} without coordinates`}
          icon={CrosshairIcon}
          action={<MapStatus onlineCount={onlineCount} bridgeOnline={data?.bridge.online ?? false} />}
          bodyClassName="p-0"
        >
          <div className="relative overflow-hidden rounded-b-lg border-t border-border bg-[#101410]">
            <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
              <Badge variant="secondary">{onlineCount} online</Badge>
              <Button size="icon-sm" variant="outline" onClick={resetView} aria-label="Reset map view">
                <RotateCcwIcon className="size-4" />
              </Button>
            </div>

            <div
              className="relative h-[min(68vh,46rem)] min-h-[28rem] cursor-grab touch-none overflow-hidden active:cursor-grabbing"
              onWheel={onWheel}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <div
                className="absolute inset-0 origin-center transition-transform duration-100"
                style={{
                  transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
                }}
              >
                <MapBackdrop />
                {mappedPlayers.map((player) => (
                  <PlayerMarker
                    key={player.id}
                    player={player}
                    active={player.id === activePlayerId}
                    onActive={() => setActivePlayerId(player.id)}
                    onClear={() => setActivePlayerId("")}
                  />
                ))}
              </div>
            </div>

            {mappedPlayers.length === 0 && (
              <div className="absolute inset-x-4 top-1/2 z-30 mx-auto max-w-md -translate-y-1/2 rounded-lg border border-border bg-card/95 p-4 text-center shadow-panel">
                <p className="text-sm font-medium">
                  {data?.bridge.online ? "No mapped players" : "Bridge offline"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {data?.bridge.online
                    ? "Online players have not reported coordinates yet."
                    : "The GTA resource has not sent a recent heartbeat."}
                </p>
              </div>
            )}

            {activePlayer && <PinnedPlayerDetails player={activePlayer} />}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function PlayerMarker({
  player,
  active,
  onActive,
  onClear,
}: {
  player: GtaMappedPlayer;
  active: boolean;
  onActive: () => void;
  onClear: () => void;
}) {
  const point = projectGtaPosition(player.position);
  const inVehicle = player.vehicle?.inVehicle === true;

  return (
    <button
      type="button"
      className={cn(
        "group absolute z-10 flex size-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-background shadow-lg outline-none transition-transform hover:z-20 hover:scale-125 focus-visible:z-20 focus-visible:scale-125 focus-visible:ring-2 focus-visible:ring-primary",
        inVehicle ? "bg-sky-400" : "bg-emerald-400",
        active && "z-20 scale-125 ring-2 ring-primary",
      )}
      style={{ left: `${point.xPercent}%`, top: `${point.yPercent}%` }}
      onMouseEnter={onActive}
      onMouseLeave={onClear}
      onFocus={onActive}
      onBlur={onClear}
      onClick={onActive}
      aria-label={`Show ${player.name} map telemetry`}
    >
      <span className="size-1.5 rounded-full bg-background/90" />
      <span className="pointer-events-none absolute bottom-5 left-1/2 hidden w-64 -translate-x-1/2 group-hover:block group-focus-visible:block">
        <PlayerTooltip player={player} />
      </span>
    </button>
  );
}

function PlayerTooltip({ player }: { player: GtaMappedPlayer }) {
  return (
    <div className="rounded-lg border border-border bg-popover p-3 text-left text-xs text-popover-foreground shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{player.name}</p>
          <p className="font-mono text-[11px] text-muted-foreground">ID {player.serverId ?? "-"}</p>
        </div>
        <Badge variant="secondary">{player.pingMs !== undefined ? `${Math.round(player.pingMs)} ms` : "No ping"}</Badge>
      </div>
      <TelemetryRows player={player} />
    </div>
  );
}

function PinnedPlayerDetails({ player }: { player: GtaMappedPlayer }) {
  return (
    <div className="absolute bottom-3 left-3 z-30 w-[min(22rem,calc(100%-1.5rem))] rounded-lg border border-border bg-card/95 p-3 shadow-panel backdrop-blur">
      <PlayerTooltip player={player} />
    </div>
  );
}

function TelemetryRows({ player }: { player: GtaMappedPlayer }) {
  return (
    <div className="mt-3 grid gap-1.5">
      <TelemetryRow label="Health" value={formatGtaHealth(player.health)} />
      <TelemetryRow label="Armour" value={formatGtaHealth(player.armour)} />
      <TelemetryRow label="Vehicle" value={formatGtaVehicle(player.vehicle)} />
      <TelemetryRow label="Heading" value={player.heading !== undefined ? `${Math.round(player.heading)} deg` : "Unknown"} />
      <TelemetryRow label="Coords" value={formatGtaCoords(player.position)} />
      <TelemetryRow label="Seen" value={formatRelative(player.lastHeartbeatAt ?? player.lastSeenAt)} />
    </div>
  );
}

function TelemetryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-mono">{value}</span>
    </div>
  );
}

function MapBackdrop() {
  return (
    <div className="absolute inset-[6%] rounded-[2rem] border border-emerald-500/15 bg-[radial-gradient(circle_at_30%_30%,rgba(34,197,94,0.16),transparent_28%),linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[length:100%_100%,4rem_4rem,4rem_4rem]" />
  );
}

function MapStatus({ onlineCount, bridgeOnline }: { onlineCount: number; bridgeOnline: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={bridgeOnline ? "default" : "secondary"}>
        {bridgeOnline ? "Bridge online" : "Bridge offline"}
      </Badge>
      <Badge variant="secondary">
        <UsersIcon className="mr-1 size-3" />
        {onlineCount} online
      </Badge>
    </div>
  );
}

function MapSkeleton() {
  return (
    <div className="grid gap-3">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-[32rem] w-full" />
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
```

- [ ] **Step 5: Run page source test**

Run:

```bash
PATH=/home/ubuntu/.npm/_npx/4e81eea606e3d9df/node_modules/node/bin:$PATH npm test -- 'src/app/(panel)/gta/[id]/map/page.test.ts'
```

Expected: source-level page test passes.

- [ ] **Step 6: Commit map UI**

Run:

```bash
git status --short
git add 'src/app/(panel)/gta/[id]/layout.tsx' 'src/app/(panel)/gta/[id]/map/page.tsx' 'src/app/(panel)/gta/[id]/map/page.test.ts'
git commit -m "feat: add GTA live map page"
```

---

## Task 5: Verify, Build, And Deploy The GTA Map Slice

**Files:**
- Read-only verification across changed files.
- Runtime regeneration under `/opt/slutvival/games/gta/los-santos/server-data`.

- [ ] **Step 1: Run focused GTA map and bridge tests**

Run:

```bash
PATH=/home/ubuntu/.npm/_npx/4e81eea606e3d9df/node_modules/node/bin:$PATH npm test -- \
  src/lib/server/gta/players.test.ts \
  src/lib/server/gta/server-data.test.ts \
  'src/app/api/instances/[id]/gta/bridge/route.test.ts' \
  src/lib/gta-map-view.test.ts \
  'src/app/(panel)/gta/[id]/map/page.test.ts'
```

Expected: all selected tests pass.

- [ ] **Step 2: Run full verification**

Run:

```bash
PATH=/home/ubuntu/.npm/_npx/4e81eea606e3d9df/node_modules/node/bin:$PATH npm run test
PATH=/home/ubuntu/.npm/_npx/4e81eea606e3d9df/node_modules/node/bin:$PATH npm run typecheck
PATH=/home/ubuntu/.npm/_npx/4e81eea606e3d9df/node_modules/node/bin:$PATH npm run build
```

Expected:

- `npm run test` passes with no failed test files.
- `npm run typecheck` exits 0.
- `npm run build` exits 0. The existing Turbopack NFT warning from the backups/version import trace may still appear and is not part of this feature.

- [ ] **Step 3: Regenerate live GTA server resource files without printing secrets**

Run this from `/opt/slutvival/slutvival-panel`:

```bash
PATH=/home/ubuntu/.npm/_npx/4e81eea606e3d9df/node_modules/node/bin:$PATH npx vite-node -e '
import { getInstance } from "./src/lib/server/store";
import { ensureGtaServerData, readGtaBridgeToken } from "./src/lib/server/gta/server-data";

const inst = await getInstance("los-santos");
if (!inst || inst.game !== "gta") {
  throw new Error("GTA instance los-santos was not found");
}
await ensureGtaServerData(inst, { cloneBaseResources: false });
const token = await readGtaBridgeToken(inst);
if (!token) {
  throw new Error("GTA bridge token was not present after regeneration");
}
console.log("gta map server data seeded");
'
```

Expected: prints `gta map server data seeded` and does not print the bridge token.

- [ ] **Step 4: Verify generated Lua contains telemetry without exposing secrets**

Run:

```bash
grep -q 'GetEntityCoords' /opt/slutvival/games/gta/los-santos/server-data/resources/'[slutvival]'/slutvival-admin/server.lua
grep -q 'GetPedArmour' /opt/slutvival/games/gta/los-santos/server-data/resources/'[slutvival]'/slutvival-admin/server.lua
grep -q 'GetVehiclePedIsIn' /opt/slutvival/games/gta/los-santos/server-data/resources/'[slutvival]'/slutvival-admin/server.lua
grep -q 'Wait(2000)' /opt/slutvival/games/gta/los-santos/server-data/resources/'[slutvival]'/slutvival-admin/server.lua
```

Expected: all commands exit 0.

- [ ] **Step 5: Rebuild and restart the panel container**

Run:

```bash
docker compose up -d --build
```

Working directory:

```bash
/opt/slutvival/docker/stacks/slutvival-panel
```

Expected: `slutvival-panel` image builds and container starts.

- [ ] **Step 6: Restart GTA server so the resource reloads**

Run:

```bash
docker restart gta-los-santos
sleep 8
docker logs --tail 120 gta-los-santos
```

Expected: logs include `Started resource slutvival-admin`.

- [ ] **Step 7: Smoke-test bridge telemetry from the GTA container**

Run from `/opt/slutvival`:

```bash
TOKEN="$(awk '/slutvival_bridge_token/ {gsub(/"/, "", $3); print $3}' /opt/slutvival/games/gta/los-santos/server-data/server.secret.cfg)"
docker exec -e BRIDGE_TOKEN="$TOKEN" gta-los-santos sh -lc 'body="{\"type\":\"heartbeat\",\"serverToken\":\"$BRIDGE_TOKEN\",\"players\":[{\"serverId\":7,\"name\":\"Map Smoke\",\"pingMs\":12,\"identifiers\":[{\"type\":\"license\",\"value\":\"license:map-smoke\"}],\"position\":{\"x\":100,\"y\":200,\"z\":30},\"heading\":90,\"health\":188,\"armour\":55,\"vehicle\":{\"inVehicle\":false}}]}"; code=$(curl -sS -o /tmp/slutvival-map-bridge-response -w "%{http_code}" -X POST http://slutvival-panel:3000/api/instances/los-santos/gta/bridge -H "Content-Type: application/json" --data "$body"); if [ "$code" != "200" ]; then echo "bridge failed: $code"; cat /tmp/slutvival-map-bridge-response; exit 1; fi; if grep -q "\"ok\":true" /tmp/slutvival-map-bridge-response; then echo "gta map bridge ok"; else echo "bridge unexpected body"; cat /tmp/slutvival-map-bridge-response; exit 1; fi'
unset TOKEN
```

Expected: prints `gta map bridge ok` and does not print the token.

- [ ] **Step 8: Verify the map route is present and protected by login**

Run:

```bash
docker exec -i slutvival-panel node - <<'NODE'
const http = require("http");
const req = http.request({ hostname: "127.0.0.1", port: 3000, path: "/gta/los-santos/map", method: "GET" }, (res) => {
  console.log(`map page status ${res.statusCode}`);
  if (res.headers.location) console.log(`location ${res.headers.location}`);
  res.resume();
});
req.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
req.end();
NODE
```

Expected for an unauthenticated request: `map page status 307` and a login redirect location containing `/login?next=%2Fgta%2Flos-santos%2Fmap`.

- [ ] **Step 9: Commit final verification-only changes if any**

Run:

```bash
git status --short
```

Expected: clean working tree. If generated files under runtime data changed outside Git, do not add them. If source files changed during verification, inspect and commit only intentional source changes.
