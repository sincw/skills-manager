# Move Workspace Registry Writes Into the Rust Store

Status: ready-for-agent

## Parent

.scratch/workspace-cli-contract/PRD.md

## What to build

Move Project Workspace and Linked Workspace registration writes behind the Rust store and CLI JSON contract. A user should be able to add, reorder, and remove registered Workspaces through the existing Web routes and through CLI commands, with Web writes queued and recorded as operations.

This slice also migrates the old Web Workspace registry data once. After successful migration, the old registry file should be renamed to a migrated backup and should no longer be used as runtime state.

## Acceptance criteria

- [ ] The CLI adds a Project Workspace by path and returns the registered Workspace DTO.
- [ ] The CLI adds a Linked Workspace by name and path and returns the registered Workspace DTO.
- [ ] The CLI reorders registered Workspaces by stable ids.
- [ ] The CLI removes a registered Workspace by stable id.
- [ ] Existing Web add, linked-add, reorder, and remove routes keep their HTTP paths while enqueuing CLI-backed write jobs.
- [ ] Web operation records include queued, running, succeeded, and failed states for Workspace registry writes.
- [ ] Old Web Workspace registry data is imported into the Rust store when needed.
- [ ] Successfully imported old registry data is renamed to a timestamped migrated backup.
- [ ] After migration, Web runtime reads and writes use the Rust store through the CLI seam, not the old registry file.
- [ ] Duplicate Workspace inputs are handled deterministically and do not create duplicate registry records.
- [ ] Rust tests cover add, linked add, reorder, remove, duplicate handling, and stable id behavior.
- [ ] Web route tests cover queued writes, CLI argv construction, migrated registry handling, and operation status behavior.

## Blocked by

- .scratch/workspace-cli-contract/issues/02-registered-workspace-reads-through-cli-seam.md

## Completion note

Implemented Project Workspace and Linked Workspace registry writes through the Rust store and `workspaces` CLI JSON contract. Web registry add, linked-add, reorder, remove, and legacy registry migration now route through CLI-backed operation jobs; the old `projects.json` registry is imported and renamed when encountered.
