# GTA Server Map Design

Date: 2026-07-05
Status: Approved direction, pending written spec review

## Goal

Add a first GTA `Map` tab that shows live online player positions with hover details. The first version should answer the staff question "where is everyone right now?" without adding moderation controls or paid third-party tooling.

The product reference is MonoAdmin's public Server Map documentation: live online player markers, player details for name, server ID, health, armour, vehicle, map pan/zoom, and an online-count badge. We are using that as behavior inspiration only, not copying code, assets, or proprietary implementation.

## Decisions

- Build approach 1: a live tactical map first.
- Add `Map` as its own GTA instance tab, between `Players` and `Files`.
- Extend the existing `slutvival-admin` FiveM resource heartbeat instead of adding a second resource.
- Extend the existing GTA player bridge/player payloads with live telemetry for online players.
- Render a self-contained panel map surface for v1 using GTA coordinate projection and player markers.
- Show hover details for player name, server ID, ping, health, armour, vehicle, heading, and coordinates.
- Keep browser access owner-only, matching current GTA access.
- Do not add map-based Kick/Warn/Ban in this slice.
- Do not block v1 on a real Los Santos raster image. The rendering layer should allow swapping in a calibrated image later.

## User Experience

The GTA instance tabs become:

- Overview
- Console
- Players
- Map
- Files
- Settings

The Map page uses the existing panel header pattern:

- Title: `Map`
- Description: live GTA player positions and health telemetry.
- Icon: map/location oriented icon from `lucide-react`.

The primary content is a single map workspace with:

- A top-right online count badge.
- A bridge status indicator reusing the same bridge semantics as the Players tab.
- Pan and zoom controls through pointer drag and mouse wheel.
- Reset view control.
- Player markers for online players only.
- Distinct marker styling for on-foot versus in-vehicle players.
- Hover and keyboard-focus details for each marker.
- Touch/mobile fallback: tapping a marker pins the same details panel.
- Empty state when the bridge is offline or no online players have coordinates.

Hover details include:

- Name.
- Server ID.
- Ping.
- Health.
- Armour.
- Vehicle label if the player is in a vehicle.
- Heading.
- Coordinates as rounded `x, y, z`.
- Last telemetry age.

The page should refresh around every 2 seconds. The marker should not jump the whole layout when updates arrive.

## Telemetry Contract

Extend `GtaBridgePlayer` with optional live telemetry:

```ts
position?: {
  x: number;
  y: number;
  z: number;
};
heading?: number;
health?: number;
armour?: number;
vehicle?: {
  inVehicle: boolean;
  model?: string;
  modelHash?: number;
  plate?: string;
};
```

The API payload can keep telemetry on `GtaPlayerSummary` for online players. Offline players may keep their existing identity/session fields, but the Map page should ignore offline players.

Invalid or missing telemetry should not drop the player from the Players tab. It only prevents a marker from being plotted.

## FiveM Resource

Update the generated `server-data/resources/[slutvival]/slutvival-admin/server.lua` resource.

`collectPlayer` should continue sending:

- server ID
- name
- ping
- identifiers

It should also send live telemetry when a ped exists:

- `GetPlayerPed(player)`
- `GetEntityCoords(ped)`
- `GetEntityHeading(ped)`
- `GetEntityHealth(ped)`
- `GetPedArmour(ped)`
- vehicle state from `GetVehiclePedIsIn(ped, false)`
- vehicle model hash and plate if available

If any native is unavailable or returns unusable values, the resource should omit that field instead of failing the whole heartbeat.

Heartbeat interval should be tightened from 60 seconds to about 2 seconds for live map usefulness. This increases bridge traffic, but the payload is small and local to the Docker network. Join/drop/ban behavior should remain unchanged.

## Backend Architecture

Keep the current file-backed GTA player store under:

```text
/opt/slutvival/games/gta/los-santos/server-data/slutvival/
  players.json
  sessions.json
  punishments.json
  bridge.json
```

Store live telemetry on the stored player record because it represents the latest known online state. Persisting it in `players.json` is acceptable for v1 because it keeps the implementation small and survives page reloads. Offline players should not be treated as active map markers after the normal online window expires.

Add validation helpers in `src/lib/server/gta/players.ts` for:

- finite coordinates
- sane heading range
- non-negative health and armour
- optional vehicle object

The bridge should reject malformed telemetry with `400` only when the field is present but structurally invalid. Missing telemetry remains valid.

## API Design

Use the existing owner-only route:

```text
GET /api/instances/[id]/gta/players
```

This keeps the Map and Players tab backed by one source of truth. It avoids a parallel route until the map needs a different data shape.

Add typed client helpers only if needed for naming clarity:

```ts
api.gta.players.list(id)
```

The Map page can consume the same payload and derive:

- `onlinePlayers`: players where `online === true`
- `mappedPlayers`: online players with valid `position`
- `unmappedCount`: online players missing valid `position`
- `bridge.online`

## Map Rendering

Create small pure helpers, likely in `src/lib/gta-map-view.ts`, for:

- filtering players to mapped online players
- projecting GTA coordinates into map percentages
- clamping marker placement
- formatting health, armour, vehicle, and coordinates

Use conservative map extents as constants for v1, for example:

```ts
const GTA_MAP_BOUNDS = {
  minX: -4500,
  maxX: 4500,
  minY: -4500,
  maxY: 8500,
};
```

The UI should use a self-contained CSS-rendered map surface:

- dark neutral background
- subtle grid and quadrant labels
- coastline/zone hints can be abstract, not decorative clutter
- markers remain the strongest visual element

This is intentionally not a real-world map yet. The marker projection helpers should be isolated so a calibrated image can replace the background later without changing bridge data.

## Security And Privacy

- Browser route and API remain owner-only.
- The FiveM bridge remains protected by the per-instance bridge token.
- The bridge token is not sent to the client and is not logged.
- Telemetry is limited to online player position, health, armour, heading, ping, and vehicle state.
- No screenshots, inventory, job, framework identity, money, voice state, or private framework data in this slice.
- Hover details are visible only to the authenticated owner because the surrounding GTA area is owner-only.

## Error Handling

- If the bridge is offline, show the map shell with a clear bridge-offline empty state.
- If players are online but have no coordinates, show online count plus an unmapped explanation.
- If telemetry fields are malformed, reject that heartbeat with a bridge validation error and keep the previous good state.
- If the map API fails, show the existing panel error/empty style rather than a blank map.
- If the map receives no players, avoid rendering placeholder fake markers.

## Testing

Unit tests:

- Telemetry validation accepts finite coordinates and rejects malformed objects.
- Heartbeat upsert stores position, heading, health, armour, and vehicle data.
- Offline/stale players are not returned as active map candidates.
- Map projection converts GTA coordinates into bounded percentages.
- Formatting helpers handle missing health, armour, vehicle, and coordinates.

Route tests:

- Existing GTA players route returns telemetry fields for online players.
- Bridge route accepts heartbeat payloads with telemetry.
- Bridge route rejects structurally invalid telemetry.

Manual verification:

- Start the panel and GTA server.
- Confirm `slutvival-admin` starts.
- Join the GTA server.
- Confirm the player appears on the Map tab.
- Move in-game and confirm marker position updates.
- Hover the marker and confirm name, health, armour, server ID, ping, and coordinates are shown.
- Enter a vehicle and confirm vehicle state appears when the FiveM native data is available.
- Disconnect and confirm the marker disappears after the online window.

## Non-Goals

- No Kick/Warn/Ban buttons on the map.
- No player trails or heatmaps.
- No route playback.
- No real Los Santos raster map asset in v1.
- No marker clustering.
- No map filters beyond online/mapped state.
- No multi-server map view.
- No player monitor, screenshots, spectate, or camera streaming.
- No ESX, QBCore, Qbox, inventory, job, money, or owned-vehicle integration.

## Implementation Notes

The first implementation should be a complete vertical slice:

1. Add telemetry types and validation tests.
2. Extend GTA bridge heartbeat handling.
3. Extend generated FiveM resource telemetry collection.
4. Add pure map projection/view helpers and tests.
5. Add `Map` tab to the GTA layout.
6. Build `/gta/[id]/map` page using the existing players API.
7. Verify the running GTA container can post live telemetry through the bridge.

The main invalidator is whether server-side FiveM natives provide all desired ped/vehicle details in the current FXServer runtime. If health, armour, or vehicle data is unavailable server-side, v1 should still ship position/name/server ID/ping and show unavailable fields cleanly instead of blocking the map.
