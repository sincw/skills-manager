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

Use `fast_context_search` as the primary way to create or review the map. Let it drive repository orientation, entry-point discovery, flow review, and module-boundary review with focused natural-language queries.

Use targeted file reads for concrete code details, exact local facts such as command names, and verification of unclear or incomplete `fast_context_search` output. Treat scanner results as navigation leads, not source of truth. If `fast_context_search` is unavailable, fails, or lacks access to the repository, report that fallback reason and continue only with a bounded evidence pass: git metadata, repository manifests, top-level directory listings, and targeted reads of likely entry points. Do not silently perform a broad manual repository scan.

## Knowledge Discipline

Treat `codebase-map.md` as stable navigation guidance, not the source of truth. Source code, manifests, tests, and runtime configuration remain authoritative for exact behavior.

Write only facts that help future agents choose where to start, which public interface or seam to use, or which command to run. Keep temporary investigation notes, uncertainty, confidence commentary, and one-off task findings out of the map; report low-confidence areas in the final response instead.

Before changing the map, be able to name the affected section and the durable navigation fact that changed. If that cannot be named, do a targeted evidence pass first. If the fact remains uncertain, leave the map unchanged and report the uncertainty.

Keep the map compact. Aim for roughly 150-250 lines; if it grows beyond that, prune low-leverage detail before adding more. Prefer one sentence or a short bullet per durable navigation fact.

## Architecture Navigation Model

Use architecture facts only when they improve navigation. Fit them into the existing map sections:

- `Entry Points`: durable app, CLI, worker, route, package, service, or test entry points, plus where each hands off into the main code path.
- `Stable Flows`: the stable flow spine from trigger to dispatcher or controller, domain or service layer, adapter or persistence boundary, and final output; include durable invariants and failure boundaries when they guide future edits.
- `Modules And Seams`: module responsibilities, owned contracts or data, public interfaces future agents should call, adapter seams, and useful test seams.
- `Debugging Entry Points`: only stable, reusable observation points that a future agent can run or inspect without inheriting a stale diagnosis. If an entry might mislead an agent when the system changes, omit it.

Do not write architecture review, desired redesign, exhaustive component inventory, or guide-style procedures. The map should tell an agent where to go and which boundary to respect, not teach every step of a workflow.

## Domain Navigation

Include domain knowledge only when it routes future agents through the codebase. A domain entry should connect the business concept to its owning module, entry point, stable flow, public seam, adapter, or focused test. Do not define the concept in the map; use `CONTEXT.md` for domain language and `docs/adr/` for durable decisions.

Good domain navigation looks like: "`Billing`: enters through webhook handlers and checkout commands; lifecycle rules are owned by `BillingService`; test through billing service integration tests." Bad domain navigation explains what billing means, repeats product policy, or records one task's discovery.

## Map Content

Write stable navigation facts that help future agents navigate the repository:

- where important flows enter the codebase
- durable app, CLI, worker, route, package, or service entry points
- domain concepts only when they route to code ownership, entry points, seams, adapters, or focused tests
- module responsibilities
- ownership boundaries, invariants, and flow handoffs that affect navigation
- public interfaces, seams, and adapters future agents should use
- canonical install, dev, lint, typecheck, test, focused test, and e2e commands, with no README-style tutorial text
- reusable debugging entry points only when they are stable and specific enough to reduce navigation time

Exclude:

- domain glossary entries; use `CONTEXT.md`
- business rules or product policy that do not change where agents should navigate
- ADR-level decisions; use `docs/adr/`
- temporary plans, line numbers, fragile internals, speculative architecture
- temporary investigation notes, confidence commentary, or unresolved questions
- guide-style tutorials, playbooks, or step-by-step workflow procedures
- issue-specific notes, fix briefs, one-off bug repros, and temporary debug instrumentation
- stale traces, bug-specific log snippets, speculative repro commands, or diagnostic breadcrumbs whose validity depends on one incident

If a section has no stable navigation facts, leave it empty or write `None known.` Do not pad the map for symmetry.

## Navigation Impact

`update` is an impact review, not a full rewrite.

Change `codebase-map.md` only when durable navigation facts changed:

- major entry points changed
- stable flows changed
- domain-to-code ownership or routing changed
- module responsibilities changed
- ownership boundaries, flow handoffs, or stable invariants changed
- public interfaces, seams, or adapters changed
- commands changed
- reusable debugging entry points changed
- package, directory, app, service, or deployment boundaries changed enough to affect navigation

Do not change `codebase-map.md` for routine bug fixes, implementation changes behind unchanged interfaces, regression tests using existing seams, fixture/snapshot updates, dependency bumps that do not change navigation, one-off fix briefs, repro notes, or debug logs.

Use targeted evidence before editing. A change is ready to write only when the affected map section, source evidence, and durable navigation fact are clear.

After a successful review, advance `state.json.reviewed_source_commit` to HEAD even when `codebase-map.md` did not change.

## Bootstrap

Use when no map exists.

Steps:

1. Verify clean workspace.
2. Capture HEAD with `git rev-parse HEAD`.
3. Confirm `docs/agents/codebase-map/state.json` does not exist.
4. Use `fast_context_search` as the primary source, plus targeted code reads for details and verification, to identify stable navigation facts.
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

7. Review only the map-impacting areas with `fast_context_search` as the primary source, using targeted code reads for details and verification.
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
