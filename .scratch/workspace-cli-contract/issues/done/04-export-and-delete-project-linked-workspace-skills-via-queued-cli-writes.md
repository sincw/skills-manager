# Export and Delete Project/Linked Workspace Skills via Queued CLI Writes

Status: ready-for-agent

## Parent

.scratch/workspace-cli-contract/PRD.md

## What to build

Move Project Workspace and Linked Workspace Skill export/delete behavior behind queued CLI-backed writes. A user should be able to export a Skill from the Skill Library into a registered Project Workspace or Linked Workspace and delete a Workspace-local Skill copy through existing Web routes and CLI commands.

Exports must remain conservative: an existing target directory is an error, not an overwrite. Deletes must remove only the Workspace Skill copy and must not delete the Skill Library entry or mutate Sync-managed target records.

## Acceptance criteria

- [ ] The CLI exports a Skill Library Skill into a registered Project Workspace for selected Tools.
- [ ] The CLI exports a Skill Library Skill into a registered Linked Workspace for selected Tools where the Workspace semantics support it.
- [ ] Export refuses to overwrite an existing Workspace Skill target directory by default.
- [ ] Export reports clear errors for missing Skill refs, missing Tools, disabled Tools, and unsupported Tool Workspace paths.
- [ ] The CLI deletes a Project Workspace Skill copy by Workspace id, Tool, and relative Skill path.
- [ ] The CLI deletes a Linked Workspace Skill copy by Workspace id, Tool, and relative Skill path when applicable.
- [ ] Deleting a Project Workspace or Linked Workspace Skill copy does not delete the Skill Library entry.
- [ ] Project Workspace and Linked Workspace export/delete do not create, update, or delete Sync-managed target records.
- [ ] Existing Web Project Workspace export and delete routes keep their HTTP paths while enqueuing CLI-backed write jobs.
- [ ] Web operation records clearly surface success and failure for export/delete jobs.
- [ ] Rust tests cover successful export, no-overwrite behavior, delete semantics, and error cases.
- [ ] Web route tests cover queued write behavior, CLI argv construction, and no direct filesystem fallback for these routes.

## Blocked by

- .scratch/workspace-cli-contract/issues/03-move-workspace-registry-writes-into-rust-store.md

## Comments

### 2026-06-25 Completion

Implemented Project Workspace and Linked Workspace Skill export/delete through the `workspaces` CLI contract and queued Web write jobs. Rust core now copies Workspace-local Skill exports conservatively, refuses existing targets, deletes only Workspace copies, validates missing/disabled/unsupported Tools, and leaves Sync-managed `skill_targets` untouched. Web Project Workspace export/delete routes keep their HTTP paths but enqueue `workspaces export` and `workspaces delete-skill` commands instead of using direct filesystem fallback.

Verification:
- `cargo fmt --manifest-path cli/Cargo.toml --check`
- `cargo test --manifest-path cli/Cargo.toml`
- `cd web && npm run test` (passed on rerun; the first parallel run with Rust tests timed out one pre-existing global sync route test under contention)
- `cd web && npm run build --workspace server`
- `cd web && npm run lint`

Blockers: none. Next iteration can move Global Workspace sync/unsync/delete writes behind the queued CLI contract.
