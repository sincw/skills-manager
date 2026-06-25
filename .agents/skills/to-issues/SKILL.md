---
name: to-issues
description: Break a plan, spec, or PRD into independently-grabbable AFK-max issue packages on the project issue tracker.
disable-model-invocation: true
---

# To Issues

Break a plan into independently-grabbable **AFK-max packages**. An AFK-max package is the largest coherent set of related tracer bullets that can safely be completed by one AFK loop iteration as one task and one commit.

The issue tracker and triage label vocabulary should have been provided to you — run `/setup-matt-pocock-skills` if not.

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes an issue reference (issue number, URL, or path) as an argument, fetch it from the issue tracker and read its full body and comments.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Issue titles and descriptions should use the project's domain glossary vocabulary, and respect ADRs in the area you're touching.

Look for opportunities to prefactor the code to make the implementation easier. "Make the change easy, then make the easy change."

### 3. Draft AFK-max packages

First identify **atomic tracer bullets** as a private planning artifact. Do not publish these directly unless they are already the largest safe package.

Then compress the atomic bullets into **AFK-max packages**. Publish the fewest issues possible while keeping each issue independently implementable, verifiable, and committable by one AFK loop iteration.

<vertical-slice-rules>

- Each package delivers a coherent but COMPLETE path through every affected layer (schema, API, UI, tests)
- A completed package is demoable or verifiable on its own
- Any prefactoring should be done first

</vertical-slice-rules>

<merge-rules>

Merge atomic bullets into the same AFK-max package when they:

- Serve the same user path or demoable outcome
- Touch the same code area or integration surface
- Share the same feedback loop (tests, typecheck, lint, build)
- Need no human decision between them
- Can be rolled back together
- Can be explained clearly by one commit message
- Remain checkable through explicit acceptance criteria

</merge-rules>

<split-rules>

Split packages only when merging would cross a real boundary:

- A product, design, API, or architecture decision needs human confirmation
- The work covers unrelated user paths or unrelated code areas
- A prefactor, migration, or infrastructure step can block later feature work
- The risk level or rollback boundary differs materially
- The verification loops are substantially different
- One commit message would become a vague list of chores
- One AFK loop iteration is likely to miss criteria or leave the issue partially complete

</split-rules>

### 4. Quiz the user

Present the proposed compression as a numbered list. Include:

- **Atomic tracer bullets found**: count only
- **AFK-max packages to publish**: count and numbered list

For each package, show:

- **Title**: short descriptive name
- **Included tracer bullets**: concise sub-bullets the package absorbs
- **Merge rationale**: why these bullets belong in one AFK iteration
- **Blocked by**: which other packages (if any) must complete first
- **Suggested verification**: concrete checks or commands that should prove the package
- **User stories covered**: which user stories this addresses (if the source material has them)

Ask the user:

- Is this compressed enough for AFK loop?
- Should any package be split because it crosses a real decision, risk, or rollback boundary?
- Can any packages be merged further while staying AFK-safe?
- Are the dependency relationships correct?

Iterate until the user approves the breakdown.

### 5. Publish the issues to the issue tracker

For each approved AFK-max package, publish a new issue to the issue tracker using the template below. The `Status:` line marks it ready for AFK agents unless instructed otherwise.

Publish issues in dependency order (blockers first) so you can reference real issue identifiers in the "Blocked by" field.

<issue-template>
Status: ready-for-agent

## Parent

A reference to the parent issue on the issue tracker (if the source was an existing issue, otherwise omit this section).

## What to build

A concise description of this AFK-max package. Describe the end-to-end behavior, not layer-by-layer implementation.

Avoid specific file paths or code snippets — they go stale fast. Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it here and note briefly that it came from a prototype. Trim to the decision-rich parts — not a working demo, just the important bits.

## Included tracer bullets

- [ ] Bullet 1
- [ ] Bullet 2
- [ ] Bullet 3

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Suggested verification

- [ ] Concrete test, typecheck, lint, build, or manual check for this package

## Out of scope

- Related work intentionally left for another issue, or "None"

## Blocked by

- A reference to the blocking ticket (if any)

Or "None - can start immediately" if no blockers.

</issue-template>

Do NOT close or modify any parent issue.
