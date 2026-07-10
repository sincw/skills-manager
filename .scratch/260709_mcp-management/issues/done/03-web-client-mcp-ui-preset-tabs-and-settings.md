Status: done

## What to build

Add the Web Companion client UI for MCP Server Library management, completing the MCP vertical slice through the presentation layer. The UI calls only the HTTP API from issue 02.

Two new primary UI surfaces and extensions to existing ones:

1. **New `McpPage`** (`web/client/src/web/McpPage.tsx`) — the MCP library page, reachable from the sidebar. Lists all installed MCP servers; supports: install via a single raw TOML content text editor (server name parsed from `[mcp_servers.<name>]`, no separate name field); view (raw TOML display, env values shown as plaintext this phase — masking deferred); edit (raw TOML editor pre-filled with the current full content); delete with confirmation. MCP write calls go through the same client adapter seam as other writes (`web/client/src/lib/tauri.ts`).

2. **Preset detail tab bar** (extend the existing preset detail page, e.g. `MySkills.tsx`): two tabs — "技能库" (existing skill list, unchanged behavior) and "MCP库" (new: lists MCP servers in this preset, with add/remove controls). The tab bar shows counts "技能库 {N}" / "MCP库 {M}". The MCP tab's content excerpts show server name + command only (env sections omitted) to keep the read-only list concise (not for secret protection this phase).

3. **PresetBar extension** — MCP sync is handled internally with no new optional prop. `handleActivate` calls `POST /api/presets/:ref/apply` (unified skills + MCP); `handleDeactivate` calls `POST /api/presets/deactivate` (unified cleanup). Because the project workspace activation changes MCP config globally (profile files are written to the tool's global config dir, never project-scoped), the project workspace PresetBar surfaces a non-blocking notice "MCP 配置全局生效，不限于当前项目" on activation.

4. **Settings page** — each tool card gains two new fields under the existing skills directory setting: "MCP 输出目录" (text input + browse button) and "MCP 输出格式" (dropdown TOML / JSON, with the JSON option hidden for tools that don't support it — e.g. codex only supports TOML profiles). Writes go to `PUT /api/tools/:key/mcp`.

5. **Sidebar** — new "MCP库" entry below "技能库"; the sidebar preset labels show skill counts only (MCP counts belong in the preset detail tabs) to keep the sidebar uncluttered.

## Included tracer bullets

- [x] New `McpPage.tsx`: list / install-from-raw-TOML / view (plaintext) / edit / delete-with-confirmation
- [x] Preset detail page tab bar: "技能库" (existing) | "MCP库" (new) with counts; MCP tab lists servers with add/remove controls and name+command excerpts
- [x] PresetBar `handleActivate` → unified `POST /api/presets/:ref/apply`; `handleDeactivate` → unified `POST /api/presets/deactivate` (internal, no new optional prop)
- [x] Project workspace PresetBar non-blocking notice "MCP 配置全局生效，不限于当前项目" on activation
- [x] Settings tool card: "MCP 输出目录" input + browse; "MCP 输出格式" dropdown (TOML/JSON, JSON hidden for tools whose format list excludes it, e.g. codex) → `PUT /api/tools/:key/mcp`
- [x] Sidebar "MCP库" `NAV_ITEMS` entry below "技能库"; preset labels keep skill-only counts

## Acceptance criteria

- [x] Sidebar renders a "MCP库" entry below "技能库"; navigating to it renders `McpPage`
- [x] `McpPage` lists installed MCP servers; install via raw TOML content parses the server name and creates the server; view shows full plaintext TOML; edit pre-fills the current full content and updates in-place without changing the server name; delete prompts confirmation and removes the server
- [x] Preset detail page renders a tab bar with counts ("技能库 {N}" / "MCP库 {M}"); "技能库" preserves existing skill-list behavior; "MCP库" lists the preset's MCP servers with server-name + command excerpts (no env) and add/remove controls that call the membership routes
- [x] PresetBar activation triggers `POST /api/presets/:ref/apply` and deactivation triggers `POST /api/presets/deactivate`; MCP is synced as part of the same operation (no separate MCP button/prop)
- [x] Project workspace PresetBar surfaces the "MCP 配置全局生效，不限于当前项目" notice on activation; global workspace PresetBar does not (MCP is already global there)
- [x] Settings tool card shows "MCP 输出目录" + "MCP 输出格式"; the JSON option is hidden for tools whose supported formats exclude it (e.g. codex); saving calls `PUT /api/tools/:key/mcp`
- [x] Sidebar preset labels show skill counts only; MCP counts appear only in the preset detail tabs
- [x] Client builds without type/lint regressions: `npm --workspace web/client run build` and lint pass

## Suggested verification

- [x] `npm --workspace web/client run build` and lint
- [ ] Manual end-to-end against a running Web Companion (issues 01 + 02 deployed):
  - sidebar → MCP库 → install a server from raw TOML → view (plaintext env) → edit command → delete
  - open a preset → switch to "MCP库" tab → add/remove a server → confirm preset detail counts update
  - PresetBar activate / deactivate on global workspace and on a project workspace → confirm unified apply/deactivate runs and (for project workspace) the global-effect notice appears
  - Settings → tool card → set MCP 输出目录 + 输出格式 (codex has no JSON option) → save → `GET /api/tools` reflects it
- [ ] Confirm sidebar preset labels show only skill counts while preset detail tabs show both counts

## Out of scope

- CLI core and Web server routes — issues 01 and 02 (this issue depends on both)
- Audit logging / secret masking / encryption — deferred to later passes
- Per-project MCP overrides (project workspace writes to the tool's global config dir by design)

## Blocked by

- `.scratch/260709_mcp-management/issues/02-web-server-mcp-routes-and-unified-preset-ops.md` (the HTTP API this UI calls; in turn blocked by issue 01)

## Completion note (2026-07-09)

Done:
- Client adapter (`web/client/src/lib/tauri.ts`): MCP library CRUD, preset MCP membership, unified `applyPreset`/`deactivatePreset` (POST `/api/presets/deactivate`), `setToolMcpSettings`, `extractMcpCommand` helper; `ToolInfo` MCP fields.
- Core UI: Sidebar "MCP库" → `/mcp` (`McpLibrary.tsx`); MySkills preset detail tabs 技能库/MCP库 with counts + `PresetMcpTab`; PresetBar unified apply/deactivate + project-workspace MCP global notice; Settings tool cards MCP 输出目录/格式 (format dropdown filtered by `supported_mcp_formats`).
- Web console: `McpPage` + nav/route; PresetsPage skill/MCP tabs; ToolsPage MCP settings.
- i18n: zh / en / zh-TW keys for all new surfaces.
- Verified: `cd web && npm run build --workspace client` and lint pass.

Notes for next:
- Manual e2e against a live Web Companion (issue 01+02 CLI/server) not run in this loop.
- Audit-log / secret masking still deferred.
