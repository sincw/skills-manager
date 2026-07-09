# PRD: MCP Server Library Management

Status: ready-for-agent

## Problem Statement

Skills Manager currently manages AI agent skills through a central library, presets, and sync mechanism—but MCP (Model Context Protocol) server configurations live outside this system. Users must manually write MCP config files into each tool's config directory, manage different formats (TOML vs JSON) per tool, and handle preset-specific server groupings by hand.

Codex CLI already supports `--profile <name>` to layer a `$CODEX_HOME/<name>.config.toml` profile on top of the base config. The `[mcp_servers]` section in that profile is the standard MCP configuration format. This means there is a natural integration point: the Skills Manager central library and preset system can generate these profile files automatically, giving MCP servers the same lifecycle as skills.

## Solution

Add MCP server library management to Skills Manager, following the exact same patterns as skills management. A new `mcp` CLI subcommand mirrors the existing `skills` subcommand structure. The web companion gets a new MCP library page alongside existing pages. Presets are extended to hold both skills and MCP servers; activating a preset syncs both together.

Key design decisions (see ADRs 0003–0005 and `CONTEXT.md` for full detail):

- MCP servers are stored as individual `.toml` files in `~/.skills-manager/mcp/`, parallel to `~/.skills-manager/skills/`
- Each file contains exactly one `[mcp_servers.<name>]` section; the server name (`<name>`) is the unique identifier across the library
- The central library always stores in TOML format regardless of the output format per tool
- On sync, MCP servers in a preset are merged into a single `{preset_name}.config.toml` file per tool — the output filename is the **exact preset name**, matching the argument the user passes to `codex --profile {preset_name}`. There is no sanitization; preset names must be valid filenames for the target tool.
- Each tool has a configurable MCP output directory (defaulting to the parent of the tool's `relative_skills_dir`) and a configurable output format (default `toml`). Codex only supports TOML profiles; the JSON format option is reserved for future tool integrations and is not exposed for codex in the settings UI.
- The output file is placed there for codex to load via `codex --profile {preset_name}`
- `mcp edit` (CLI + Web) supports in-place content update without changing the server name, superseding ADR-0003's original "no in-place update" conclusion

The plan is split into three vertical slices:

1. **CLI core**: new `mcp_servers` and `scenario_mcp_servers` DB tables, new `mcp` CLI subcommand with full lifecycle (install/list/show/edit/remove/sync), preset extensions (`add-mcp`/`remove-mcp`/`list-mcp`)
2. **Web server**: new `/api/mcp/*` REST routes, unified preset apply/deactivate routes, tool config extension (mcp output dir + format in settings)
3. **Web client**: new MCP library page, preset detail tab switch (skills / MCP), tool setting UI for MCP config, sidebar MCP entry

## User Stories

1. As a CLI user, I want to install an MCP server from a `.toml` file into the central library, so that it becomes available for preset membership.
2. As a CLI user, I want to install an MCP server from a `.json` file into the central library, so that I can reuse existing MCP configs.
3. As a CLI user, I want the install command to parse the server name from the file content and reject files without exactly one `[mcp_servers.<name>]` or `"mcpServers"` section, so that the library stays consistent.
4. As a CLI user, I want the install command to reject a server whose name already exists in the library, so that server names remain unique.
5. As a CLI user, I want to list all MCP servers in the library with their names and preset memberships, so that I can inspect my MCP library.
6. As a CLI user, I want to show the full TOML content of a single MCP server, so that I can inspect or copy a config.
7. As a CLI user, I want to remove an MCP server from the library with a `--yes` flag and `--dry-run` preview, so that I can clean up unused servers.
8. As a CLI user, I want to sync the current active preset's MCP servers into merged profile files named `{preset_name}.config.toml`, so that codex can load them via `codex --profile {preset_name}` (the preset name is used as-is). If no preset is active, sync returns an error.
9. As a CLI user, I want to sync a specific preset's MCP servers instead of the active one, so that I can generate profiles for non-active presets.
10. As a CLI user, I want sync to produce an empty `[mcp_servers]` section when the preset has no MCP servers, so that codex sees a clean but valid overlay layer.
11. As a CLI user, I want to add an MCP server to a preset; if the preset is currently active, its MCP profile files should be automatically re-synced, so that the change takes effect immediately.
12. As a CLI user, I want to remove an MCP server from a preset; if the preset is currently active, its MCP profile files should be automatically re-synced, so that the change takes effect immediately.
13. As a CLI user, I want to list all MCP servers in a preset, so that I can see what a preset will sync.
14. As a CLI user, I want the `presets apply` command to sync both skills and MCP servers together, so that applying a preset is a single operation.
15. As a CLI user, I want the `presets deactivate` command to unlink skills and clear MCP profile files to empty `[mcp_servers]` sections (whether the preset is currently active or inactive but has residual profile files), so that deactivating is a clean operation.
16. As a CLI user, I want sync to skip tools without an MCP output directory or tools that do not support profile-based MCP (or whose output format is unsupported by the tool), reporting all skip reasons in the JSON result, so that partial configurations do not block the workflow.
17. As a CLI user, I want `mcp sync` output to include the exact `--profile` argument the user should pass to codex (i.e. the preset name), so that the mapping from preset to codex invocation is explicit.
18. As a CLI user, I want to edit an existing MCP server's content by providing new TOML (via `--file` or `--content`), which updates the server in-place without changing the server name, so that I can adjust command, args, or env.
19. As a web companion user, I want to see a dedicated MCP library page in the sidebar, so that I can manage MCP servers in the same way as skills.
20. As a web companion user, I want to install an MCP server by entering the raw TOML content in a text editor (the server name is parsed from `[mcp_servers.<name>]`), so that I do not need to create a file first.
21. As a web companion user, I want to view the full TOML content of an installed MCP server (including env values, shown as plaintext), so that I can inspect or copy the configuration.
22. As a web companion user, I want to edit the TOML content of an installed MCP server in-place via `mcp edit`, updating command, args, or env without changing the server name, so that I can adjust server configuration.
23. As a web companion user, I want to delete an MCP server from the library, so that I can clean up servers I no longer need.
24. As a web companion user, I want to see a preset detail page with two tabs—"技能库" and "MCP库"—so that I can switch between skill and MCP membership views.
25. As a web companion user, I want the MCP tab of a preset detail page to show each server's name and a content excerpt (server name + command only, omitting env vars), so that I can quickly identify servers without exposing secrets.
26. As a web companion user, I want to add or remove MCP servers from a preset in the web UI, so that I can configure preset composition visually.
27. As a web companion user, I want the PresetBar activation to sync both skills and MCP servers together via a single unified API call (`POST /api/presets/:ref/apply`), so that I do not have to perform two operations.
28. As a web companion user, I want the PresetBar deactivation to unlink skills and clear MCP profile files together via a single unified API call (`POST /api/presets/deactivate`), so that cleanup is complete.
29. As a web companion user, I want to configure each tool's MCP output directory and format in the settings page, so that I can control where and how profile files are generated.
30. As a web companion user, I want the global workspace page to sync MCP servers alongside skills when activating a preset; the project workspace page triggers the same global MCP sync (MCP profile files are always written to the tool's global config directory, not scoped per project), so that both workspace contexts produce consistent outputs. Because a project workspace action changes MCP config globally, the project workspace activation UI surfaces a non-blocking notice that "MCP 配置全局生效，不限于当前项目”.
31. As a web companion user, I want the sidebar to show only skill counts in preset labels (MCP counts belong in the page tabs), so that the sidebar stays uncluttered.

## Implementation Decisions

### CLI layer

**DB schema extension** (migration v6 → v7):

```sql
CREATE TABLE mcp_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    content TEXT NOT NULL,
    central_path TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE scenario_mcp_servers (
    scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
    mcp_id TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
    added_at INTEGER,
    PRIMARY KEY(scenario_id, mcp_id)
);
```

Note: the `enabled` field is intentionally absent. Disabling a server is expressed by removing it from the preset; there is no separate enable/disable toggle.

The audit log schema extension for MCP operations is tracked separately and deferred to a future migration. The Security section records MCP operations as a requirement; until the schema migration lands, MCP audit is a known gap.

**Central repo**: New `mcp_dir()` function returns `base_dir().join("mcp")`. The `git_backup` mechanism is extended to include the `mcp/` directory. Note: MCP server files may contain plaintext secrets (API keys, tokens); git_backup should be evaluated for remote push risk — see Security section.

**CLI subcommand structure** (in `cli/src/bin/skills-manager-cli.rs`):

```
mcp
  install <path>
  install --content <toml>
  list
  show <name>
  edit <name> [--file <path> | --content <toml>]
  remove <name> [--yes] [--dry-run]
  sync [--preset <ref>]
```

`mcp install` accepts either a file path or inline TOML via `--content` (mutually exclusive; `--content` is used by the web server). There is no `--name` flag; the server name is always parsed from the file/content.

`mcp edit` updates an existing server's content in-place: rewrites the central `.toml` file and updates the DB `content` column atomically. Atomicity order: write to a temporary file in `~/.skills-manager/mcp/`, commit the DB `content` update, then rename the temp file over the target `.toml` (DB commit fails → discard temp file; rename fails → DB row still authoritative and the file is rebuilt on next sync). The server name cannot be changed via edit (to change the name, remove and re-install). Edit accepts `--file` or `--content` (mutually exclusive). Content size is limited to 64KB (same as install).

`mcp sync` requires an active preset when called without `--preset`; if no preset is active, it returns error `"no_active_preset"` and exits non-zero.

`mcp edit` and `mcp remove` keep the active preset's profile file consistent: both check whether the affected server is a member of the currently active preset, and if so automatically re-run MCP sync for that preset so the merged profile file reflects the change immediately. For `mcp remove`, preset membership rows are dropped from the database via `ON DELETE CASCADE`, but that only updates the DB — the merged profile file still has to be regenerated, hence the auto re-sync. Non-active presets are not auto-synced; their residual profile files persist until the next explicit `mcp sync --preset <X>`.

**New Rust modules**:
- `cli/src/core/mcp_actions.rs` — MCP lifecycle logic (install, edit, remove, sync, list, show)
- `cli/src/core/mcp_store.rs` — DB operations for `mcp_servers` and `scenario_mcp_servers`

**Installer logic** for `mcp install`:
- Accept `.toml` and `.json` files (path), or raw TOML content via `--content`
- Parse TOML: look for `[mcp_servers.<name>]` section → extract server name and serialize back to TOML for storage. If the input contains any other top-level section besides `[mcp_servers.<name>]`, reject with error `"extra_top_level_sections"`.
- Parse JSON: look for `"mcpServers"` top-level key → its value is a map `{serverName: config}`; accept exactly one entry; the map key becomes the server name; args/env/command keys are preserved as-is (no case conversion). JSON input is only accepted via file path (`mcp install <path.json>`); `--content` and the web install form accept TOML only, since the central library always stores TOML.
- Validate exactly one server in the input; reject if zero or more than one. Multi-server rejection includes a structured error (`{"error": "multiple_servers", "count": N}`).
- Validate the server name contains only filesystem-safe and TOML-safe characters: reject names containing `.` (creates nested TOML table), `]`, spaces, control characters, or path separators (`/`, `\`). Error: `"invalid_server_name"`.
- Check no existing server with the same name in DB; reject if duplicate
- Content size must not exceed 64KB (same limit as edit)
- Copy the normalized `.toml` file to `~/.skills-manager/mcp/<name>.toml`
- Insert a record into `mcp_servers` table

**Sync logic** for `mcp sync`:
- Read preset's MCP servers from `scenario_mcp_servers` joined with `mcp_servers`
- Resolve the target preset (active preset by default, or `--preset <ref>`)
- For each enabled tool:
  - Check if the tool supports profile-based MCP via `ToolAdapter.supports_mcp_profile`; if false, skip and record reason `"tool_does_not_support_profile_mcp"`
  - Check if the tool's configured `mcp_output_format` is supported (via `ToolAdapter.supported_mcp_formats`); if not, skip and record reason `"tool_does_not_support_mcp_format"`
  - Compute MCP output directory: `override_mcp_output_dir ?? relative_mcp_output_dir ?? parent_of(relative_skills_dir)`
  - If no MCP output dir can be resolved, skip the tool and record reason `"no_mcp_output_dir"`
  - Merge all server TOML sections into one file
  - Write to `{mcp_output_dir}/{preset_name}.config.{format_extension}` — using the **exact preset name** (no sanitization at write time)
  - Before any write, validate the preset name is filesystem-safe (reject names containing path separators `/` or `\`, NUL, or other control characters). If invalid, skip the tool and record reason `"invalid_preset_name"`, and surface a top-level `"preset_name_error"` in the JSON result. Preset names are also validated the same way at preset creation time (`presets create` / web `POST /api/presets`), so a valid preset normally passes sync-time validation; the sync-time check is a defensive guard for presets created before this validation existed.
  - If the preset has no MCP servers, write a valid empty config: `[mcp_servers]\n` for TOML, `{"mcpServers": {}}` for JSON
  - Report written/skipped per tool in JSON output, including the `--profile` argument:
    ```json
    {
      "preset": "My Preset",
      "profile_arg": "My Preset",
      "tools": {
        "codex": {"status": "written", "path": "/home/user/.codex/My Preset.config.toml"},
        "cursor": {"status": "skipped", "reason": "tool_does_not_support_profile_mcp"}
      }
    }
    ```

**Preset extensions** in existing `presets` subcommand:
```
presets add-mcp <preset> <mcp-name>...
presets remove-mcp <preset> <mcp-name>...
presets list-mcp <preset>
```

When `add-mcp` or `remove-mcp` targets the **currently active preset**, the command automatically re-runs MCP sync for that preset so the profile files reflect the change immediately. Non-active presets are not auto-synced (use `mcp sync --preset <X>` explicitly).

**Preset apply enhancement**: The existing `presets apply` command now also calls the MCP sync logic. When switching from preset A to preset B:
1. Capture the current active preset id (if any) as `old_active`
2. Sync skills for preset B (existing behavior)
3. Sync MCP for preset B (new)
4. If `old_active` exists and differs from B, clean up old preset A's MCP profile files — set them to empty `[mcp_servers]` sections across all enabled tools that support MCP profiles

**Preset deactivate enhancement**: When deactivating a preset:
- **Active preset**: If a replacement preset exists (fallback chain: next in priority → default), call `apply` on the replacement (which syncs both skills and MCP). Only if no replacement exists (truly no active preset after), clear MCP profile files for the previously-active preset to empty `[mcp_servers]` sections.
- **Non-active preset**: Unsync the preset's skills (existing behavior). Additionally, clear the preset's MCP profile files to empty `[mcp_servers]` sections across all enabled tools that support MCP profiles. This handles residual profile files from prior explicit `mcp sync --preset <X>` calls.

**Tool adapter extension**: `ToolAdapter` gains new fields:
- `supports_mcp_profile: bool` — only tools that support loading a `--profile`-style config file (currently only codex). Sync skips tools where this is false.
- `supported_mcp_formats: Vec<String>` — formats this tool can consume (codex: `["toml"]`). Sync skips tools where the configured format is not in this list.
- `relative_mcp_output_dir: Option<String>` — default derivation from `relative_skills_dir`
- `override_mcp_output_dir: Option<String>` — overrides the MCP output directory (settings-page override)
- `mcp_output_format: Option<String>` — default `"toml"`

The `override_mcp_output_dir` field lives on `ToolAdapter` itself, symmetric to the existing `override_skills_dir`, so that both builtin and custom tools (including codex) can override their MCP output directory from the settings page. The override is persisted via a new stored setting, mirroring the existing `get_custom_tool_paths` / `set_custom_tool_paths` seam used for `override_skills_dir`. `ToolAdapter` exposes a single resolved `mcp_output_dir` computed at runtime: `override → relative_mcp_output_dir → parent_of(relative_skills_dir)`. All new fields (on both `ToolAdapter` and `CustomToolDef`) carry `#[serde(default)]` for backward compatibility.

### Web server layer

New and extended routes in `web/server/src/routes.ts`:

```
GET    /api/mcp                       → mcp list
GET    /api/mcp/:name                 → mcp show (full plaintext TOML, including env values)
POST   /api/mcp/install               → mcp install (from content, via --content flag)
PUT    /api/mcp/:name                 → mcp edit (update content in-place; 64KB limit)
DELETE /api/mcp/:name                 → mcp remove
POST   /api/mcp/sync                  → mcp sync

POST   /api/presets/:ref/mcp          → presets add-mcp
DELETE /api/presets/:ref/mcp          → presets remove-mcp
GET    /api/presets/:ref/mcp          → presets list-mcp
POST   /api/presets/:ref/apply        → unified apply: skills sync + MCP sync (serial)
POST   /api/presets/deactivate        → unified deactivate: skills unlink + MCP clear. Body: `{ "preset": "<ref>" }` where `preset` is a preset reference (id or name); when omitted the active preset is used.

GET    /api/tools                     → existing, extended with MCP settings
PUT    /api/tools/:key/mcp            → update tool MCP output dir/format
```

All MCP write operations are queued through `WriteJobQueue` like existing skill writes. The unified `POST /api/presets/:ref/apply` and `POST /api/presets/deactivate` go through `WriteJobQueue` to serialize preset state transitions and prevent races.

`PUT /api/tools/:key/mcp` validates `mcp_output_format` against allowed values (`"toml"` | `"json"`); invalid values return 400. It additionally checks the value against the target tool's `supported_mcp_formats`: if the tool does not support the requested format (e.g. setting codex to `"json"`), return 400 with `"unsupported_mcp_format"`. This makes the server-side guard match the settings-UI behavior (which hides the JSON option for codex) and prevents a misconfiguration that would otherwise let every sync silently skip codex. `:key` is the tool adapter key (builtin or custom).

### Web client layer

**New page**: `web/client/src/web/McpPage.tsx` — the MCP library page.
- Lists all installed MCP servers
- Install form: single raw TOML content text editor (server name is parsed from `[mcp_servers.<name>]` — no separate name field)
- View: raw TOML display, env values shown as plaintext
- Edit: raw text editor pre-filled with current content
- Delete with confirmation

**Preset detail tab**: The existing preset detail page (`MySkills.tsx`) gets a tab bar at the top:
- "技能库" tab (existing skill list, current behavior)
- "MCP库" tab (new: lists MCP servers in this preset, with add/remove controls)
- The tab bar shows counts: "技能库 {N}" / "MCP库 {M}"
- Content excerpts in the MCP tab show server name + command only, omitting env vars to avoid leaking secrets in the list view

**PresetBar extension**: MCP sync is handled **internally** by `PresetBar` — no optional prop. `handleActivate` calls `POST /api/presets/:ref/apply` (unified skills + MCP). `handleDeactivate` calls `POST /api/presets/deactivate` (unified cleanup).

**Settings page**: Each tool card in the settings page gains two new fields under the skills directory setting:
- "MCP 输出目录" — text input + browse button
- "MCP 输出格式" — dropdown: TOML / JSON (JSON option hidden for codex since it only supports TOML profiles)

**Sidebar**: New "MCP库" entry in `NAV_ITEMS` below "技能库", using `Terminal` or `Puzzle` icon.

### MCP profile file naming

The sync output file uses the **exact preset name** as the filename stem, with no sanitization:

- `{preset_name}.config.toml` for TOML format
- `{preset_name}.config.json` for JSON format

This ensures `codex --profile "{preset_name}"` maps directly to the generated file. Preset names should use filesystem-safe characters; if a preset name contains characters invalid for the target filesystem (e.g. `/`, `\`), sync reports an error in the JSON output.

### Sample merged profile output

**TOML format** (default for codex):

```toml
[mcp_servers.weather-server]
command = "python"
args = ["-m", "weather_server"]

[mcp_servers.weather-server.env]
API_KEY = "your_api_key_here"
```

**JSON format** (future, when `mcp_output_format` is set to `"json"` for supported tools):

```json
{
  "mcpServers": {
    "weather-server": {
      "command": "python",
      "args": ["-m", "weather_server"],
      "env": {
        "API_KEY": "your_api_key_here"
      }
    }
  }
}
```

> Note: JSON output format exists in the schema from day one, but no tool currently consumes it (codex only supports TOML). It is reserved for future Cursor/Claude Code integration.

## Testing Decisions

### What makes a good test

- Test external behavior through the CLI `--json` contract, not internal Rust function signatures
- For CLI logic, test against a temp central repo and SQLite in-memory DB
- For web routes, test HTTP parameter validation and error propagation by mocking CLI output
- Prefer golden-file tests for the merged MCP profile output at sync time

### Test seams

1. **CLI core** (`cli/src/core/mcp_actions.rs`): Unit tests for:
   - Installing from TOML content → validates server name, rejects duplicates, writes file
   - Installing from JSON content → converts to TOML in central library, preserves key case
   - Installing with malformed TOML/JSON → structured error output
   - Installing JSON with multiple servers → rejects with structured error `{"error":"multiple_servers","count":N}`
   - Installing with env values containing special characters (quotes, newlines) → golden file
   - Installing with server name containing `.` / `]` / spaces → rejects with `"invalid_server_name"`
   - Installing with extra top-level TOML sections → rejects with `"extra_top_level_sections"`
   - Installing TOML exceeding 64KB → rejects
   - Edit → updates content in-place, rejects name change, rejects if server doesn't exist
   - Edit content exceeding 64KB → rejects
   - Sync with one tool → produces correct merged TOML file at output path
   - Sync with no MCP servers → produces empty `[mcp_servers]\n`
   - Sync with tool that lacks `supports_mcp_profile` → recorded in skipped list with reason
   - Sync with tool whose `supported_mcp_formats` doesn't include configured format → skipped
   - Sync with tool that has no MCP output dir → recorded in skipped list
   - Sync JSON output includes `profile_arg` field
   - Sync with `mcp_output_format=json` → produces valid `{"mcpServers":{}}`
   - Sync without active preset and no `--preset` → error `"no_active_preset"`
   - Remove → deletes file and DB record
   - Preset add-mcp on active preset → auto re-syncs MCP profile
   - Preset remove-mcp on active preset → auto re-syncs MCP profile
   - Preset add-mcp/remove-mcp on non-active preset → no auto sync
   - `mcp edit` on a server in the active preset → active preset auto re-syncs, profile file reflects new content
   - `mcp edit` on a server not in the active preset → no auto sync
   - `mcp remove` on a server in the active preset → DB membership dropped via CASCADE and active preset auto re-syncs (removed server gone from profile file)
   - `mcp remove` on a server not in the active preset → no auto sync, residual profile file unchanged
   - `mcp edit` atomicity → temp-file write + DB commit + rename order; DB rollback discards temp file, rename failure leaves DB authoritative
   - Preset apply switching from A to B → A's MCP profile files cleared, B's written
   - Preset deactivate active preset (no replacement) → MCP profile files cleared
   - Preset deactivate active preset (replacement exists) → replacement's MCP synced, old cleared
   - Preset deactivate non-active preset → MCP profile files cleared
   - `mcp sync` with a preset name containing `/` → tool skipped with `"invalid_preset_name"`, top-level `"preset_name_error"` present

2. **Web server routes** (`web/server/test/routes.test.ts`):
   - POST `/api/mcp/install` → passes `--content` flag correctly; rejects oversized content
   - PUT `/api/mcp/:name` → passes edit args correctly; 64KB limit enforced
   - GET `/api/mcp` → returns parsed CLI output with full plaintext content
   - POST `/api/presets/:ref/apply` → triggers skills sync + MCP sync sequentially
   - POST `/api/presets/deactivate` → triggers skills unlink + MCP clear
   - POST `/api/presets/:ref/mcp` → passes correct CLI args
   - PUT `/api/tools/:key/mcp` → validates format enum; rejects values not in the tool's `supported_mcp_formats` with 400 `"unsupported_mcp_format"` (e.g. setting codex to `"json"`)
   - POST `/api/presets/deactivate` → with body `{"preset":"<ref>"}` triggers skills unlink + MCP clear for the referenced preset; with omitted body targets the active preset
   - Settings tool MCP config → updates config correctly

### Prior art

- `cli/src/core/installer.rs` has `#[cfg(test)] mod tests` testing install logic against temp directories
- `cli/src/core/skill_store.rs` tests DB operations against in-memory SQLite
- `web/server/test/routes.test.ts` tests HTTP routes
- `web/server/test/validation.test.ts` tests parameter validation

New tests should follow the same patterns.

## Security

### Secrets in MCP configurations

MCP server configurations frequently contain secrets (API keys, tokens) in `env` blocks. This PRD takes the following stance:

1. **Central library storage**: Secrets are stored as plaintext in `~/.skills-manager/mcp/<name>.toml` and the `mcp_servers.content` DB column. The directory permissions of `~/.skills-manager/` serve as the primary access control.
2. **Sync output**: Secrets are written as plaintext to profile files (e.g. `~/.codex/{preset}.config.toml`). This is required because codex needs the actual env values at runtime.
3. **git_backup exposure**: The `mcp/` directory is included in `git_backup` snapshots alongside `skills/`. If a git remote is configured for backup, MCP files containing plaintext secrets may be pushed. Users should be aware of this risk; future work may add a `.gitignore` or encryption layer for the `mcp/` directory.
4. **Web UI**: `GET /api/mcp/:name` returns full plaintext TOML including env values; the default-mask + per-variable reveal toggle is deferred to a later security pass (current phase prioritizes functional completeness — see Out of Scope). Content excerpts in preset detail and list views still omit env sections, but to keep those read-only views concise rather than to protect secrets.
5. **Audit log**: MCP install/edit/remove operations should be recorded in the audit log. The schema extension is deferred to a future migration; until then, MCP audit is a known gap.
6. **CLI `mcp show`**: outputs full plaintext TOML including env values (no masking). Web reads via `GET /api/mcp/:name` also return plaintext this phase (see Out of Scope). Masking is uniformly deferred to a later security pass, so the CLI/Web asymmetry this phase is intentional.

### Install-time and edit-time validation

- Both `mcp install` and `mcp edit` enforce a maximum content size of 64KB to prevent accidental large inputs.
- No command allowlist or executable existence check is performed — the user is responsible for the validity of MCP server configurations they install.
- Server names are validated for filesystem and TOML safety (reject `.`, `]`, spaces, control chars, path separators).
- The `WriteJobQueue` serializes all MCP write operations, preventing races on concurrent preset modifications.

## Out of Scope

- **MCP server health checking**: No `mcp check` command; MCP servers do not have a remote source to check against (unlike skills with git sources)
- **MCP server auto-update**: No `mcp update` command; updating the server config is done via `mcp edit` or re-installing
- **MCP server discovery / marketplace**: No skills.sh equivalent for MCP; users provide their own configs
- **Multi-server per file**: Explicitly rejected; one `.toml` file = one `[mcp_servers.<name>]` section
- **Per-project MCP overrides**: MCP sync writes to tool-global config directories only (e.g. `~/.codex/`). Project workspace pages trigger the same global MCP sync — there is no project-scoped MCP profile file. Per-project overrides are future work.
- **Cursor / Claude Code etc. MCP integration**: Only codex is targeted in this phase. Other tools will be added later with their own output format and directory conventions. The sync logic skips non-codex tools via `supports_mcp_profile = false`.
- **Import from existing codex config**: Importing `[mcp_servers]` sections already present in a user's `~/.codex/config.toml` is future work.
- **At-rest encryption**: Central library secrets stored as plaintext; crypto.rs integration is future work (see Security section).
- **Web env masking / reveal**: `GET /api/mcp/:name` and the MCP page return full plaintext env values this phase; the default-mask + per-variable reveal toggle is deferred to a later security pass.
- **Audit log for MCP operations**: Schema extension deferred to future migration. MCP operations are not yet recorded in the audit log.
- **Disabled tool profile cleanup**: When a tool is disabled or its MCP output directory is removed, existing profile files are not automatically cleaned up. Users must manually delete stale files.

## Further Notes

- The `mcp_output_format` per-tool setting exists from day one so the DB schema and settings UI do not need a breaking change when JSON output is needed later. The settings UI hides the JSON option for codex since it only supports TOML profiles.
- Codex's `--profile` flag loads `$CODEX_HOME/<name>.config.toml` and overlays it on the base `config.toml`. Since the profile file can contain any valid config section, the merged MCP output file only includes `[mcp_servers.<name>]` sections — no other config — to keep the profile focused and avoid accidental config overrides.
- When a preset is deactivated, the MCP profile file is set to an empty `[mcp_servers]` section (not deleted and not 0 bytes). An empty section is valid TOML that codex can parse without error, providing a clean overlay with no servers. For JSON format tools, the empty equivalent is `{"mcpServers": {}}`. This supersedes ADR-0003's original 0-byte approach.
- The CLI `mcp sync` command is also callable independently, so power users can script profile generation without going through `presets apply`.
- The sync JSON output always includes the `profile_arg` field with the exact preset name, eliminating ambiguity about what argument to pass to `codex --profile`.
- Preset names must use filesystem-safe characters. If a name contains `/` or `\`, sync reports an error rather than writing to an unsafe path.
