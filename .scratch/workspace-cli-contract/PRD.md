# PRD: Route Workspace Writes Through the CLI Contract

Status: ready-for-agent

## Problem Statement

Skills Manager has two supported product surfaces: the CLI and the Web Companion. Users expect the same Skill Library, Preset, Sync, Global Workspace, Project Workspace, and Linked Workspace behavior regardless of which surface they use.

Today, the Web Companion owns some Workspace behavior directly. It keeps a Web-side Workspace registry, scans Workspace Skill directories itself, copies and deletes Skill directories itself, and has compatibility fallbacks that write persistence and filesystem state without going through the CLI JSON contract. This creates low locality: a user-visible Workspace or Sync bug may need to be fixed in Rust core, the Web server, and the Web client. It also weakens the ADR that made the CLI JSON contract the backend contract for the Web Companion.

## Solution

Move persistent and filesystem-changing Skill Library, Preset, Sync, Global Workspace, Project Workspace, and Linked Workspace writes behind the Rust core and expose them through a new top-level `workspaces` CLI JSON contract. Keep existing Web HTTP routes and the Web client adapter surface stable in the first phase, but replace their implementation with CLI-backed reads and queued writes.

From the user's perspective, the Web Companion should keep working at the same URLs and with the same workflows, but Workspace behavior should become more consistent and more diagnosable. If the configured CLI lacks the required Workspace capability, the Web Companion should load and report a clear CLI capability error instead of silently using fallback implementations.

The plan is split into four vertical slices:

1. Workspace CLI read slice: add CLI-backed Workspace reads and route existing Web read routes through them.
2. Workspace registry write slice: move Project Workspace and Linked Workspace registration into the Rust store, migrate old Web registry data once, and route Web writes through queued CLI commands.
3. Workspace Skill write slice: move Global Workspace, Project Workspace, and Linked Workspace Skill write behavior into Rust core and route Web writes through queued CLI commands.
4. Client adapter alignment slice: keep the existing Web client adapter public surface, but align its internals with the new read DTOs and queued write semantics.

The testing seam for this PRD is the CLI JSON contract first. Web route tests should verify HTTP compatibility, queue behavior, and CLI invocation, while Rust tests cover Workspace behavior and state transitions. The user has already confirmed this seam during design convergence.

## User Stories

1. As a Web Companion user, I want Project Workspace behavior to match CLI behavior, so that I can trust the same Skill state from either surface.
2. As a Web Companion user, I want Linked Workspace behavior to match CLI behavior, so that external Skill roots are managed consistently.
3. As a Web Companion user, I want Global Workspace behavior to match CLI behavior, so that Tool-level Skill folders behave consistently.
4. As a CLI user, I want Workspace commands to be available through a clear top-level contract, so that I can script Workspace behavior directly.
5. As a CLI user, I want Workspace reads to return structured JSON, so that scripts do not parse human output.
6. As a CLI user, I want to list registered Project Workspaces and Linked Workspaces, so that I can inspect the Workspace registry.
7. As a CLI user, I want to add a Project Workspace by path, so that it becomes available to Workspace workflows.
8. As a CLI user, I want to add a Linked Workspace by name and path, so that an external Skill root can be managed as its own Workspace.
9. As a CLI user, I want to reorder registered Workspaces, so that the Web Companion and CLI share the same ordering.
10. As a CLI user, I want to remove a registered Workspace, so that stale Project Workspace or Linked Workspace entries disappear.
11. As a CLI user, I want to scan a directory for candidate Project Workspaces, so that I can discover projects with Tool Skill directories.
12. As a CLI user, I want to list Tool agent targets for a Workspace, so that I can see where Skills can be exported.
13. As a CLI user, I want to list Skills in a Project Workspace, so that I can inspect project-local Skill copies.
14. As a CLI user, I want to list Skills in a Linked Workspace, so that I can inspect an external Skill root.
15. As a CLI user, I want to list Skills in a Global Workspace for a Tool, so that I can inspect Tool-level Skill copies.
16. As a CLI user, I want to read the Skill document from a Project Workspace, so that I can inspect local Skill content.
17. As a CLI user, I want to read the Skill document from a Linked Workspace, so that I can inspect external Workspace Skill content.
18. As a CLI user, I want to read the Skill document from a Global Workspace, so that I can inspect Tool-level Skill content.
19. As a Web Companion user, I want existing Project Workspace pages to keep their routes, so that bookmarks and navigation do not break.
20. As a Web Companion user, I want existing Global Workspace pages to keep their routes, so that Tool Workspace navigation does not break.
21. As a Web Companion user, I want adding a Project Workspace to be queued as a write operation, so that concurrent writes are serialized.
22. As a Web Companion user, I want adding a Linked Workspace to be queued as a write operation, so that registry state stays consistent.
23. As a Web Companion user, I want reordering Workspaces to be queued as a write operation, so that ordering updates do not race with other writes.
24. As a Web Companion user, I want removing a Workspace to be queued as a write operation, so that registry updates are tracked in operations history.
25. As a Web Companion user, I want exporting a Skill from the Skill Library to a Project Workspace to be queued, so that filesystem writes are serialized.
26. As a Web Companion user, I want exporting a Skill from the Skill Library to a Linked Workspace to be queued, so that filesystem writes are serialized.
27. As a Web Companion user, I want deleting a Workspace Skill to be queued, so that filesystem deletes are recorded and do not race with Sync.
28. As a Web Companion user, I want Global Workspace Sync and unsync writes to be queued, so that managed Tool targets stay consistent.
29. As a Web Companion user, I want queued Workspace writes to appear in operations history, so that I can diagnose failed writes.
30. As a Web Companion user, I want Workspace write failures to show clear errors, so that I know what action failed.
31. As a Web Companion user, I want Workspace reads to remain immediate, so that browsing does not feel delayed by the write queue.
32. As a Web Companion user, I want dry-run and preview workflows to remain immediate, so that I can inspect consequences before writing.
33. As a Web Companion user, I want old Project Workspace registry data to be migrated automatically, so that existing Workspaces are not lost.
34. As a Web Companion user, I want migrated Web registry data to be preserved as a backup, so that migration is reversible by hand if needed.
35. As a Web Companion user, I want the Web Companion to stop reading the old registry after migration, so that there is one Workspace registry source.
36. As a Web Companion user, I want the Web Companion to load even if the CLI is too old, so that I can see a clear upgrade message.
37. As a Web Companion user, I want APIs that need missing CLI capabilities to return clear capability errors, so that failures are understandable.
38. As a maintainer, I want Skill Library, Preset, Sync, and Workspace writes to live behind one seam, so that bugs have locality.
39. As a maintainer, I want Workspace status calculation in Rust core, so that tests can cover external behavior without client-side inference.
40. As a maintainer, I want `skill_targets` to stay scoped to Sync-managed Tool targets, so that ordinary Workspace Skill copies do not pollute Sync state.
41. As a maintainer, I want Project Workspace and Linked Workspace Skill copies to be treated as Workspace content, so that deleting them does not affect the Skill Library.
42. As a maintainer, I want Global Workspace unsync to remove managed target records, so that Sync state remains accurate.
43. As a maintainer, I want Global Workspace delete to distinguish unmanaged local copies from managed Sync targets, so that the correct state is changed.
44. As a maintainer, I want Workspace Skill state to include whether a Skill is in the Skill Library, so that UI state does not require Web-side guesses.
45. As a maintainer, I want Workspace Skill state to include `sync_status`, so that UI state is derived from one implementation.
46. As a maintainer, I want Workspace Skill state to include the matching center Skill id when available, so that UI actions can target the Skill Library reliably.
47. As a maintainer, I want Workspace Skill state to include tags and description from the Skill Library when matched, so that the Web UI can display enriched state without extra inference.
48. As a maintainer, I want export to a Workspace to refuse existing target directories by default, so that local Skill edits are not overwritten silently.
49. As a maintainer, I want Workspace delete to remove only the Workspace copy, so that users do not accidentally delete Skill Library entries.
50. As a maintainer, I want the Web server to stop writing database rows and Skill target directories directly, so that Web routes remain adapters.
51. As a maintainer, I want Web route tests to keep HTTP compatibility stable, so that client routes can migrate internally without user-visible route churn.
52. As a maintainer, I want the Web client adapter public surface to remain stable during the first phase, so that the seam migration does not require broad view rewrites.
53. As a maintainer, I want Tool catalog deepening deferred, so that Workspace migration can land without unnecessary Tool UI churn.
54. As a maintainer, I want CLI Workspace references to use stable ids in the first phase, so that command behavior is predictable.
55. As a maintainer, I want Workspace matching rules to be tested at the Rust core seam, so that state names have durable semantics.
56. As a maintainer, I want the CLI capability check to be visible through health and API errors, so that deployment misconfiguration is diagnosable.
57. As a maintainer, I want the old Web fallback implementation removed, so that future changes do not need to update two code paths.
58. As a maintainer, I want the migration split into vertical slices, so that each change can be reviewed and verified independently.

## Implementation Decisions

- The Rust core owns persistent and filesystem-changing writes for Skill Library, Preset, Sync, Global Workspace, Project Workspace, and Linked Workspace behavior.
- The Web server acts as an HTTP adapter. Its responsibilities are request validation, auth, CLI argv construction, write queuing, command logging, audit logging, response envelopes, and capability error reporting.
- The Web server must not directly write the Skill Library database, Sync metadata, Skill target directories, or the Workspace registry as runtime implementation.
- Add a top-level `workspaces` CLI command group rather than placing Workspace behavior under `skills` or `tools`.
- Project Workspace and Linked Workspace registry state is owned by the Rust store.
- Global Workspace is part of the Workspace module, but is derived from Tool adapter state and is not registered in the Workspace registry.
- Existing Web HTTP routes remain stable during the first phase. Their implementation changes from Web-side logic to CLI-backed logic.
- Existing Web client adapter exports remain stable during the first phase. Internals may change to call new Web routes or handle queued writes, but views should not need broad import rewrites.
- Workspace references in first-phase CLI commands use stable Workspace ids. Name and path based reference resolution is out of scope for the first phase.
- Old Web registry data is migrated once into the Rust store. After successful import, the old registry file is renamed to a timestamped migrated backup and is no longer a runtime state source.
- Web write APIs consistently return queued operations for filesystem or persistent state changes.
- Reads and dry-run or preview operations may remain synchronous.
- The Web server should still start when CLI Workspace capability is missing, but health and dependent API responses must report a clear capability error.
- API responses that depend on missing CLI capability should return a clear unavailable response instead of falling back to Web-side mutation.
- `skill_targets` remains scoped to Sync-managed Tool targets.
- Project Workspace and Linked Workspace Skill copies are not recorded in `skill_targets`.
- If future behavior needs persistent Project Workspace or Linked Workspace Sync state, it should use a dedicated model rather than reusing `skill_targets`.
- Workspace Skill state is computed by Rust core and returned as DTO data.
- The Workspace Skill DTO preserves the existing state vocabulary: `project_only`, `in_sync`, `project_newer`, `center_newer`, and `diverged`.
- `project_only` means the Workspace contains a Skill that cannot be matched to a Skill Library entry.
- `in_sync` means the Workspace Skill matches a Skill Library entry and the content hash matches.
- `project_newer` means the Workspace Skill matches a Skill Library entry, the content hash differs, and Workspace modification evidence points newer than the center Skill.
- `center_newer` means the Workspace Skill matches a Skill Library entry, the content hash differs, and center Skill modification evidence points newer than the Workspace Skill.
- `diverged` means the Workspace Skill matches a Skill Library entry, the hash differs, and modification evidence is insufficient or ambiguous.
- Workspace Skill matching should prefer explicit or managed target evidence if available in the future, then Skill directory candidates, then Skill document name, then content hash as strong evidence.
- Exporting a Skill to a Workspace refuses to overwrite an existing target directory by default.
- Deleting a Project Workspace or Linked Workspace Skill deletes only the Workspace copy and does not affect the Skill Library.
- Deleting an unmanaged Global Workspace Skill deletes only the local Tool-level copy.
- Unsyncing a managed Global Workspace Skill removes the target directory and the corresponding Sync-managed target record.
- Removing a Skill from the Skill Library remains responsible for deleting the center Skill and cleaning up Sync-managed targets.
- Tool catalog deepening is deferred to a later phase. First-phase Tool interface work is limited to what Workspace needs: Tool identity, display name, enabled and installed state, global skills root, project-relative skills root, recursive scan behavior, and final paths after overrides.
- The implementation is delivered in four vertical slices: Workspace reads, Workspace registry writes, Workspace Skill writes, and client adapter alignment.
- ADR-0001 remains in force: the Web Companion uses the CLI JSON interface as its backend contract.
- ADR-0002 records the new decision to remove Web fallback implementations and route Web writes through the CLI Workspace contract.

## Testing Decisions

- The highest test seam is the CLI JSON contract. Rust tests should validate Workspace behavior by exercising the same module behavior exposed through the CLI contract where practical.
- Good tests should cover external behavior: returned DTOs, persisted registry state, filesystem side effects, queued write behavior, error envelopes, and capability errors. They should not assert private helper structure.
- Workspace read tests should cover Project Workspace, Linked Workspace, and Global Workspace listing.
- Workspace document tests should cover reading Skill documents by Workspace id or Tool key plus relative path.
- Workspace registry write tests should cover add, add linked, reorder, remove, duplicate handling, and stable id behavior.
- Registry migration tests should cover importing old Web registry data, preserving existing Rust store entries, and renaming the migrated file.
- Workspace Skill state tests should cover `project_only`, `in_sync`, `project_newer`, `center_newer`, and `diverged`.
- Workspace matching tests should cover directory-name matching, Skill document name matching, content-hash matching, and ambiguous matches.
- Workspace export tests should cover successful export, missing Skill Library ref, missing Tool, disabled Tool, unsupported Project Workspace Tool path, and existing target directory refusal.
- Workspace delete tests should cover Project Workspace delete, Linked Workspace delete, unmanaged Global Workspace delete, and managed Global Workspace unsync.
- Sync-managed target tests should verify that Global Workspace Sync and unsync update target records, while Project Workspace and Linked Workspace export/delete do not.
- Web route tests should use existing route-test prior art: HTTP request injection, stubbed CLI execution, argv verification, response envelope verification, and queue status verification.
- Web route tests should confirm existing HTTP route compatibility while implementation moves behind CLI commands.
- Web route tests should verify that all persistent or filesystem-changing Workspace writes enqueue jobs rather than running synchronously.
- Web route tests should verify that missing CLI capability returns clear health and API errors without invoking fallback mutation.
- Web client tests should focus on adapter behavior and user-visible state where existing test infrastructure supports it. The first phase should avoid broad view rewrites.
- Existing Rust unit tests around Workspace scanning, Skill metadata parsing, Sync target records, Sync engine behavior, Tool adapter path selection, and store migrations are prior art for the new tests.
- Existing Web server tests around CLI argv construction, auth, operations jobs, project registry behavior, workspace export/delete, and preset compatibility paths are prior art for the route migration tests.

## Out of Scope

- Splitting the Web client adapter into separate Skill Library, Workspace, Preset, and Operations modules.
- Deepening the Tool catalog beyond the minimal Tool interface needed by Workspace behavior.
- Changing existing Web HTTP route paths.
- Changing broad Web UI navigation or layout.
- Supporting Workspace reference resolution by name or path in first-phase CLI commands.
- Implementing bidirectional Project Workspace update commands such as update from Skill Library or update Skill Library from Workspace.
- Automatically overwriting existing Workspace Skill directories during export.
- Adding a new persistent model for Project Workspace or Linked Workspace Sync state.
- Reworking Skill Library install, update, check, remove, or Adopt behavior beyond the changes needed to route Web writes through the CLI seam.
- Rewriting the Web Companion immediately.
- Reintroducing desktop or Tauri-specific runtime behavior.

## Further Notes

- This PRD is ready for an agent because the major product and architecture questions have already been resolved in the design convergence session.
- The main risk is blast radius across CLI, Rust core, Web server, Web client adapter, and tests. The four-slice delivery plan is intended to keep each change reviewable.
- The Web Companion should prefer visible capability errors over process exit when the CLI is too old or missing the required Workspace contract.
- The project glossary terms are Skill, Skill Library, Skill Source, Tool, Preset, Global Workspace, Project Workspace, Linked Workspace, Install, Sync, and Adopt.
