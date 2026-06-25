# Registered Workspace Reads Through the CLI Seam

Status: ready-for-agent

## Parent

.scratch/workspace-cli-contract/PRD.md

## What to build

Extend the `workspaces` CLI JSON contract from Global Workspace reads to registered Project Workspace and Linked Workspace reads. A user should be able to list registered Workspaces, scan for Project Workspace candidates, inspect agent targets, list Workspace Skills, and read Workspace Skill documents through both CLI and existing Web HTTP routes.

Rust core should own Workspace Skill matching and `sync_status` calculation. The Web server should adapt existing routes to the CLI seam, and the Web client should continue to receive compatible DTOs.

## Acceptance criteria

- [ ] The CLI lists registered Project Workspace and Linked Workspace records from the Rust store.
- [ ] The CLI scans a root directory for Project Workspace candidates using Tool project skills paths.
- [ ] The CLI returns Tool agent targets for a registered Workspace id.
- [ ] The CLI lists Skills in Project Workspace and Linked Workspace records by stable Workspace id.
- [ ] The CLI reads Project Workspace and Linked Workspace Skill documents by stable Workspace id, Tool, and relative Skill path.
- [ ] Workspace Skill DTOs use the existing status vocabulary: `project_only`, `in_sync`, `project_newer`, `center_newer`, and `diverged`.
- [ ] Workspace Skill matching is computed in Rust core, not Web server or Web client inference.
- [ ] Existing Web Project Workspace list, scan, agent-target, Skill list, and document routes remain HTTP-compatible while using CLI-backed reads.
- [ ] Rust tests cover Project Workspace and Linked Workspace reads, document reads, matching rules, and all five `sync_status` values.
- [ ] Web route tests verify CLI argv construction and response envelopes for registered Workspace read routes.

## Blocked by

- .scratch/workspace-cli-contract/issues/01-global-workspace-reads-through-cli-seam.md
