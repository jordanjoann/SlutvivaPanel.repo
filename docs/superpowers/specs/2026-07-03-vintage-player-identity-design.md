# Vintage Story Player Identity Design

## Context

The Players panel currently keeps manual management state in `vintage/ModConfig/panel-players.json`. A stale entry can store a generated `known-*` UID or a UID string as the display name, which makes the panel show identities like `bLRZEr65Nyp+9c7tZ7FGEQQS` instead of the actual Vintage Story username.

The live hub has authoritative Vintage Story player data in `vintage/Playerdata/playerdata.json`. For the observed admin account, that file maps:

- UID: `bLRZEr65Nyp+9c7tZ7FGEQQS`
- Username: `P1nkOblivion`

## Requirements

- The panel should display the Vintage Story username when `playerdata.json` has `LastKnownPlayername`.
- The panel should use the real Vintage Story `PlayerUID` for identity keys and management actions whenever known.
- Stale panel entries such as `known-p1nkoblivion` or records whose name is a UID should merge into the real server identity.
- `panel-players.json` remains useful for panel-managed overrides: role, whitelist state, playtime, and last-seen metadata.
- If the server has never seen a player, manual entries can still resolve through Vintage Story auth and then fall back to a generated `known-*` identity.
- Role lists should support current Vintage Story `Roles` arrays and `DefaultRoleCode`, not only the older `RoleByCode` map.

## Design

`src/lib/server/player-roster.ts` becomes the identity boundary for the Players API. It reads local server records from `Playerdata/playerdata.json` and manual panel records from `ModConfig/panel-players.json`, then merges them before returning online, offline, whitelist, and role-assignment lists.

Server player records are authoritative for `uid`, `name`, `role`, and server-derived last-seen timestamps. Panel records are merged in for management state, preserving whitelist and role changes where the server does not provide a fresher value. Alias matching recognizes names, UIDs, generated `known-*` IDs, and records where the UID was accidentally stored as the name.

`updateKnownPlayer` resolves the requested target through the merged local roster first. If local data has no match, it calls Vintage Story auth endpoints to resolve username-to-UID or UID-to-username. If auth resolution fails, it falls back to the existing generated identity behavior so manual management still works for unknown players.

## Error Handling

Malformed or missing JSON files return empty local records and preserve the previous fallback offline player behavior. Vintage Story auth failures are non-fatal and only affect new unknown manual entries. Network timeouts should not block the Players API indefinitely.

## Testing

Add focused Vitest coverage for:

- Server `playerdata.json` winning over stale `panel-players.json` identities.
- Online players receiving the real UID when their current online identity matches a known server username.
- `Roles` array and `DefaultRoleCode` parsing.
- Manual whitelist/role updates resolving names through Vintage Story auth before caching.
- Rewriting stale panel identities when a real local identity is available.
