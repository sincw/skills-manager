# Skills Manager Web Companion

Linux-only Web console for `xingkongliang/skills-manager`. The service keeps the upstream desktop app untouched and talks to `skills-manager-cli --json` through a whitelist API.

## Requirements

- Linux
- Node.js 20+
- A built or installed `skills-manager-cli`

Install the upstream CLI first:

```bash
cd ../skills-manager
npm install
npm run cli:install
```

## Development

```bash
cd skills-manager-web
npm install
SKILLS_MANAGER_CLI="$HOME/.cargo/bin/skills-manager-cli" npm run dev
```

Open:

```text
http://127.0.0.1:17321
```

The server defaults to `127.0.0.1:17321`. In development it serves API routes and the built client when `client/dist` exists. To run a separate Vite client while editing:

```bash
npm run dev:client
```

Then open `http://127.0.0.1:1420`; Vite proxies `/api` to `http://127.0.0.1:17321`.

## Environment

Copy `.env.example` or export variables:

```bash
export SKILLS_MANAGER_CLI="$HOME/.cargo/bin/skills-manager-cli"
export SKILLS_MANAGER_WEB_HOST=127.0.0.1
export SKILLS_MANAGER_WEB_PORT=17321
```

Important variables:

- `SKILLS_MANAGER_CLI`: CLI executable path. Defaults to `skills-manager-cli` in `PATH`.
- `SKILLS_MANAGER_WEB_HOST`: defaults to `127.0.0.1`.
- `SKILLS_MANAGER_WEB_PORT`: defaults to `17321`.
- `SKILLS_MANAGER_WEB_TOKEN`: required if binding to `0.0.0.0`.
- `SKILLS_MANAGER_SKILLS_ROOT`: optional path passed to CLI as `--skills-root <path>`.
- `SKILLS_MANAGER_WEB_DATA_DIR`: stores `audit.jsonl` and `commands.jsonl`.

## Build and Run

```bash
npm run build
SKILLS_MANAGER_CLI="$HOME/.cargo/bin/skills-manager-cli" npm run start --workspace server
```

## Web Usage

- Dashboard: repository paths, counts, active preset, recent jobs.
- Skills: list/search, Markdown details, install local/Git/skills.sh, skills.sh search, check/update single and all, export, tags, adopt dry-run/execute, adopt-git, legacy enable/disable, dry-run guarded delete.
- Presets: list/current, preview, apply, deactivate, add/remove skills, sync dry-run/execute with optional tool filter.
- Tools: read-only CLI tool state.
- Git Backup: status, init, clone, set remote, pull, push, commit, versions, restore.
- Operations: job queue, command argv, stdout/stderr, errors, durations.
- Settings: theme and central repository path controls.

High-risk writes require frontend confirmation and backend `confirm: true`. Skill deletion must run `remove-dry-run` before the delete endpoint accepts it.

## Tests

```bash
npm run test
```

This runs server unit/API tests and the client production build.

## systemd User Service

Example unit: `docs/systemd-user.service`.

```bash
mkdir -p ~/.config/skills-manager-web
cp .env.example ~/.config/skills-manager-web/env
cp docs/systemd-user.service ~/.config/systemd/user/skills-manager-web.service
systemctl --user daemon-reload
systemctl --user enable --now skills-manager-web
```

Edit `WorkingDirectory` in the unit if your checkout is not at `~/src/skills-manager-web`.

## Upstream UI Sync

The copied upstream React/Tailwind/i18n assets are kept in `client/src` and `client/public`. To refresh from a sibling upstream checkout:

```bash
scripts/sync-upstream-ui.sh ../skills-manager
npm run build --workspace client
```

Keep `client/src/lib/tauri.ts`, `client/src/lib/browser-shims.ts`, and `client/src/web/` as Web companion code after syncing.
