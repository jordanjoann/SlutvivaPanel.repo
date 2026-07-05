# GTA Players Admin Design

Date: 2026-07-05
Status: Approved direction, pending written spec review

## Goal

Add a first-class GTA Players tab to the panel for online/offline player visibility and basic moderation actions. The first version should feel closer to MonoAdmin's player workflow than the existing Vintage Story list: player roster on the left, selected player details and actions on the right.

This is not an Admin tab. GTA admin tools should become separate panel tabs as they earn their place.

## Decisions

- Add `Players` as a GTA instance tab between `Console` and `Files`.
- Build a GTA-specific player API and data model instead of stretching the current Vintage Story player roster API.
- Track offline players only from the moment this feature is installed onward.
- Add a small FiveM resource named `slutvival-admin` under GTA `server-data/resources`.
- Persist player history and moderation records in panel-owned JSON files under the GTA instance data path for the first implementation.
- Support `Kick`, `Warn`, and `Ban` in the first slice.
- Enforce bans in the FiveM resource by checking connecting player identifiers against panel-owned ban records.
- Keep GTA admin access owner-only for this first implementation, matching the current GTA access model.
- Do not copy MonoAdmin code, assets, or proprietary implementation. Use the public docs and screenshot only as product reference for our own panel-native workflow.

## User Experience

The GTA instance layout tabs become:

- Overview
- Console
- Players
- Files
- Settings

The Players page uses a two-pane layout on desktop:

- Left pane: searchable player list.
- Right pane: selected player profile.

On narrow screens, the layout stacks with the list first and the selected player profile underneath.

The left pane includes:

- Search by player name, server ID, or identifier.
- Filter control for `All`, `Online`, and `Offline`.
- Count summary for online and offline tracked players.
- Rows showing display name, online/offline status, server ID when online, and ping when online.
- Stable empty states for no tracked players, no online players, and no matching search result.

The right pane includes:

- Player display name and status.
- Server ID, ping, first seen, last seen, and total tracked playtime where known.
- Identifier list grouped by type: `license`, `license2`, `discord`, `steam`, `fivem`, and `ip`.
- Session history with joined time, left time, duration, and drop reason when known.
- Moderation history showing warnings, kicks, bans, revocations, actor, reason, and timestamp.
- Action buttons for `Kick`, `Warn`, and `Ban`.

Action behavior:

- `Kick` is enabled only for online players.
- `Warn` is available for online and offline players and creates a moderation record.
- `Ban` is available for online and offline players and creates an active ban record.
- Banning an online player also disconnects them.
- Destructive actions use the existing confirm dialog pattern.

## Backend Architecture

Create a GTA-specific server module under `src/lib/server/gta/players.ts`.

Responsibilities:

- Read and write GTA player state for one instance.
- Merge reported online state with persisted player records.
- Record joins, drops, sessions, warnings, kicks, and bans.
- Resolve player records by stable player id, server id, name, or identifier.
- Decide whether a connecting player is banned.
- Produce API payloads shaped for the Players page.

Use JSON files for the first pass because the panel already uses file-backed instance data and this keeps the feature reviewable:

```text
/opt/slutvival/games/gta/los-santos/server-data/slutvival/
  players.json
  sessions.json
  punishments.json
```

The implementation should write through temporary files and rename atomically where practical. The storage format should keep timestamps as epoch milliseconds.

Do not reuse `src/lib/server/player-roster.ts`; it is tightly coupled to Vintage Story role and whitelist files.

## API Design

Create GTA-scoped player routes:

```text
GET  /api/instances/[id]/gta/players
POST /api/instances/[id]/gta/players/action
POST /api/instances/[id]/gta/bridge
```

`GET /gta/players` returns:

- `players`: merged online/offline GTA player summaries.
- `selectedPlayer`: omitted by default; the client can derive initial selection from the list.
- `onlineCount`
- `offlineCount`
- `punishmentCount`

`POST /gta/players/action` accepts:

- `action`: `kick`, `warn`, or `ban`.
- `playerId`: panel stable player id.
- `reason`: required for `warn` and `ban`, optional for `kick`.

The route validates owner access, confirms the instance is GTA, records the moderation event, and asks the bridge to execute the live action when required.

`POST /gta/bridge` is called by the local FiveM resource. It accepts:

- `type`: `heartbeat`, `playerJoin`, `playerDrop`, or `banCheck`.
- `serverToken`: shared local bridge token.
- Event-specific player data.

The bridge route is not session-authenticated because FiveM is not a browser user, but it must require a per-instance token stored outside Git in GTA runtime files.

## FiveM Resource

Create this resource in the generated GTA server data:

```text
server-data/resources/[slutvival]/slutvival-admin/
  fxmanifest.lua
  server.lua
```

Add `ensure slutvival-admin` to the generated `server.cfg` after the default resources.

The resource responsibilities:

- Send a heartbeat with all current online players.
- Send player join events.
- Send player drop events with drop reason.
- Check bans during `playerConnecting` and reject active bans.
- Register server commands that the panel can trigger through the existing console command route for live actions when direct bridge callbacks are not available.

Player data sent to the panel should include:

- FiveM server id.
- Player display name.
- Ping.
- Identifiers from `GetPlayerIdentifiers`.
- Event timestamp.

The resource should not collect inventory, framework job, coordinates, screenshots, voice state, or private framework data in v1.

## Security

- GTA Players stays owner-only in browser routes and APIs.
- The bridge token is generated into local runtime data and never committed.
- The bridge route rejects missing or incorrect tokens.
- The bridge route rejects non-GTA instances.
- Ban enforcement matches against stable identifiers, preferring `license` and `license2`.
- IP identifiers may be displayed to the owner but are not treated as the only durable ban identity.
- Moderation actions are recorded with actor account id/name where available.
- No Cfx.re license key, Steam Web API key, or bridge token is logged or returned to the client.

## Error Handling

- If the FiveM resource has not checked in yet, the Players page still renders tracked offline players and shows a clear empty/offline bridge state.
- If a live kick or online ban command fails, the API returns an error and does not pretend the live action happened.
- If a ban record is created but the online disconnect fails, the response reports that the ban is active but the live disconnect failed.
- Malformed bridge payloads return `400`.
- Unknown player ids return `404`.

## Testing

Unit tests:

- GTA player merge keeps online players online and tracked offline players offline.
- Join and drop events create/update player and session records.
- Ban matching uses `license` and `license2` identifiers.
- Warn/ban/kick records validate required reason fields correctly.
- Bridge token validation rejects missing and incorrect tokens.

Route tests:

- Non-owner sessions cannot read or mutate GTA players.
- Vintage Story instances cannot use GTA player routes.
- `Kick` requires an online player.
- `Warn` and `Ban` work for tracked offline players.

Manual verification:

- Start the GTA server.
- Confirm `slutvival-admin` is ensured by FXServer.
- Join the server and confirm the player appears online in the Players tab.
- Disconnect and confirm the player moves offline.
- Kick an online player from the panel.
- Warn an offline player and confirm the record appears.
- Ban a player, reconnect, and confirm FiveM rejects the connection.

## Non-Goals

- No live map in this slice.
- No entity browser or vehicle/NPC/object cleanup in this slice.
- No reports system in this slice.
- No player monitor or screenshot capture.
- No ESX, QBCore, inventory, owned vehicle, or job integration.
- No multi-server GTA management.
- No staff role delegation beyond owner-only access.

## Implementation Notes

The first implementation should prioritize a complete vertical slice over breadth:

1. Add the `Players` tab and route.
2. Add server-side GTA player storage and tests.
3. Add owner-only GTA player APIs.
4. Add the `slutvival-admin` resource generator and ensure it is included in `server.cfg`.
5. Wire the page to the API.
6. Verify online/offline tracking and Kick/Warn/Ban against the running GTA server.

If direct HTTP from FXServer to the panel is awkward in the container network, the fallback is to write bridge state to a local JSON file inside `server-data/slutvival/` and have the panel read it. The preferred approach remains an authenticated local bridge API because it gives lower-latency joins, drops, and ban checks.
