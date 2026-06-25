# Route Web Writes Through the CLI Workspace Contract

The Web Companion will not maintain its own persistence or filesystem implementation for Skill Library, Preset, Sync, Global Workspace, Project Workspace, or Linked Workspace writes. Those writes are owned by the Rust core and exposed through the CLI JSON contract, with the Web server acting as an HTTP adapter that validates requests, queues writes, records operations, and reports CLI capability errors instead of falling back to direct database or filesystem mutation.

## Considered Options

- Keep Web compatibility fallbacks that write SQLite, metadata, Skill target directories, and the Web project registry directly. Rejected because it preserves two implementations and weakens the CLI JSON seam recorded in ADR-0001.
- Move only Preset and Sync writes behind the CLI, but leave Workspace registry and file operations in the Web server. Rejected because Global Workspace, Project Workspace, and Linked Workspace share the same Skill placement semantics and need one test surface.
- Make the Web server fail to start when the CLI lacks the required Workspace capability. Rejected because the Web Companion should still load and show a clear version/capability error.

## Consequences

- Workspace registry state is owned by the Rust store; old Web `projects.json` records are imported once and then treated as migrated input rather than runtime state.
- Web write APIs return queued operations consistently; reads and dry-run/preview commands may remain synchronous.
- `skill_targets` continues to describe Sync-managed Tool targets, not ordinary Skill copies in Project Workspace or Linked Workspace.
- The first implementation phase keeps Web HTTP routes and the client adapter surface stable while replacing their implementation with CLI-backed Workspace commands.
