# Remove Web Fallback Implementations and Harden Capability Errors

Status: ready-for-agent

## Parent

.scratch/workspace-cli-contract/PRD.md

## What to build

Remove remaining Web-side fallback implementations for Workspace, Sync, Preset, database, metadata, and filesystem writes covered by the Workspace CLI contract. The Web server should enforce CLI capability checks and report clear health/API errors when the configured CLI is missing required Workspace capability.

This is the final hardening slice: after it lands, the Web server should be an HTTP adapter for the CLI seam rather than a second implementation of Workspace persistence or filesystem mutation.

## Acceptance criteria

- [ ] Direct Web-side fallback paths for Workspace registry writes are removed.
- [ ] Direct Web-side fallback paths for Project Workspace and Linked Workspace Skill filesystem writes are removed.
- [ ] Direct Web-side fallback paths for Global Workspace Sync/unsync/delete database and filesystem writes are removed.
- [ ] Direct Web-side compatibility fallback for Preset creation is removed if the new minimum CLI capability covers that behavior.
- [ ] Web health reports CLI readiness and missing Workspace capabilities clearly.
- [ ] APIs that require missing CLI Workspace capability return a clear unavailable response and do not mutate state.
- [ ] The Web server still starts when CLI capability is missing, so users can see the error in the Web Companion.
- [ ] Route tests verify capability mismatch behavior for health and representative read/write APIs.
- [ ] Route tests verify that removed fallback paths are not invoked when CLI capability is missing or command execution fails.
- [ ] Documentation or operational messaging is updated where needed so users know to upgrade or configure the matching CLI.

## Blocked by

- .scratch/workspace-cli-contract/issues/03-move-workspace-registry-writes-into-rust-store.md
- .scratch/workspace-cli-contract/issues/04-export-and-delete-project-linked-workspace-skills-via-queued-cli-writes.md
- .scratch/workspace-cli-contract/issues/05-sync-unsync-delete-global-workspace-skills-via-queued-cli-writes.md
- .scratch/workspace-cli-contract/issues/06-align-web-client-adapter-with-cli-backed-workspace-behavior.md
