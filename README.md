# Skills Manager

[中文说明](./README.zh-CN.md)

Skills Manager maintains a central skill library for AI coding agents and syncs selected skills into agent/workspace skill folders. The supported product surfaces in this repository are:

- `skills-manager-cli` - the stable CLI contract for users, scripts, and agents.
- `web/` - the Web Companion, a local browser UI backed by the CLI JSON interface.

For project vocabulary, see [CONTEXT.md](./CONTEXT.md). For the decision to focus this repository on CLI + Web Companion, see [docs/adr/0001-focus-on-cli-and-web-companion.md](./docs/adr/0001-focus-on-cli-and-web-companion.md).

## CLI Contract

The CLI binary name is `skills-manager-cli`.

Stable command groups:

- `repo`
- `tools`
- `skills`
- `presets`
- `git`

Stable global flags:

- `--json`
- `--skills-root <path>`

Default data location:

- `~/.skills-manager`

Root npm scripts remain as compatibility wrappers:

```bash
npm run cli -- --help
npm run cli -- --json repo status
npm run cli:build
npm run cli:install
```

Equivalent Cargo commands:

```bash
cargo build --manifest-path cli/Cargo.toml --bin skills-manager-cli
cargo install --path cli --bin skills-manager-cli --locked --force
```

## Quick Start

Prerequisites:

- Rust toolchain with `cargo`.
- Node.js if you want to use the npm compatibility wrappers.
- Git for Git-backed skills, backup, pull, push, and Git URL installs.

Common commands:

```bash
# Repository / library overview
npm run cli -- repo status
npm run cli -- skills list
npm run cli -- skills show <ref>

# Install skills
npm run cli -- skills install ./my-skill --local
npm run cli -- skills install https://github.com/owner/repo.git --git
npm run cli -- skills install owner/repo@skill --skillssh
npm run cli -- skills install owner/repo@skill --sync

# Update and check
npm run cli -- skills check --all
npm run cli -- skills update --all

# Presets
npm run cli -- presets list
npm run cli -- presets create Default
npm run cli -- presets add-skill Default <skill-ref>
npm run cli -- presets apply Default
npm run cli -- skills sync --dry-run

# Git-backed skills repo
npm run cli -- git status
npm run cli -- git pull
npm run cli -- git commit -m "chore: update skills"
```

Machine-readable output:

```bash
npm run -s cli -- --json skills list
```

Operate on an external skills checkout without writing manager state into that checkout:

```bash
npm run -s cli -- --skills-root /path/to/skills --json repo status
```

The manager stores external-root state under `~/.skills-manager/external/<name>-<hash>/`.

## Web Companion

The Web Companion lives in [web/](./web/README.md). It runs a local Fastify server and React client. The server executes `skills-manager-cli --json`; the browser never executes the CLI directly.

Install and run:

```bash
npm run cli:install
cd web
npm install
npm run dev
```

In another terminal:

```bash
cd web
npm run dev:client
```

Open `http://127.0.0.1:1420`.

## Development

Rust checks:

```bash
cargo build --manifest-path cli/Cargo.toml --bin skills-manager-cli
cargo test --manifest-path cli/Cargo.toml
```

Web checks:

```bash
cd web
npm run build --workspace client
npm run build --workspace server
npm run test --workspace server
```

## Repository Layout

```text
cli/          Rust core library and skills-manager-cli binary
web/          Web Companion server and client
CONTEXT.md    Project glossary
docs/adr/     Architecture decisions
scripts/      Compatibility wrapper scripts
```

## License

MIT
