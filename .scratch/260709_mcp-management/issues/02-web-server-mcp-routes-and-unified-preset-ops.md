Status: ready-for-agent

## What to build

Add MCP Web API routes to the Skills Manager Web Companion server and unify preset `apply` / `deactivate` to handle skills and MCP together in a single queued operation. The server is a thin HTTP layer over the CLI `--json` contract; it must not implement MCP or preset semantics itself.

New routes:
- `GET    /api/mcp`                        → `mcp list`
- `GET    /api/mcp/:name`                  → `mcp show` (full plaintext TOML, including env values — masking deferred this phase)
- `POST   /api/mcp/install`                → `mcp install` from inline TOML content (passes `--content`)
- `PUT    /api/mcp/:name`                  → `mcp edit` (update content in-place; 64KB limit enforced server-side)
- `DELETE /api/mcp/:name`                  → `mcp remove`
- `POST   /api/mcp/sync`                   → `mcp sync`
- `POST   /api/presets/:ref/mcp`           → `presets add-mcp`
- `DELETE /api/presets/:ref/mcp`           → `presets remove-mcp`
- `GET    /api/presets/:ref/mcp`           → `presets list-mcp`
- `POST   /api/presets/:ref/apply`         → unified apply: skills sync + MCP sync, performed serially via the existing write queue
- `POST   /api/presets/deactivate`         → unified deactivate: skills unlink + MCP clear. Body schema: `{ "preset": "<ref>" }` where `preset` is a preset reference (id or name); omitted → the currently active preset
- `PUT    /api/tools/:key/mcp`             → update a tool's MCP output dir/format. Validates `mcp_output_format` against allowed values (`"toml"` | `"json"`) AND against the target tool's `supported_mcp_formats`; unsupported requests (e.g. setting codex to `"json"`) return 400 `unsupported_mcp_format`, matching the settings-UI behavior (which hides JSON for codex)
- Existing `GET /api/tools` extended to include each tool's MCP settings (output dir + format)

All MCP write operations and the unified `apply` / `deactivate` routes go through `WriteJobQueue` (same seam as existing skill writes) to serialize preset state transitions and prevent races. Per-layer validation boundaries reuse `web/server/src/validation.ts` patterns (absolute Linux paths when applicable, enums, arrays, confirmation). `:key` is the tool adapter key (builtin or custom).

## Included tracer bullets

- [ ] `GET /api/mcp`, `GET /api/mcp/:name`, `POST /api/mcp/install`, `PUT /api/mcp/:name`, `DELETE /api/mcp/:name`, `POST /api/mcp/sync` wired through `directCli` / `WriteJobQueue`
- [ ] `POST /api/presets/:ref/apply` unified route triggering skills sync + MCP sync serially via one queued job
- [ ] `POST /api/presets/deactivate` unified route; body schema `{ "preset": "<ref>" }` (optional → active preset); triggers skills unlink + MCP clear
- [ ] `POST /api/presets/:ref/mcp`, `DELETE /api/presets/:ref/mcp`, `GET /api/presets/:ref/mcp` membership routes
- [ ] `PUT /api/tools/:key/mcp` route with enum + per-tool `supported_mcp_formats` validation (400 `unsupported_mcp_format`)
- [ ] `GET /api/tools` extended to surface tool MCP output dir + format in the response

## Acceptance criteria

- [ ] `POST /api/mcp/install` passes the `--content` flag correctly to the CLI and rejects oversized content (>64KB) with a 4xx before invoking the CLI
- [ ] `PUT /api/mcp/:name` forwards edit args correctly and enforces the 64KB content limit server-side
- [ ] `GET /api/mcp` returns parsed CLI list output; `GET /api/mcp/:name` returns the full plaintext TOML content
- [ ] `POST /api/presets/:ref/apply` triggers skills sync and MCP sync sequentially in a single queued operation (assert job ordering, not two independent calls)
- [ ] `POST /api/presets/deactivate` with `{"preset":"<ref>"}` triggers skills unlink + MCP clear for the referenced preset; with omitted body targets the active preset
- [ ] `POST /api/presets/:ref/mcp` and `DELETE /api/presets/:ref/mcp` pass correct CLI args (`presets add-mcp` / `remove-mcp`); `GET /api/presets/:ref/mcp` returns the membership list
- [ ] `PUT /api/tools/:key/mcp` rejects `mcp_output_format` values outside `{"toml","json"}` with 400; additionally rejects formats not in the tool's `supported_mcp_formats` (e.g. codex + `"json"`) with 400 `unsupported_mcp_format`
- [ ] `GET /api/tools` response includes each enabled tool's MCP output dir and `mcp_output_format`
- [ ] All MCP write operations and unified `apply` / `deactivate` go through `WriteJobQueue` (job records visible via `/api/operations/jobs`), serializing preset state transitions

## Suggested verification

- [ ] `npm --workspace web/server test` — new cases in `web/server/test/routes.test.ts` covering all routes above (install/PUT 64KB, apply/deactivate serialization, `unsupported_mcp_format` for codex+json, deactivate body schema) and `web/server/test/validation.test.ts` cases for the format enum
- [ ] Manual round-trip: `PUT /api/tools/codex/mcp` with a valid `toml` overrides the MCP output dir, then `GET /api/tools` reflects it; `PUT` with `"json"` for codex returns 400
- [ ] Manual: `POST /api/presets/:ref/apply` then check resulting profile files (skills + MCP) reflect a single operation; `POST /api/presets/deactivate {"preset":"<ref>"}` clears both

## Out of scope

- CLI `mcp` core and preset MCP integration — issue 01 (this issue depends on it)
- Web client UI (McpPage, preset tabs, settings UI, PresetBar) — issue 03
- Audit logging for MCP operations (deferred — known gap)
- Web-side secret masking (deferred to a later security pass; `GET /api/mcp/:name` returns plaintext this phase)

## Blocked by

- `.scratch/260709_mcp-management/issues/01-cli-core-mcp-library-lifecycle-and-sync.md` (the CLI `mcp` and `presets` subcommands this server invokes)