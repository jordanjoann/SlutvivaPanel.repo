# Slutvival Panel

A premium, self-hosted **game server operating system** for the Slutvival ecosystem —
comparable to Pterodactyl / Creeper Panel, but purpose-built and beautiful. The first
fully-supported game is **Vintage Story**, with the architecture ready for FiveM, Abiotic
Factor, Minecraft, Terraria and more.

Built to feel like a modern SaaS product: soft charcoal surfaces, a muted-pink accent,
Grafana-style live metrics, skeleton loaders, toasts, and smooth animations.

---

## Highlights

- **Grafana-style dashboard** — live CPU / RAM / disk / network / per-core / top-process
  graphs streamed over Server-Sent Events.
- **Full Vintage Story management** — instance list → server with 10 tabs:
  Overview · Console · Players · World · Files · Mods · Backups · Performance · Admin · Danger Zone.
- **Live streaming console** with search, level filters, pause/resume auto-scroll, command
  history (↑/↓) and one-click admin commands.
- **Native file manager** — folder browser, multi-file tabs, editor with line numbers,
  save/revert/download, upload + drag-and-drop, rename/delete, permissions.
- **Mods manager** — installed view (enable/update/delete) and a searchable repository with
  per-version install, dependency detection, and drag-and-drop `.zip` installs.
- **Backups, world tools, version updates** — the update workflow backs up → stops →
  downloads → replaces → restarts while **never touching the data path**.
- **Command-palette (⌘K)**, responsive layout (desktop-first, tablet & phone friendly),
  destructive-action confirmations with type-to-confirm.

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router) + React 19 + TypeScript
- Tailwind CSS v4 + [shadcn/ui](https://ui.shadcn.com) (Base UI primitives)
- Recharts (graphs) · lucide-react (icons) · sonner (toasts) · SWR (data) · motion
- Server: `dockerode`, `systeminformation`, `yaml`, native Node `fs`/`child_process`

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in secrets (never commit real values)
npm run dev                  # http://localhost:3000
```

New installs start with an empty instance list. Create a Vintage Story server from the
panel when you are ready to write its first-run config.

```bash
npm run build && npm start   # production
```

## Runtime model

Each server instance is supervised by a pluggable **runtime**, chosen automatically:

1. **Docker** (`dockerode`) — starts/stops the container, streams logs, forwards stdin.
2. **Process** — launches `dotnet VintagestoryServer.dll --dataPath <data>` directly and
   streams stdout/stderr.
3. **Simulated** — a built-in, fully-interactive simulator (VS-style boot logs, players,
   wandering stats, command responses) used when neither Docker nor the server files are
   present. This makes the whole UI work end-to-end on a dev box.

Host metrics are read for real via `systeminformation`, with a synthetic fallback so the
dashboard is never empty.

## Infrastructure layout

Production mirrors the Slutvival infra exactly (configurable via `SLUTVIVAL_ROOT`):

```
/opt/slutvival/games/vintage-story/{serverId}/
├── server.yml            # instance definition (read/written by the panel)
├── docker-compose.yml
├── .env
└── vintage/              # --dataPath (never deleted on update)
    ├── Mods · Managed-Mods · ModConfig
    ├── Saves · Logs · Backups · BackupSaves
    └── serverconfig.json
```

On Windows dev boxes this falls back to `./.slutvival-data`.

## Configuration

All secrets are read from the environment and **never exposed to the browser**. See
[`.env.example`](.env.example) for the full list (panel auth, Discord, Cloudflare, GitHub,
Vintage Story account, plus optional path/runtime overrides).

## Project structure

```
src/
├── app/
│   ├── (panel)/               # authenticated shell + all pages
│   │   ├── page.tsx           # dashboard (landing)
│   │   ├── vintage-story/     # instance list + [id] server tabs
│   │   └── discord · settings · gta · abiotic-factor · users
│   └── api/                   # route handlers (instances, metrics SSE, files, mods, …)
├── components/
│   ├── layout/                # sidebar, topbar, command palette
│   ├── panel/                 # stat card, status badge, confirm dialog, section card, …
│   ├── charts/                # recharts wrappers
│   ├── vintage-story/         # console, file manager, mods manager, …
│   └── ui/                    # shadcn/ui primitives
├── hooks/                     # SWR + SSE hooks
└── lib/
    ├── server/                # config, store, runtimes, metrics, files, mods, backups, …
    └── types.ts · api.ts · format.ts · status.ts · games.ts · nav.ts
```

## Roadmap

FiveM/GTA · Abiotic Factor · Minecraft · Terraria · SteamCMD · Users & roles (RBAC) ·
Scheduler/automation · Map previews · Discord bot automation.
