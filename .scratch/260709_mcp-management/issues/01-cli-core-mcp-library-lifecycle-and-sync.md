Status: ready-for-agent

## What to build

Add MCP Server Library management to the Skills Manager CLI as a complete vertical slice through the CLI layer. This mirrors the existing skills management lifecycle and ships the full `mcp` subcommand plus preset integration.

Concretely, the CLI gains a new `mcp` subcommand with full lifecycle — `install`, `list`, `show`, `edit`, `remove`, `sync` — backed by two new DB tables (`mcp_servers`, `scenario_mcp_servers`) and a new centralized MCP library directory `~/.skills-manager/mcp/` (one `.toml` file per server, exactly one `[mcp_servers.<name>]` section each, server name as the unique identifier). The existing `presets` subcommand gains `add-mcp` / `remove-mcp` / `list-mcp`, and `presets apply` / `presets deactivate` are extended so activating or deactivating a preset also syncs (or clears) the preset's MCP profile files alongside skills in a single operation. Each tool may optionally support profile-based MCP (`supports_mcp_profile`), declare supported output formats, and have an override MCP output directory; MCP profile files are written as `{preset_name}.config.{ext}` using the exact preset name so `codex --profile "{preset_name}"` maps directly.

Key invariants (from PRD + ADRs 0003–0005):

- Central library always stores TOML, regardless of per-tool output format.
- One file = one server; install rejects zero/multiple servers, invalid server names (`.` `]` space control-chars `/` `\`), extra top-level TOML sections, duplicates, and content over 64KB.
- `mcp sync` merges a preset's MCP servers into one profile file per enabled+capable tool, writes an empty `[mcp_servers]` (TOML) / `{"mcpServers": {}}` (JSON) when the preset has no MCP servers, reports per-tool written/skipped with structured reasons, and always includes `profile_arg` (the exact preset name) in JSON output.
- `mcp edit` and `mcp remove` auto re-sync the currently active preset if the affected server is a member of it, so the live profile file never goes stale. Non-active presets are not auto-synced.
- `mcp edit` is atomic: write temp file in `mcp/`, commit DB `content`, rename over target; DB rollback discards temp, rename failure leaves DB authoritative.
- Preset names are filesystem-validate; `mcp sync` defensively rejects names with `/`, `\`, NUL, or control chars (skip with `invalid_preset_name`, surface top-level `preset_name_error`).
- Security is by-design plaintext this phase (central storage, sync output, `git_backup` now includes `mcp/`). The audit-log schema extension for MCP is deferred to a future migration (known gap).

## Included tracer bullets

- [ ] DB migration v6 → v7: `mcp_servers` and `scenario_mcp_servers` tables (as specified in PRD; `enabled` field intentionally absent; cascade on delete)
- [ ] `central_repo::mcp_dir()` returns `base_dir().join("mcp")`; `git_backup` extended to include the `mcp/` directory (plaintext-secrets risk accepted this phase)
- [ ] `ToolAdapter` / `CustomToolDef` new fields (`supports_mcp_profile`, `supported_mcp_formats`, `relative_mcp_output_dir`, `override_mcp_output_dir`, `mcp_output_format`); `override_mcp_output_dir` lives on `ToolAdapter` symmetric to `override_skills_dir` and persists via a new stored setting mirroring `get_custom_tool_paths`/`set_custom_tool_paths`; all new fields `#[serde(default)]`
- [ ] `cli/src/core/mcp_store.rs` — DB operations for `mcp_servers` and `scenario_mcp_servers`
- [ ] `cli/src/core/mcp_actions.rs` — lifecycle logic (install, edit, remove, sync, list, show)
- [ ] `mcp install` (file `.toml`/`.json` path, or `--content` TOML): parse server name, reject multi/zero server, invalid name, extra top-level TOML sections, 64KB limit, duplicates; JSON only via file path, copy-mode values preserved; write normalized `.toml` to `mcp/`, insert DB row
- [ ] `mcp edit` (`--file` | `--content`, mutually exclusive): in-place content update with atomic temp-write → DB-commit → rename; reject name change; 64KB limit; auto re-sync active preset if server is a member
- [ ] `mcp remove` (`--yes`, `--dry-run`): delete file + DB row (CASCADE drops membership); auto re-sync active preset if the removed server was a member
- [ ] `mcp list` / `mcp show <name>`: list names + preset memberships; show full plaintext TOML
- [ ] `mcp sync [--preset <ref>]`: active preset by default; `no_active_preset` error if none active and no `--preset`; per-tool merge/empty-section/skip-reasons/`profile_arg`; validate preset name (`invalid_preset_name` + `preset_name_error`)
- [ ] `presets add-mcp` / `remove-mcp` / `list-mcp`: mutate `scenario_mcp_servers`; auto re-sync when targeting the currently active preset
- [ ] `presets apply` enhancement: switch A→B syncs skills + MCP for B, and clears A's MCP profile files to empty `[mcp_servers]` if A differs from B
- [ ] `presets deactivate` enhancement: active preset → replacement preset's MCP synced via apply (or, if no replacement, clear active preset's MCP profile files); non-active preset → unsync skills + clear that preset's residual MCP profile files
- [ ] clap wiring + JSON dispatch in `cli/src/bin/skills-manager-cli.rs`

## Acceptance criteria

- [ ] `cargo test -p skills-manager` passes, including new migration tests (v6→v7 upgrade from a v6 fixture + fresh-DB path) and unit tests for `mcp_actions` / `mcp_store`
- [ ] `mcp install` from TOML content: validates server name, rejects duplicates, writes the file; rejects names with `.` `]` space `/` `\` with `invalid_server_name`; rejects extra top-level TOML sections with `extra_top_level_sections`; rejects >64KB; rejects multiple servers with `{"error":"multiple_servers","count":N}`
- [ ] `mcp install` from JSON file: converts to TOML in central library, preserves key case; rejects multiple/zero servers; rejects JSON when given via `--content` (TOML only)
- [ ] `mcp edit`: updates content in-place, rejects name change, rejects missing server; auto re-syncs the active preset when the edited server belongs to it; atomic temp→DB→rename order honored on both success and failure
- [ ] `mcp remove`: deletes file and DB row; auto re-syncs the active preset when the removed server belonged to it; non-active-preset removal leaves residual profile file unchanged
- [ ] `mcp sync` with one tool produces the correct merged TOML at the output path; empty preset produces `[mcp_servers]\n` (TOML) / `{"mcpServers":{}}` (JSON); JSON output includes `profile_arg`
- [ ] `mcp sync` skips tools lacking `supports_mcp_profile` (`tool_does_not_support_profile_mcp`), whose configured format is unsupported by the tool (`tool_does_not_support_mcp_format`), or lacking a resolvable MCP output dir (`no_mcp_output_dir`); all skip reasons reported
- [ ] `mcp sync` without an active preset and no `--preset` returns `no_active_preset` and exits non-zero; a preset name containing `/` skips tools with `invalid_preset_name` and surfaces top-level `preset_name_error`
- [ ] `presets add-mcp` / `remove-mcp` on the active preset auto re-syncs; on a non-active preset they do not
- [ ] `presets apply` A→B: A's MCP profile files cleared (empty section), B's written
- [ ] `presets deactivate`: active preset (no replacement) clears profile files; active preset (replacement exists) syncs replacement and clears old; non-active preset clears that preset's residual profile files
- [ ] `override_mcp_output_dir` on `ToolAdapter` is honored by `mcp sync` for both builtin (codex) and custom tools, overriding the `relative_skills_dir` parent-dir default

## Suggested verification

- [ ] `cargo test -p skills-manager` — migration + `mcp_actions` + `mcp_store` unit tests
- [ ] `scripts/run-rust-cli.mjs mcp install --content '<toml>' --json` and inspect JSON for success / structured errors
- [ ] `scripts/run-rust-cli.mjs mcp sync --json` and confirm `profile_arg` equals the preset name and per-tool statuses are correct
- [ ] Manual: `mcp install` a server, add it to the active preset via `presets add-mcp`, run `mcp edit` / `mcp remove`, and verify the profile file under the tool's MCP output dir updates (active preset) or is untouched (non-active preset)
- [ ] Manual: set a preset name containing `/`, run `mcp sync --preset <that>`, confirm `invalid_preset_name` + `preset_name_error` in JSON and no file written

## Out of scope

- Web server `/api/mcp/*` routes and unified `apply`/`deactivate` HTTP routes — issue 02
- Web client MCP library page, preset tabs, settings UI, PresetBar integration — issue 03
- Audit-log schema extension for MCP operations (deferred future migration; known gap)
- At-rest encryption / masking / git remote-push secret risk — accepted plaintext this phase per PRD Security section
- `mcp update` and `mcp check` commands (no remote source to check against)

## Blocked by

None - can start immediately