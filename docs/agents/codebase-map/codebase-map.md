# Codebase Map

## Orientation

- Skills Manager 维护一个中心 Skill Library，并把选中的 skills 同步到 agent 或 workspace 的技能目录。
- 仓库支持两个产品面：`skills-manager-cli` 是稳定外部契约，`web/` 是本地 Web Companion。
- 项目词汇在 `CONTEXT.md`；CLI + Web Companion 的产品边界在 `docs/adr/0001-focus-on-cli-and-web-companion.md`。
- Web 写入统一走 CLI/Rust workspace 合约的决策在 `docs/adr/0002-route-web-writes-through-cli-workspace-contract.md`。
- 根 `AGENTS.md` 是 agent 工作流入口说明；它要求常见代码工作流先读本 map，并把 `.scratch/` 作为本地 issue/PRD 面。
- 根 `package.json` 只提供 npm 兼容包装；Rust CLI 的实际清单是 `cli/Cargo.toml`。
- Rust crate 名为 `skills-manager`，库入口是 `cli/src/lib.rs`，主二进制是 `cli/src/bin/skills-manager-cli.rs`。
- Web Companion 是 `web/` npm workspace：`web/server` 是 Fastify API，`web/client` 是 React/Vite UI。
- Web server 不直接复用 Rust 库；它执行 `skills-manager-cli --json`，浏览器只调用 HTTP API，workspace 功能依赖 CLI `workspaces` 能力。
- 默认数据目录是 `~/.skills-manager`；中心 skills 位于 `<base>/skills`，SQLite 位于 `<base>/skills-manager.db`。
- 与 skills 目录一起同步的管理元数据位于 `<skills_dir>/.skills-manager`。
- CLI 的 `--skills-root <path>` 把中心 skills root 指向外部目录，同时把 DB/cache/log 状态放到默认 base 的 `external/<name>-<hash>` 下。
- `docs/agents/domain.md`、issue tracker 文档和 ADR 是长期项目文档；本 map 只用于代码导航。

## Entry Points

- `package.json` 暴露 `npm run cli`, `npm run cli:build`, `npm run cli:install`，都交给 `scripts/run-rust-cli.mjs`。
- `scripts/run-rust-cli.mjs` 解析 cargo，按需构建 `cli/target/debug/skills-manager-cli`，再运行或安装 Rust CLI。
- `cli/src/bin/skills-manager-cli.rs` 是 CLI 入口，使用 clap 定义全局 `--json`、`--skills-root` 和命令组。
- CLI 稳定命令组是 `repo`, `tools`, `skills`, `workspaces`, `presets`（兼容 alias `scenarios`）, `git`。
- CLI `main` 负责 JSON 错误包裹；`run` 负责处理 `--skills-root` override、初始化 store、分发命令组。
- CLI `workspaces` 命令组进入 `workspace_service`，覆盖注册 workspace 列表/增删/排序/扫描、workspace skills/document/export/delete，以及 global workspace list/document/sync/unsync/delete。
- `cli/src/core/app_state.rs` 是 CLI/store 初始化入口，按阶段创建中心 repo、打开 DB、迁移工具 key、恢复 metadata、初始化 preset 状态。
- `cli/src/lib.rs` 只导出 `core`，核心模块列表集中在 `cli/src/core/mod.rs`。
- `web/server/src/index.ts` 读取环境配置、创建 Fastify server 并监听。
- `web/server/src/server.ts` 注册 CORS、API routes，并在存在 client dist 时提供静态前端和 SPA fallback。
- `web/server/src/routes.ts` 是 Web API 主路由表，覆盖 repo、tools、skills、presets、workspaces、projects、git 和 operations。
- `web/server/src/cli.ts` 是 Web 调 CLI 的唯一 argv builder 和执行队列入口。
- `web/server/src/config.ts` 是 Web server 环境变量和数据目录入口。
- `web/client/src/main.tsx` 是浏览器入口，注册核心 UI 路由和 `/web/*` 控制台路由。
- `web/client/src/App.tsx` 保留旧核心 UI 的 BrowserRouter 入口；当前 Vite 入口使用 `main.tsx`。
- `web/client/vite.config.ts` 配置 React plugin、Tauri import browser shims、Vite 端口和 `/api` proxy。
- `web/client/eslint.config.js` lint 当前主要覆盖 `/web/*` 控制台与少量共享文件，旧核心 UI 多数目录被排除。
- `web/client/src/lib/tauri.ts` 是浏览器 HTTP adapter，保留旧 Tauri adapter 的公开函数形状。
- `web/client/src/context/AppContext.tsx` 驱动核心 UI 数据加载；`web/client/src/web/WebAppContext.tsx` 驱动 `/web/*` 控制台数据加载。
- Rust 单元测试内联在 `cli/src/core/*`；Web server 测试在 `web/server/test/*`。
- `loop/afk.sh` 是本地 AFK issue loop 入口，要求 clean tree、读取 issue markdown，并用 `codex exec --sandbox danger-full-access -c approval_policy=never` 运行迭代。

## Stable Flows

- CLI 启动流：parse CLI -> apply `--skills-root` runtime overrides -> `app_state::initialize_cli_store` -> command dispatcher。
- CLI store 初始化流：`central_repo::ensure_central_repo` -> `SkillStore::new` -> migrations -> legacy tool key migration -> optional sync metadata reindex -> preset state initialization。
- repo 路径流：`repo set-path/reset-path` 写 `repo-config.json`，下次 `ensure_central_repo` 处理 pending migration。
- repo status 流：CLI 从 `central_repo`, `SkillStore`, `sync_metadata` 读取 base、skills、DB、metadata 和 active preset 信息。
- local install 流：CLI classify ref -> `installer::install_from_local` -> `skill_actions::store_installed_skill_unlocked` -> DB + sync metadata -> optional active preset sync。
- git install 流：CLI validate/parse Git URL -> `git_fetcher` clone/resolve subpath -> `installer` copy to center -> `skill_actions` write source metadata -> optional sync。
- skills.sh install 流：shorthand -> GitHub repo clone -> skill dir resolution -> collision-safe install target -> same store/sync boundary as git install。
- update flow：`skill_actions::update_git_skill_internal` resolves remote revision, stages updated directory, swaps atomically, refreshes source metadata, then resyncs copy-mode targets。
- local reimport flow：`skill_actions::reimport_local_skill_internal` reads original source path, stages reinstall, swaps central directory, updates DB, then resyncs copy targets。
- check flow：git/skills.sh sources compare remote revision; local/import sources compare content hash or mark missing source; TTL is read from settings unless forced。
- remove flow：CLI/Web remove deletes sync targets first, deletes central skill directory, deletes DB row, logs audit, then writes sync metadata.
- preset create flow：CLI writes scenario row through `sync_metadata::write_all_from_db_after`; Web calls `presets create` through CLI and reports CLI errors without DB/metadata fallback.
- preset apply flow：resolve preset -> collect desired targets -> unsync obsolete old active targets -> set active preset -> sync desired targets.
- preset deactivate flow：active presets switch to default/replacement when possible; non-active presets unsync their targets, then active preset can be resynced.
- preset membership flow：`presets add-skill/remove-skill` mutates scenario membership and writes full sync metadata.
- sync flow：`scenario_service::collect_scenario_sync_targets` combines preset skills, enabled installed adapters, target names, configured mode, and source hashes.
- sync execution flow：`scenario_service::sync_desired_targets` removes stale targets, skips current targets by symlink/hash rules, calls `sync_engine::sync_skill`, then records `SkillTargetRecord`.
- `sync_engine` uses symlink by default, falls back to copy where symlink is unavailable, and refuses destinations inside sources.
- sync metadata flow：DB is primary runtime state; `sync_metadata::write_all_from_db_unlocked` writes schema, skills, scenarios, memberships, removes stale files, and stores a snapshot fingerprint.
- metadata reindex flow：startup checks `.skills-manager` fingerprint; changed complete snapshots can repopulate DB while preserving compatible source/update fields.
- registered workspace registry flow：`workspaces add/add-linked/reorder/remove/import-registry` -> `workspace_service` -> `SkillStore` project records; global workspace is not a user-registered workspace.
- registered workspace read flow：`workspaces list/scan/agent-targets/skills/document` -> `workspace_service` -> `project_scanner` + `tool_service`/`tool_adapters` + `SkillStore` enrichment -> JSON.
- registered workspace write flow：`workspaces export/delete-skill` resolves Skill Library records, uses tool project-relative paths or linked roots, copies/removes through `sync_engine`, and does not create `skill_targets` for ordinary project/linked copies.
- global workspace flow：`workspaces global list-skills/document/sync/unsync/delete-skill` reads tool global skill dirs through adapters, writes through `sync_engine`, records only sync-managed global targets in `skill_targets`, and refuses direct delete of managed targets until unsynced.
- Web read API flow：route -> `directCli` -> `runCli` -> command log -> response envelope.
- Web write API flow：route validates body and confirmations -> direct CLI for short synchronous writes or `WriteJobQueue` for queued writes -> command/audit logs -> `/api/operations/jobs` reports queued status.
- Web CLI execution flow：`buildCliCommand` always inserts `--json` before subcommands and optional `--skills-root`; `runCli` serializes processes and retries repo-busy failures.
- Web high-risk flow：routes that mutate repo/git/sync/delete generally require `confirm: true`; skill deletion also requires a prior matching `remove-dry-run`.
- Web workspace capability flow：`/api/health` probes `workspaces list`; missing workspace CLI support is reported as `workspaceCapable: false`, and workspace routes return capability errors without filesystem fallback.
- Web registered workspace flow：`/api/projects*` routes to CLI `workspaces list/scan/agent-targets/skills/document` for reads and queues `workspaces add/add-linked/reorder/remove/export/delete-skill` for writes.
- Web global workspace flow：`/api/workspaces/global*` and `/api/skills/:ref/sync-tool` route through CLI `workspaces global ...`; global sync/unsync/delete writes are queued.
- Web client workspace write flow：`web/client/src/lib/tauri.ts` preserves the old adapter function names but waits on queued Web jobs for workspace sync, registry, export, and delete operations.
- Web leaderboard flow：`/api/skills/leaderboard` fetches skills.sh HTML pages directly and caches parsed skill lists for a short TTL.
- Web settings flow：server config comes from environment variables; many browser UI settings in `web/client/src/lib/tauri.ts` are stored in localStorage.
- Git backup flow：CLI `git` commands operate on `central_repo::skills_dir()` through `git_backup`; commit creates `sm-v-*` snapshot tags.

## Modules And Seams

- `Central repo`: CLI `repo` commands and `app_state` enter through `central_repo`; it owns base-dir selection, external `--skills-root` state namespacing, repo path migration, and canonical data paths.
- `Skill`: CLI `skills` commands and Web skills routes route lifecycle work through `skill_actions`; install staging uses `installer`/`git_fetcher`, records live in `SkillStore`, and metadata projection uses `sync_metadata`.
- `SkillStore` owns SQLite access for skills, sync-managed targets, discovered skills, scenarios, settings, registered workspace project records, audit, and encrypted sensitive settings.
- `migrations` owns DB schema evolution; use it instead of ad hoc schema writes.
- `repo_lock` is the cross-process write lock seam for central repo and sync metadata mutations.
- `app_state` is the initialization seam for code that needs a ready `SkillStore`.
- `skill_metadata` parses `SKILL.md`/`skill.md`, validates skill directories, infers/sanitizes names, and is the canonical metadata parser.
- `scanner` discovers skill directories inside arbitrary roots; `project_scanner` reads project/global workspace skill directories for `workspace_service`.
- `installer` prepares local/archive/git skill sources, safely extracts archives, copies skills into central destinations, skips `.git`/symlinks, and computes content hashes.
- `skill_actions` contains cross-cutting skill operations shared by CLI/Web compatibility paths: DTOs, update/check/reimport/delete/store helpers, git source normalization, and copy-target resync.
- `git_fetcher` owns Git URL parsing, cloning, branch/revision resolution, proxy use, temp cleanup, and skill subpath discovery.
- `skillssh_api` is the skills.sh search/cache boundary used by CLI marketplace search.
- `git_backup` owns Git-backed backup/restore/status logic for the central skills directory.
- `Preset`/`Scenario`: CLI `presets` (`scenarios` alias) and Web preset routes use `SkillStore` for membership state, `scenario_service` for target planning/apply/unsync, and `sync_metadata` for exported snapshot state.
- `Sync target`: preview through `presets preview` or `skills sync --dry-run`; `scenario_service` plans targets, `sync_engine` mutates filesystem targets, and `SkillTargetRecord` stores sync results.
- `sync_engine` owns filesystem sync primitives: symlink/copy modes, current-target detection, target removal, and destination safety checks.
- `sync_metadata` owns JSON snapshot files under `<skills_dir>/.skills-manager`, snapshot fingerprinting, metadata reindex, and atomic writes.
- `Tool adapter`: CLI `tools` and Web workspace/tool routes project through `tool_adapters` for built-in/custom paths and through `tool_service` for enabled state, ordering, and `ToolInfo`.
- `tool_adapters` owns built-in/custom tool definitions, skills directories, detection paths, project-relative paths, recursive scan flags, and UI category.
- Built-in adapter additions or path changes should start in `tool_adapters`; UI ordering and disabled state belong in `tool_service`.
- `tool_service` owns disabled tools, tool order, custom path settings, and `ToolInfo` projection.
- `content_hash` is the stable directory hash seam; update/check/sync skip behavior depends on it.
- `crypto` encrypts sensitive setting values such as proxy URL and git backup remote URL.
- `path_guard`, `validation.ts`, and archive extraction guard filesystem/path inputs at different layers; prefer them over local string checks.
- `audit_log` and `SkillStore::log_audit` are the Rust audit seam for core skill actions.
- `Workspace`: CLI `workspaces` and Web workspace/project routes enter through `workspace_service`; it owns registered workspace DTOs, legacy registry import, sync health enrichment, global workspace sync/unsync/delete, and project/linked export/delete semantics.
- `workspace_service` delegates workspace directory discovery to `project_scanner`, tool/global/project paths to `tool_adapters` and `tool_service`, central skill resolution to `SkillStore`, and filesystem copy/remove to `sync_engine`.
- `workspace_service` is the boundary to use for workspace behavior; avoid adding Web-only DB/filesystem fallback paths for workspace registry, skill listing, export, sync, or delete.
- `Web Companion`: API routes enter at `web/server/src/routes.ts`, CLI handoff is `web/server/src/cli.ts`, write jobs/logs are `operations.ts`, browser calls use `web/client/src/lib/tauri.ts`, and route contract tests start in `web/server/test/routes.test.ts`.
- `web/server/src/config.ts` owns env var interpretation and Linux-only Web Companion constraints.
- `web/server/src/validation.ts` owns request validation for absolute Linux paths, Git URLs, arrays, booleans, and confirmation checks.
- `web/server/src/operations.ts` owns in-memory jobs plus JSONL command/audit logging.
- `web/server/src/routes.ts` is intentionally broad; use route helpers there for HTTP validation, capability checks, queueing, and CLI mapping, while workspace persistence/filesystem semantics stay behind CLI `workspaces`.
- `web/server/src/cli.ts` owns CLI stdout/stderr JSON extraction, truncation, timeout, serialization, and busy-retry policy.
- `web/server/src/types.ts` owns server-side JSON envelope and operation/job record types.
- `web/client/src/lib/tauri.ts` is the main client API seam; old views should call it instead of `fetch` directly, and workspace write functions wait for queued Web jobs before resolving.
- `web/client/src/lib/browser-shims.ts` satisfies retained Tauri imports in browser builds.
- `web/client/src/i18n/index.ts` initializes i18next and reads language preference through the client adapter.
- `web/client/src/views/workspaceConfigs.ts` selects coding vs lobster workspace groups for core UI.
- `web/client/src/web/*Page.tsx` are the `/web/*` console pages; `WebShell` supplies their layout and polling context.
- `web/client/src/components/SkillMarkdown.tsx` is the markdown rendering seam for skill documents.

## Commands

- Install root npm dependencies when needed: `npm install`.
- Run CLI through npm wrapper: `npm run cli -- --help`.
- Run machine-readable CLI: `npm run -s cli -- --json repo status`.
- Build CLI through wrapper: `npm run cli:build`.
- Install CLI binary through wrapper: `npm run cli:install`.
- Build Rust CLI directly: `cargo build --manifest-path cli/Cargo.toml --bin skills-manager-cli`.
- Install Rust CLI directly: `cargo install --path cli --bin skills-manager-cli --locked --force`.
- Run all Rust tests: `cargo test --manifest-path cli/Cargo.toml`.
- Run focused Rust tests: `cargo test --manifest-path cli/Cargo.toml <test-name-or-module>`.
- Run Web API server in development: `cd web && npm run dev`.
- Run Vite client in development: `cd web && npm run dev:client`.
- Build both Web workspaces: `cd web && npm run build`.
- Run Web test aggregate: `cd web && npm run test`.
- Run Web lint: `cd web && npm run lint`.
- Run Web server dev directly: `cd web && npm run dev --workspace server`.
- Run Web client dev directly: `cd web && npm run dev --workspace client`.
- Build server only: `cd web && npm run build --workspace server`.
- Build client only: `cd web && npm run build --workspace client`.
- Run server tests only: `cd web && npm run test --workspace server`.
- Run focused server test file: `cd web && npm run test --workspace server -- routes.test.ts`.
- Preview built client: `cd web && npm run preview --workspace client`.
- Run AFK issue loop: `loop/afk.sh <iterations> <issues_path> [prompt_path]`.
- No dedicated e2e command is known.

## Debugging Entry Points

- Start CLI debugging with `npm run -s cli -- --json repo status`; it prints base dir, skills dir, DB path, metadata dir, counts, and active preset id.
- Use `npm run -s cli -- --skills-root /path/to/skills --json repo status` to reproduce external-root behavior without writing state into that checkout.
- Use `npm run -s cli -- --json tools list` to inspect adapter keys, installed state, skills dirs, enabled flags, custom status, and project-relative paths.
- Use `npm run -s cli -- --json skills list` and `skills show <ref>` to inspect managed skill summaries and full `SKILL.md` content.
- Use `npm run -s cli -- --json workspaces list` to inspect registered project/linked workspaces, skill counts, and sync health.
- Use `npm run -s cli -- --json workspaces skills <workspace-id>` and `workspaces document <workspace-id> <tool> <relative-path>` to debug registered workspace reads.
- Use `npm run -s cli -- --json workspaces global list-skills <tool>` and `workspaces global document <tool> <relative-path>` to debug global workspace reads.
- Use `npm run -s cli -- --json presets preview <ref>` before changing active sync targets.
- Use `npm run -s cli -- --json skills sync --dry-run` to inspect desired preset sync targets without mutating tool directories.
- Use `npm run -s cli -- --json git status` for central skills repo backup state and upstream health.
- Use Web `/api/health` and `/api/config` to verify server platform, token requirement, CLI path, data dir, configured skills root, and workspace CLI capability.
- Use Web `/api/operations/jobs` for write-job status and `/api/operations/commands` for recent CLI argv/stdout/stderr/duration.
- Server command/audit JSONL paths come from config as `commands.jsonl` and `audit.jsonl` under `SKILLS_MANAGER_WEB_DATA_DIR` or `~/.local/share/skills-manager-web`.
- Web server env vars: `SKILLS_MANAGER_CLI`, `SKILLS_MANAGER_WEB_HOST`, `SKILLS_MANAGER_WEB_PORT`, `SKILLS_MANAGER_WEB_TOKEN`, `SKILLS_MANAGER_SKILLS_ROOT`, `SKILLS_MANAGER_WEB_DATA_DIR`.
- Vite client dev runs on `127.0.0.1:1420` and proxies `/api` to `127.0.0.1:17321`.
- Production Web server serves built client from `web/client/dist` when that directory exists.
- Binding Web server to `0.0.0.0` requires `SKILLS_MANAGER_WEB_TOKEN` and API calls must send `Authorization: Bearer <token>`.
- For repo-busy symptoms, inspect `repo_lock`, `sync_metadata`, and `web/server/src/cli.ts`; Web serializes CLI runs and retries known busy errors.
- For metadata drift, inspect `<skills_dir>/.skills-manager/schema.json`, `skills/`, `scenarios/`, `scenario-skills/`, and `sync_metadata::reindex_from_metadata_if_changed`.
- For Web workspace regressions, start with `web/server/test/routes.test.ts`; it covers CLI argv construction, auth, delete dry-run, workspace capability errors, registered workspace reads/writes, global sync/export/delete, leaderboard, and no-fallback behavior.
- For Web config validation, start with `web/server/test/config.test.ts` and `web/server/test/validation.test.ts`.
