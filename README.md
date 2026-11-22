# bytefightapp

Bytefight desktop client: a Next.js static export in a Tauri v2 shell, with a Rust backend that manages bots, maps, matches, and logs and runs the Python game engine.

This is a rewrite of the Electron client (`client/`). There's one app build per game. The game a build targets is described by [`gameconfig.json`](gameconfig.json).

## Develop

Prerequisites: Node 20+, Rust (stable), the [Tauri system dependencies](https://tauri.app/start/prerequisites/) (on Linux/WSL: `libwebkit2gtk-4.1-dev` etc.), and Python 3.12+ with `pydantic` to run matches.

```sh
git submodule update --init   # src/gamerenderer
npm install
npm run dev                   # = tauri dev (starts `next dev` on :3000)
npm run build                 # = tauri build (next build -> out/, then bundles)
npm run typecheck
cd src-tauri && cargo test
```

## Layout

| Path | What |
|---|---|
| `src/`, `common/`, `public/` | Next.js frontend (unchanged from the Electron client, plus the adapter below) |
| `src/lib/backend.ts` | Implements the `ElectronAPI` contract (`common/electron-api.ts`) with Tauri `invoke`/`listen` and installs it as `window.electron` |
| `src/lib/gameconfig.ts`, `gameconfig.json` | Static per-game config (currently maps only), also compiled into the Rust backend |
| `src/gamerenderer/` | Game renderer submodule |
| `src-tauri/src/` | Rust backend: `settings`, `bots`, `maps`, `matches`, `logs`, `runner` (engine process + TCP stream), `engine` (seeding) |
| `engine/` | Bundled Python engine (generated from the games repo; don't edit here) |
| `resources/` | `default-settings.json`, `default-maps/`, `example-bot/` |

## Runtime data

Everything lives in the app data dir (`app_data_dir()` for `com.bytefight.bytefightapp`, e.g. `~/.local/share/com.bytefight.bytefightapp` on Linux):

- `settings.json`: merged with `resources/default-settings.json` on every launch. `$/…` paths in settings are relative to this dir.
- `bots/`, `maps/`, `matches/`, `games/`, `logs/`: default locations, configurable in settings.
- `engine/`: the engine that matches actually run from. It's seeded from the bundled `engine/` when it's missing or its `ENGINE_VERSION.json` differs. This is a writable copy so a future engine auto-updater can replace it (see the `TODO(engine-updater)` in `src-tauri/src/engine.rs`).

## Backend contract

Commands return `{ success: true, ... }` / `{ success: false, error }` and never reject. Engine output arrives as events: `game-usr:stdout`, `game-sys:data`, `game-sys:socket-error`, `game-sys:process-error`, `game-sys:process-closed`. To add a command: write it in `src-tauri/src/<module>.rs`, register it in `lib.rs`'s `generate_handler!`, then add it to `common/electron-api.ts` and `src/lib/backend.ts`.
