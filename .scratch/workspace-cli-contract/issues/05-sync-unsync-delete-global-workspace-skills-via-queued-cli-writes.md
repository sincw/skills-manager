# Sync, Unsync, and Delete Global Workspace Skills via Queued CLI Writes

Status: ready-for-agent

## Parent

.scratch/workspace-cli-contract/PRD.md

## What to build

Move Global Workspace write behavior behind queued CLI-backed writes. A user should be able to Sync a Skill Library Skill into a Tool's Global Workspace, unsync a managed Global Workspace target, and delete an unmanaged Global Workspace local Skill through existing Web routes and CLI commands.

This slice must preserve the distinction between Sync-managed Tool targets and ordinary Workspace Skill copies. Global unsync of a managed target updates Sync-managed target records; ordinary Global Workspace delete only removes the local copy.

## Acceptance criteria

- [ ] The CLI Syncs a Skill Library Skill into a Tool's Global Workspace and records it as a Sync-managed Tool target.
- [ ] The CLI unsyncs a managed Global Workspace Skill target and removes its Sync-managed target record.
- [ ] The CLI deletes an unmanaged Global Workspace Skill copy without requiring a Skill Library ref.
- [ ] Deleting an unmanaged Global Workspace Skill does not delete the Skill Library entry.
- [ ] Global Workspace Sync and unsync keep `skill_targets` scoped to Sync-managed Tool targets.
- [ ] Existing Web Global Workspace sync, unsync, and delete routes keep their HTTP paths while enqueuing CLI-backed write jobs.
- [ ] Web operation records clearly surface success and failure for Global Workspace write jobs.
- [ ] Rust tests cover Sync-managed target creation, unsync cleanup, unmanaged delete, shared path safety, and disabled/missing Tool errors.
- [ ] Web route tests cover queued write behavior, CLI argv construction, and no direct database or filesystem fallback for Global Workspace writes.

## Blocked by

- .scratch/workspace-cli-contract/issues/01-global-workspace-reads-through-cli-seam.md
