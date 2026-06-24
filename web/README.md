# Skills Manager Web Companion

[中文说明](./README.zh-CN.md)

The Web Companion is a local browser UI for Skills Manager. It runs a Fastify API server plus a React client. The server talks to `skills-manager-cli --json`; the browser never runs the CLI directly.

`web/client` is the retained React UI source of truth. It is not synchronized from a root desktop UI. Some files keep compatibility-oriented names such as `lib/tauri.ts` because shared views import that module shape, but the implementation is a Web HTTP adapter with browser shims.

## Requirements

- Linux.
- Node.js 20+.
- Rust toolchain with `cargo` when building or installing `skills-manager-cli` from source.
- A working `skills-manager-cli` binary.
- Git, optional but needed for Git-backed skills, Git Backup, pull, push, and Git URL installs.

## Install Order

Install the CLI from the repository root:

```bash
cd /path/to/skills-manager
npm run cli:install
```

Check it:

```bash
~/.cargo/bin/skills-manager-cli --help
```

Install Web dependencies:

```bash
cd /path/to/skills-manager/web
npm install
```

Set the CLI path when it is not already on `PATH`:

```bash
export SKILLS_MANAGER_CLI="$HOME/.cargo/bin/skills-manager-cli"
```

You can also copy `.env.example` and load it from your shell or service manager.

## Development

Run the API server:

```bash
cd /path/to/skills-manager/web
SKILLS_MANAGER_CLI="$HOME/.cargo/bin/skills-manager-cli" npm run dev
```

Run the Vite client in another terminal:

```bash
cd /path/to/skills-manager/web
npm run dev:client
```

Open `http://127.0.0.1:1420`.

The Vite client proxies `/api` to `http://127.0.0.1:17321`.

## Production Build

Build both workspaces:

```bash
cd /path/to/skills-manager/web
npm run build
```

Start the built server:

```bash
SKILLS_MANAGER_CLI="$HOME/.cargo/bin/skills-manager-cli" npm run start --workspace server
```

Open `http://127.0.0.1:17321`.

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `SKILLS_MANAGER_CLI` | Recommended | CLI executable path. Defaults to `skills-manager-cli` in `PATH`. |
| `SKILLS_MANAGER_WEB_HOST` | No | Server host. Defaults to `127.0.0.1`. |
| `SKILLS_MANAGER_WEB_PORT` | No | Server port. Defaults to `17321`. |
| `SKILLS_MANAGER_WEB_TOKEN` | Conditional | Required when `SKILLS_MANAGER_WEB_HOST=0.0.0.0`. |
| `SKILLS_MANAGER_SKILLS_ROOT` | No | Optional path passed to the CLI as `--skills-root <path>`. |
| `SKILLS_MANAGER_WEB_DATA_DIR` | No | Stores `audit.jsonl` and `commands.jsonl`. Defaults to `~/.local/share/skills-manager-web`. |

For normal browser use, keep the server on `127.0.0.1`. If you bind to `0.0.0.0`, the backend requires `SKILLS_MANAGER_WEB_TOKEN`; expose it through an authenticated reverse proxy or another layer that sends `Authorization: Bearer <token>` to `/api`.

## Routes

Core Skills Manager routes:

- `/` - dashboard.
- `/install` - marketplace and skill installation.
- `/my-skills` - installed skills.
- `/global-workspace` - global workspace overview.
- `/global-workspace/:agentKey` - one tool workspace.
- `/project/:id` - project workspace detail.
- `/settings` - settings.

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

`npm run test` runs server tests and the client production build.

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
