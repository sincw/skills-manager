---
name: codebase-map
description: Create or update the agent navigation map for a codebase.
disable-model-invocation: true
---

# Codebase Map

Maintain `docs/agents/codebase-map/codebase-map.md` as a compact navigation map for future agents. The map is not a changelog, architecture review, domain glossary, ADR, debug journal, or full source snapshot.

Supported commands:

- `/codebase-map bootstrap`
- `/codebase-map update`

Only the user invokes this skill. Other workflows may read the map, but they must not run `/codebase-map` automatically.

## Artifacts

Create exactly two map artifacts:

```text
docs/
  agents/
    codebase-map/
      codebase-map.md
      state.json
```

`codebase-map.md` uses these sections:

```markdown
# Codebase Map

## Orientation

## Entry Points

## Stable Flows

## Modules And Seams

## Commands

## Debugging Entry Points
```

`state.json` tracks the last source commit reviewed for navigation impact:

```json
{
  "schema_version": 1,
  "reviewed_source_commit": "FULL_HEAD_SHA",
  "generated_at": "ISO-8601 timestamp",
  "map_file": "codebase-map.md"
}
```

`reviewed_source_commit` means source changes up to this commit have been reviewed for durable navigation impact. It does not mean every source detail is represented in the map.

## Preconditions

Require a clean workspace before `bootstrap` or `update`:

```bash
git status --porcelain
```

If the command prints anything, stop. Do not inspect, scan, or update the map from a dirty tree. Map maintenance should not mix with feature work, bug fixes, or diagnosis artifacts.

## Scanner

Use context7 MCP as the primary way to create or review the map. Start with context7 and let it drive the repository orientation, entry-point discovery, flow review, and module-boundary review.

Use targeted file reads for concrete code details, exact local facts such as command names, and verification of unclear or incomplete context7 output. If context7 or the configured scanner service is unavailable, fails, or lacks access to the repository, report that fallback reason and continue only when the required navigation facts can be verified from git metadata and targeted reads. Do not silently perform a broad manual repository scan.

## Map Content

Write stable navigation facts:

- where important flows enter the codebase
- durable app, CLI, worker, route, package, or service entry points
- module responsibilities
- public interfaces, seams, and adapters future agents should use
- install, dev, lint, typecheck, test, focused test, and e2e commands
- reusable debugging entry points, logs, traces, or repro commands

Exclude:

- domain glossary entries; use `CONTEXT.md`
- ADR-level decisions; use `docs/adr/`
- temporary plans, line numbers, fragile internals, speculative architecture
- issue-specific notes, fix briefs, one-off bug repros, and temporary debug instrumentation

If the map grows large, prune details instead of splitting files.

## Navigation Impact

`update` is an impact review, not a full rewrite.

Change `codebase-map.md` only when durable navigation facts changed:

- major entry points changed
- stable flows changed
- module responsibilities changed
- public interfaces, seams, or adapters changed
- commands changed
- reusable debugging entry points changed
- package, directory, app, service, or deployment boundaries changed enough to affect navigation

Do not change `codebase-map.md` for routine bug fixes, implementation changes behind unchanged interfaces, regression tests using existing seams, fixture/snapshot updates, dependency bumps that do not change navigation, one-off fix briefs, repro notes, or debug logs.

After a successful review, advance `state.json.reviewed_source_commit` to HEAD even when `codebase-map.md` did not change.

## Bootstrap

Use when no map exists.

Steps:

1. Verify clean workspace.
2. Capture HEAD with `git rev-parse HEAD`.
3. Confirm `docs/agents/codebase-map/state.json` does not exist.
4. Use context7 as the primary source, plus targeted code reads for details and verification, to identify stable navigation facts.
5. Write `docs/agents/codebase-map/codebase-map.md`.
6. Write `docs/agents/codebase-map/state.json` with `reviewed_source_commit` set to captured HEAD.
7. Report generated files, reviewed commit, scanner used, and low-confidence areas.

Completion criteria:

- `codebase-map.md` exists.
- `state.json.reviewed_source_commit` equals the captured clean HEAD.
- No source code was changed.

## Update

Use when the user explicitly asks to review map freshness.

Steps:

1. Verify clean workspace.
2. Read `state.json`.
3. Capture HEAD with `git rev-parse HEAD`.
4. Compute source drift:

   ```bash
   git diff --name-status <reviewed_source_commit>..HEAD -- . ':(exclude)docs/agents/codebase-map/**'
   ```

5. If there are no source changes, report `reviewed-no-change` and make no edits.
6. If source changed, classify the drift as:

   - `map-impacting`: durable navigation facts may have changed.
   - `non-map-impacting`: routine fixes or local implementation changes.

7. Review only the map-impacting areas with context7 as the primary source, using targeted code reads for details and verification.
8. If durable navigation facts changed, update only affected sections of `codebase-map.md`.
9. Update `state.json.reviewed_source_commit` to HEAD and refresh `generated_at`.
10. Report:

   - result: `updated`, `reviewed-no-change`, or `blocked`
   - old and new reviewed commits
   - map-impacting changes found
   - non-map-impacting changes ignored, summarized by category
   - files changed
   - low-confidence areas

Completion criteria:

- `state.json.reviewed_source_commit` equals the clean HEAD reviewed by this run.
- `codebase-map.md` changes only when durable navigation facts changed.
- No source code was changed.
