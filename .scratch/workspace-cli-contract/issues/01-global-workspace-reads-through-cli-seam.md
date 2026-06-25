# Global Workspace Reads Through the CLI Seam

Status: ready-for-agent

## Parent

.scratch/workspace-cli-contract/PRD.md

## What to build

Add the first narrow `workspaces` CLI JSON read path for Global Workspace behavior, then route the existing Web Global Workspace read endpoints through that CLI seam. A user should be able to list Skills in a Tool's Global Workspace and read a Global Workspace Skill document through both CLI and Web without Web-side Workspace scanning or document parsing owning the behavior.

This slice should also establish the CLI capability signal that later slices can reuse. If the Web server cannot access the required Workspace CLI capability, it should report a clear capability error rather than falling back to Web-side Workspace implementation.

## Acceptance criteria

- [ ] The CLI exposes structured JSON reads for listing Global Workspace Skills for a Tool.
- [ ] The CLI exposes structured JSON reads for a Global Workspace Skill document by Tool and relative Skill path.
- [ ] Returned Global Workspace Skill DTOs include Rust-computed Skill Library matching fields, including center Skill id when available, `in_center`, `sync_status`, tags, and description.
- [ ] Existing Web Global Workspace list and document routes keep their HTTP paths and response shape compatible while using the CLI seam internally.
- [ ] Web route tests verify CLI argv construction, response envelopes, and missing-capability behavior for these read paths.
- [ ] Rust tests cover Global Workspace listing, document reads, Tool path selection, and status calculation through the highest available CLI/core seam.
- [ ] No Web-side fallback scanner or document parser remains active for the Global Workspace read paths covered by this slice.

## Blocked by

None - can start immediately
