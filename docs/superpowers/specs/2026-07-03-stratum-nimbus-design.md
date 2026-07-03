# Stratum and Nimbus Panel-Managed Network Design

Date: 2026-07-03
Status: Approved design, pending written spec review

## Context

The panel currently provisions Vintage Story instances under `/opt/slutvival/games/vintage-story` and runs each backend directly with Docker. The new direction is to use Stratum as the default Vintage Story server engine and Nimbus as the single player-facing proxy.

Relevant upstream references:

- Stratum repository: https://github.com/StratumServer/Stratum
- Nimbus Mod DB page: https://mods.vintagestory.at/nimbusproxy
- Nimbus getting started guide: https://github.com/StratumServer/Nimbus/wiki/Getting-Started
- Nimbus server mod guide: https://github.com/StratumServer/Nimbus/wiki/Server-Mod

## Decisions

- The panel is the source of truth for Stratum and Nimbus installation, configuration, and Docker startup.
- Nimbus is the only public Vintage Story entry point.
- Nimbus listens publicly on `play.slutvival.com:42420`.
- Backend server ports are private Docker network ports only.
- Stratum is the default backend engine.
- Vanilla Vintage Story remains as a hidden fallback path in code, not a visible UI selector.
- Stratum and Nimbus use pinned releases with explicit manual update actions.
- The initial backend is a dedicated `hub` instance.
- `hub` starts as a creative superflat landing world by default.
- Stale `testing` instance state is not part of the target design.

## Goals

- Create a clean Stratum-backed `hub` server behind Nimbus.
- Install Nimbus.Proxy once locally and run it as the only public Vintage Story service.
- Install Nimbus.ServerMod into every managed backend instance.
- Write matching Nimbus proxy and backend configs from panel-owned instance data.
- Block direct backend joins by requiring Nimbus reservations.
- Keep future world instances easy to add behind the same proxy.
- Preserve enough fallback logic to run vanilla Vintage Story if Stratum needs to be rolled back.

## Non-Goals

- No automatic "always latest" Stratum or Nimbus updates.
- No public backend port publishing after Nimbus is enabled.
- No visible per-instance engine selector in the first version.
- No manual-only Nimbus config ownership.
- No player client mod distribution automation. The panel can document that players need RedirectFix where Nimbus requires it, but it should not try to manage player machines.

## Architecture

The panel manages a single Vintage Story network:

```text
player -> play.slutvival.com:42420 -> Nimbus.Proxy -> hub
```

Future servers join the same shape:

```text
player -> play.slutvival.com:42420 -> Nimbus.Proxy -> private backend instances
```

The panel will download and extract pinned Stratum and Nimbus artifacts into managed tool directories under the Slutvival root. Instance data remains under `/opt/slutvival/games/vintage-story/<instance-id>`.

Backends run Stratum by default:

```text
dotnet StratumServer.dll --dataPath /data
```

The fallback launch path remains available internally:

```text
dotnet VintagestoryServer.dll --dataPath /data
```

The fallback should be code-supported but not exposed as a normal per-instance choice until there is a real operational need.

## Components

### Artifact Manager

The artifact manager downloads pinned release zips, extracts them idempotently, and records installed metadata. It validates the expected entrypoints exist before marking an artifact installed.

Expected responsibilities:

- Resolve configured Stratum and Nimbus release pins.
- Download release assets to a cache or staging directory.
- Extract to a versioned managed directory.
- Validate required files such as Stratum server binaries and Nimbus proxy/server mod assets.
- Avoid changing live server configuration if an artifact install fails.

### Instance Provisioning

Provisioning creates and updates Vintage Story instances using the selected backend engine. For the initial setup it creates `hub` if missing.

Expected responsibilities:

- Create `/opt/slutvival/games/vintage-story/hub`.
- Seed `hub` as a creative superflat world.
- Seed normal Vintage Story data directories, including `Mods` and `ModConfig`.
- Install server binaries for Stratum by default.
- Keep vanilla installation support for fallback.
- Preserve existing backup and file-manager layout expectations.

### Nimbus Manager

The Nimbus manager owns proxy and backend config generation.

Expected responsibilities:

- Create or reuse a local Nimbus shared registry secret.
- Write `nimbus.proxy.toml`.
- Add active backend instances to the proxy `[servers]` map.
- Set the default `try` route to `hub`.
- Install `Nimbus.ServerMod` into each backend's `vintage/Mods`.
- Write each backend's `vintage/ModConfig/nimbus-server.json`.
- Set backend `ServerId` values to match proxy server keys.
- Set backend `PublicHost` to `play.slutvival.com`.
- Set backend `PublicPort` to `42420`.
- Enable `ReservationRequired`.
- Configure the registry URL over the private Docker network, not the public internet.

Because the proxy process is separate from backend containers, embedded registry mode must expose an HTTP bind inside the Docker network when backends need to heartbeat/register.

### Docker Runtime

Docker remains the runtime control plane.

Expected responsibilities:

- Start backend containers on a shared private Docker network.
- Do not publish backend Vintage Story ports on the host.
- Start the Nimbus proxy on the same private network.
- Publish only Nimbus on host port `42420`.
- Keep container names deterministic enough for config generation and cleanup.
- Remove or ignore stale direct Vintage Story containers that no longer match the desired network model.

### Panel UI And API

The first UI/API version should stay small.

Expected responsibilities:

- Provide a setup/install action for the managed Stratum/Nimbus network.
- Show whether required artifacts are installed.
- Show whether Nimbus is configured and running.
- Show the public connection address: `play.slutvival.com:42420`.
- Provide manual update actions for pinned Stratum and Nimbus releases.
- Avoid a large advanced Nimbus editor in the first version.

## Data Flow

Setup flow:

```text
Panel setup action
  -> ensure pinned Stratum artifact installed
  -> ensure pinned Nimbus artifact installed
  -> ensure hub instance exists
  -> seed hub as creative superflat
  -> install Nimbus.ServerMod into hub
  -> write hub nimbus-server.json
  -> write nimbus.proxy.toml with hub as default
  -> start private hub backend
  -> start public Nimbus proxy
```

Adding a future backend:

```text
Create instance
  -> install/validate Stratum backend
  -> install Nimbus.ServerMod
  -> write backend nimbus-server.json
  -> regenerate nimbus.proxy.toml
  -> restart/reload affected services as needed
```

Manual update flow:

```text
User selects update action
  -> download pinned target artifact
  -> validate extracted files
  -> stop affected process if needed
  -> switch managed artifact pointer or install marker
  -> regenerate config if needed
  -> restart affected services
```

## Error Handling

Setup and update actions should fail closed. If downloads, extraction, validation, or config writes fail, the panel should report a clear error and avoid partially switching the live network.

Config writes should be atomic where practical:

```text
write temp file -> validate shape -> replace live file
```

The panel should avoid printing secrets in logs. Logs can state whether a Nimbus shared secret exists, was created, or was rotated, but must never print the value.

## Secrets

Nimbus shared registry credentials belong in the local secrets/config area outside git. The generated backend and proxy configs may need to contain the shared secret for Nimbus to operate; those generated runtime files must remain outside the repository.

Implementation must treat these as sensitive:

- Nimbus shared registry secret.
- Any downloaded release authentication token, if GitHub rate limits ever require one.
- Any future private server or registry credentials.

## Testing And Verification

Automated tests should cover:

- Artifact URL/version helper behavior.
- Stratum versus vanilla command selection.
- Docker config generation with no public backend port publishing.
- Nimbus proxy config generation.
- Nimbus backend config generation.
- Hub provisioning defaults, including creative/superflat intent.
- Idempotent setup when artifacts, configs, or the hub already exist.

Manual verification should cover:

- No stale direct Vintage Story containers remain.
- Backend containers are reachable only on the private Docker network.
- Nimbus proxy publishes host port `42420`.
- `play.slutvival.com:42420` is the documented player address.
- The panel can still manage a stopped backend while Nimbus remains the public entry point.

## Open Implementation Notes

- The implementation should verify exact Stratum and Nimbus release asset names before coding download selection.
- The implementation should inspect the Nimbus release zip layout before choosing the final extracted file paths.
- The superflat creative world seeding should use existing Vintage Story config structures where possible instead of brittle text rewriting.
- DNS for `play.slutvival.com` must point to this server for external players to use the hostname.
