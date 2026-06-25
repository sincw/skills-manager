# Align the Web Client Adapter With CLI-Backed Workspace Behavior

Status: ready-for-agent

## Parent

.scratch/workspace-cli-contract/PRD.md

## What to build

Align the Web client adapter with the CLI-backed Workspace behavior while preserving its public function surface for the first phase. Existing Web pages should keep calling the same client functions, but those functions should consume Rust-computed Workspace DTOs and work with queued write responses.

The client should stop owning Workspace Skill matching, `sync_status` inference, and other Workspace state derivation that now belongs to Rust core. UI refresh behavior should remain coherent after queued Workspace writes.

## Acceptance criteria

- [ ] Existing client adapter exports used by Project Workspace, Linked Workspace, and Global Workspace views remain available.
- [ ] Client adapter internals consume CLI-backed Web route DTOs without re-computing Workspace Skill matching or `sync_status`.
- [ ] Client adapter write functions handle queued Workspace write responses consistently with existing operations behavior.
- [ ] Project Workspace pages continue to display Workspace Skills, documents, agent targets, export actions, delete actions, and status fields.
- [ ] Global Workspace pages continue to display Skill lists, documents, Sync/unsync actions, delete actions, and status fields.
- [ ] User-visible errors from failed queued Workspace writes remain clear.
- [ ] The client still surfaces CLI capability mismatch states clearly when dependent APIs report capability errors.
- [ ] Web client changes avoid broad view import rewrites and keep the first-phase adapter public surface stable.
- [ ] Tests or existing verification paths cover the adapter behavior and any updated UI refresh behavior that can regress user-visible state.

## Blocked by

- .scratch/workspace-cli-contract/issues/02-registered-workspace-reads-through-cli-seam.md
- .scratch/workspace-cli-contract/issues/03-move-workspace-registry-writes-into-rust-store.md
- .scratch/workspace-cli-contract/issues/04-export-and-delete-project-linked-workspace-skills-via-queued-cli-writes.md
- .scratch/workspace-cli-contract/issues/05-sync-unsync-delete-global-workspace-skills-via-queued-cli-writes.md
