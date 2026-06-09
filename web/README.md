# Skills Manager Web Companion

[中文说明](./README.zh-CN.md)

Linux-only browser UI for `xingkongliang/skills-manager`. The Web companion runs a local Fastify API server plus a React client. The server talks to `skills-manager-cli --json`; the browser never runs the CLI directly.

The project now lives under the main Skills Manager repository:

```text
skills-manager/
  web/
```

## What Must Be Installed First

- Linux.
- Node.js 20+.
- Rust toolchain with `cargo`, required when building or installing `skills-manager-cli` from source.
- A working `skills-manager-cli` binary. This is the required backend for the Web UI.
- Git, optional but needed for Git-backed skills, Git Backup, pull, push, and installing skills from Git URLs.

You do not need to run the desktop app before using the Web UI. The Web UI and the desktop app both use the local Skills Manager data through the CLI.

## Required Plugins

No extra browser extension, Skills Manager plugin, or Tauri plugin needs to be installed manually.

The client imports some Tauri plugin APIs because it reuses upstream desktop React views, but the Web build maps those imports to browser shims in `client/src/lib/browser-shims.ts`. The npm packages used for development are installed by `npm install`.

## Install Order

### 1. Install the CLI from the parent project

From the repository root:

```bash
cd /path/to/skills-manager
npm install
npm run cli:install
```

This installs the binary at:

```text
~/.cargo/bin/skills-manager-cli
```

Check it:

```bash
~/.cargo/bin/skills-manager-cli --help
```

If `skills-manager-cli` is already on `PATH`, you can skip reinstalling it.

### 2. Install Web dependencies

From the Web project:

```bash
cd /path/to/skills-manager/web
npm install
```

Use `npm ci` instead of `npm install` when you want a clean, lockfile-exact install.

### 3. Configure the server environment

For local use, exporting only the CLI path is usually enough:

```bash
export SKILLS_MANAGER_CLI="$HOME/.cargo/bin/skills-manager-cli"
```

You can also copy the template and source it in your shell:

```bash
cd /path/to/skills-manager/web
cp .env.example .env
set -a
source .env
set +a
```

The server reads environment variables from the process environment. The `.env` file is a template unless your shell, service manager, or another tool loads it.

## Run the Web UI in Development

Run the API server in one terminal:

```bash
cd /path/to/skills-manager/web
SKILLS_MANAGER_CLI="$HOME/.cargo/bin/skills-manager-cli" npm run dev
```

Run the Vite client in a second terminal:

```bash
cd /path/to/skills-manager/web
npm run dev:client
```

Open:

```text
http://127.0.0.1:1420
```

The Vite client proxies `/api` to the API server at `http://127.0.0.1:17321`. Keep both terminals running while developing. If the API server is stopped, the page can load but data and write actions will fail.

## Run a Built Web UI

Build both the server and client:

```bash
cd /path/to/skills-manager/web
npm run build
```

Start the built server:

```bash
SKILLS_MANAGER_CLI="$HOME/.cargo/bin/skills-manager-cli" npm run start --workspace server
```

Open:

```text
http://127.0.0.1:17321
```

The server serves `client/dist` when the client has been built.

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `SKILLS_MANAGER_CLI` | Recommended | CLI executable path. Defaults to `skills-manager-cli` in `PATH`. |
| `SKILLS_MANAGER_WEB_HOST` | No | Server host. Defaults to `127.0.0.1`. |
| `SKILLS_MANAGER_WEB_PORT` | No | Server port. Defaults to `17321`. |
| `SKILLS_MANAGER_WEB_TOKEN` | Conditional | Required when `SKILLS_MANAGER_WEB_HOST=0.0.0.0`. |
| `SKILLS_MANAGER_SKILLS_ROOT` | No | Optional path passed to the CLI as `--skills-root <path>`. |
| `SKILLS_MANAGER_WEB_DATA_DIR` | No | Stores `audit.jsonl` and `commands.jsonl`. Defaults to `~/.local/share/skills-manager-web`. |

For normal browser use, keep the server on `127.0.0.1`. If you bind to `0.0.0.0`, the backend requires `SKILLS_MANAGER_WEB_TOKEN`. The current browser client does not provide a token-entry screen, so remote exposure should be handled with an authenticated reverse proxy or another layer that sends `Authorization: Bearer <token>` to `/api`.

## Pages and Routes

Core Skills Manager routes:

- `/` - desktop-style dashboard.
- `/install` - Marketplace and skill installation.
- `/my-skills` - installed skills.
- `/global-workspace` - global agent workspace overview.
- `/global-workspace/:agentKey` - one agent workspace.
- `/project/:id` - project workspace detail.
- `/settings` - desktop-style settings.

Web console routes:

- `/web` - repository paths, counts, active preset, recent jobs.
- `/web/skills` - list, search, install, update, check, export, tag, adopt, and delete skills.
- `/web/presets` - list, preview, apply, deactivate, add/remove skills, and sync presets.
- `/web/tools` - read-only tool state.
- `/web/git` - status, init, clone, remote, pull, push, commit, versions, and restore.
- `/web/operations` - job queue, command argv, stdout/stderr, errors, and durations.
- `/web/settings` - theme, language, and central repository path controls.

High-risk writes require frontend confirmation and backend `confirm: true`. Skill deletion must run `remove-dry-run` before the delete endpoint accepts it.

## Tests

```bash
npm run lint
npm run test
```

`npm run test` runs server unit/API tests and the client production build.

## systemd User Service

Example unit: `docs/systemd-user.service`.

```bash
mkdir -p ~/.config/skills-manager-web
cp .env.example ~/.config/skills-manager-web/env
cp docs/systemd-user.service ~/.config/systemd/user/skills-manager-web.service
systemctl --user daemon-reload
systemctl --user enable --now skills-manager-web
```

Edit `WorkingDirectory` in the unit if your checkout is not at `~/src/skills-manager/web`.

## Upstream UI Sync

The copied upstream React/Tailwind/i18n assets are kept in `client/src` and `client/public`. To refresh from the parent upstream checkout:

```bash
scripts/sync-upstream-ui.sh ..
npm run build --workspace client
```

Keep `client/src/lib/tauri.ts`, `client/src/lib/browser-shims.ts`, and `client/src/web/` as Web companion code after syncing.
