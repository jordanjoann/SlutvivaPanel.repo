# GTA / FiveM Bootstrap Design

Date: 2026-07-04
Status: Approved design, pending written spec review

## Context

The panel already has a `gta` game id, a GTA / FiveM sidebar entry, and a coming-soon page. The instance model, store, provisioning, seed config, and runtime launch path are still mostly Vintage Story-specific. GTA should become the next real managed game, but it must stay owner-only for now.

Relevant upstream references:

- Cfx.re server setup overview: https://docs.fivem.net/docs/server-manual/setting-up-a-server/
- Cfx.re txAdmin setup guide: https://docs.fivem.net/docs/server-manual/setting-up-a-server-txadmin/
- Cfx.re vanilla FXServer Linux guide: https://docs.fivem.net/docs/server-manual/setting-up-a-server-vanilla/
- FiveM Linux artifact listing: https://runtime.fivem.net/artifacts/fivem/build_proot_linux/master/
- Base server data: https://github.com/citizenfx/cfx-server-data

The official docs require a Cfx.re license key from the Cfx.re portal. The Linux FXServer build is provided as a courtesy port, but it is the practical fit for this Linux/Docker host.

## Decisions

- GTA uses vanilla FXServer first, with txAdmin treated as an owner setup surface rather than a panel-owned automation API.
- GTA is owner-only in page access, nav, APIs, and instance visibility.
- The first server layout is `/opt/slutvival/games/gta/<server-id>`.
- The first public FiveM port is `30120` TCP/UDP.
- txAdmin uses `40120` internally or publicly only if the owner intentionally exposes it through the stack.
- The panel stores no Cfx license key, Steam Web API key, txAdmin password, or txAdmin state in Git.
- The panel becomes game-aware at the store/provisioning/path seams instead of forcing GTA through Vintage Story paths.
- Vintage Story behavior remains unchanged.

## Goals

- Make GTA / FiveM available to owner sessions in the panel.
- Create, list, open, start, stop, restart, and delete GTA instances.
- Generate a bootable default FXServer directory layout.
- Generate Docker compose for FXServer with deterministic container names, ports, labels, resources, and volumes.
- Seed a minimal `server.cfg` based on the official FXServer config shape.
- Keep license-key setup explicit and local.
- Preserve the existing Docker runtime, console/log streaming, stats sampling, and power controls where they are already game-neutral.
- Add tests that lock owner-only access and game-aware provisioning behavior.

## Non-Goals

- No FiveM resource marketplace in the first pass.
- No ESX, QBCore, or custom roleplay framework recipe deployment in the first pass.
- No deep txAdmin API integration.
- No txAdmin account-link automation.
- No player management unless reliable FXServer log parsing is added later.
- No GTA backup UI/API in the first implementation.
- No public access for admins, moderators, or viewers.
- No migration of Vintage Story instance data.

## Filesystem Layout

GTA instances live under the Slutvival root:

```text
/opt/slutvival/games/gta/<server-id>/
  server.yml
  docker-compose.yml
  .env
  server/
    run.sh
    FXServer files from the selected Linux artifact
  server-data/
    server.cfg
    server.secret.cfg
    resources/
    cache/
    txData/
```

Tracked files should be limited to descriptors and generated compose/config templates when they are intentionally committed. Runtime directories remain ignored:

- `games/**/server/`
- `games/**/server-data/cache/`
- `games/**/server-data/txData/`
- `games/**/server-data/server.secret.cfg`
- `.env` and `*.env`

The outer repo already ignores broad game runtime data. The implementation should add any missing GTA-specific ignore rules before writing local runtime state.

## Instance Model

The existing `GameId` already includes `gta`. The generic `Instance` type can still represent a GTA server with these conventions:

- `game: "gta"`
- `version`: FXServer artifact build number or `"recommended"` before install resolution.
- `port`: player port, default `30120`.
- `dataPath`: `/opt/slutvival/games/gta/<server-id>/server-data`.
- `runtime: "docker"`.
- `serverEngine: "fxserver"`. The `ServerEngine` union becomes `"stratum" | "vanilla" | "fxserver"`.
- `docker.containerName`: `gta-<server-id>`.
- `docker.image`: `slutvival/fxserver-base:bookworm`.
- `resources`: default to 4096 MB and 2 CPU.
- `maxPlayers`: default to 48.

The store should stop assuming every instance lives under `games/vintage-story`. It should resolve instance roots by game:

```text
vintage-story -> /opt/slutvival/games/vintage-story
gta           -> /opt/slutvival/games/gta
```

`listInstances(game)` reads only the matching game root when a game is provided. `getInstance(id)` searches all known game roots.

Instance ids must remain unique across all game roots. `createInstance` checks all known roots before creating a new id. `getInstance(id)` searches known roots in a deterministic order and returns the matching instance; duplicate ids are treated as a setup error.

## Artifact Installation

The first implementation should support installing the current recommended Linux FXServer build from the FiveM artifact listing. It should record what it installed in a local marker under the instance `server/` directory, such as:

```text
.slutvival-version = fxserver:<build>
```

The installer responsibilities are:

- Resolve the recommended Linux artifact URL.
- Download the artifact into a temporary staging directory.
- Extract with `tar`/`xz` tooling.
- Validate expected entrypoints such as `run.sh`.
- Replace the instance `server/` directory only after validation.
- Re-run safely when the expected build is already installed.

If artifact resolution or download fails, the panel should report a setup error and leave the existing server directory intact.

## Server Data And Secrets

The panel should seed `server-data/server.cfg` with a minimal vanilla FXServer config:

- `endpoint_add_tcp "0.0.0.0:<port>"`
- `endpoint_add_udp "0.0.0.0:<port>"`
- default core resources from `cfx-server-data`
- `sets tags "slutvival,default"`
- `sets locale "en-US"`
- `sv_hostname "<instance name>"`
- `sets sv_projectName "<instance name>"`
- `sets sv_projectDesc "<instance description>"`
- `set onesync on`
- `sv_maxclients <maxPlayers>`
- `exec server.secret.cfg`

`server.secret.cfg` is ignored runtime data. It contains local secrets:

```cfg
sv_licenseKey "..."
set steam_webApiKey ""
```

The panel should create `server.secret.cfg` with explanatory placeholder comments if it does not exist, but it must not invent a fake license key. Starting a GTA server without a real `sv_licenseKey` should fail with a clear panel log or API error.

The owner adds the license key manually over SSH for the first implementation. An owner-only license-key settings form is out of scope.

## Docker Runtime

The Docker runtime should stay the runtime control plane, but provisioning must become game-aware.

GTA compose/container settings:

- Image: `slutvival/fxserver-base:bookworm`, built from a tracked Dockerfile that installs runtime dependencies such as `bash`, `ca-certificates`, and `libatomic1`.
- Working directory: `/server-data`.
- Command: `bash /server/run.sh +exec server.cfg`.
- Volumes:
  - `./server:/server:ro`
  - `./server-data:/server-data:rw`
- Ports:
  - `<port>:<port>/tcp`
  - `<port>:<port>/udp`
- txAdmin port `40120` is not published by default.
- Labels:
  - `slutvival.panel.managed=true`
  - `slutvival.panel.instance=<id>`
  - `slutvival.panel.game=gta`

The implementation adds a small base-image build step before the first GTA container start. The existing Docker runtime continues handling start, stop, restart, kill, logs, stats, and stdin commands. Its game-specific responsibilities move into provisioning helpers so Vintage Story and GTA commands, mounts, env, compose, and install checks are selected by `instance.game`.

## Panel UI

The GTA page replaces the coming-soon card with an owner-only management page:

- Header: GTA / FiveM.
- Description: manage FiveM servers and txAdmin setup.
- New Server action for owners.
- Empty state when no GTA servers exist.
- Instance cards showing status, player capacity, port, artifact build, CPU, and memory.

The instance detail view can initially reuse a generic server layout rather than copying the Vintage Story route tree. The first owner-only tabs should be:

- Overview
- Console
- Files
- Settings, only for basic name/description/max players/port/resource edits
- Danger Zone

Vintage Story-specific tabs such as World, Mods, and Players should not appear for GTA until there is real GTA behavior behind them.

## Access Control

Owner access remains full. Non-owner access remains limited to the current Vintage Story paths and actions.

Required checks:

- `/gta` is visible only to owners.
- `/api/instances?game=gta` returns data only to owners.
- Creating a GTA instance requires owner.
- Reading, starting, stopping, restarting, deleting, editing files, and sending console commands for a GTA instance require owner.
- Non-owner attempts receive the same redirect or `403` behavior as other blocked management routes.

The proxy already blocks non-owner GTA paths through `canAccessPagePath` and `canAccessApiPath`. Any API routes touched for generic GTA support must also keep handler-level session checks, especially command and file routes.

## Error Handling

FXServer setup should fail closed:

- Missing Cfx license key: instance can exist, but start returns a clear setup error.
- Missing `run.sh`: start triggers install or reports that artifact install failed.
- Missing base resources: provisioning re-clones or reports a clear setup error.
- Docker image pull failure: start reports the Docker pull error.
- Port conflict: Docker start failure is surfaced to the owner.

The panel should never log secret values. It can log that `server.secret.cfg` is missing, placeholder-only, or present.

## Testing

Automated tests should cover:

- GTA remains owner-only in access policy and visible nav.
- Non-owner roles cannot access `/gta` or GTA instance APIs.
- Game-aware root/path resolution for Vintage Story and GTA.
- GTA instance defaults use port `30120`, `game: "gta"`, `serverEngine: "fxserver"`, and `gta-*` containers.
- GTA compose includes FXServer command, player port bindings, GTA labels, and server/server-data mounts.
- GTA compose does not publish txAdmin `40120` by default.
- GTA base-image build behavior is invoked before Docker container creation when the image is missing.
- Vintage Story compose remains unchanged.
- Starting a GTA server without a real secret config produces a setup error before Docker starts.

Manual verification should include:

- Add a real Cfx.re license key to the ignored `server.secret.cfg`.
- Create a GTA server from the owner panel.
- Confirm files are created under `/opt/slutvival/games/gta/<server-id>`.
- Confirm `docker compose config` succeeds for the generated GTA compose file.
- Start the server and confirm the container reaches running state.
- If txAdmin is exposed manually after the first pass, complete its first-run setup and confirm the panel still controls power/logs.
- Confirm admin, moderator, and viewer accounts cannot see GTA nav or access GTA URLs/APIs.

## Rollout

This should land in small commits:

1. Spec and tests.
2. Game-aware paths/store/provisioning without changing Vintage Story behavior.
3. GTA UI and owner-only navigation.
4. FXServer artifact/server-data bootstrap.
5. Production runtime bootstrap for the first GTA server.

The first deployed GTA server should remain private/owner-operated until the license key, txAdmin setup, firewall/exposure, and desired FiveM resource stack are confirmed.
