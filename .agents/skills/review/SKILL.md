---
name: review
description: Review the changes since a fixed point (commit, branch, tag, or merge-base) along two axes — Standards (does the code follow this repo's documented coding standards?) and Spec (does the code match what the originating issue/PRD asked for?). Uses a lightweight single-reviewer pass by default and escalates to parallel axis-specific sub-agents for larger or higher-risk reviews. Use when the user wants to review a branch, a PR, work-in-progress changes, or asks to "review since X".
---

Two-axis review of the diff between `HEAD` and a fixed point the user supplies:

- **Standards** — does the code conform to this repo's documented coding standards?
- **Spec** — does the code faithfully implement the originating issue / PRD / spec?

By default, run one lightweight reviewer that reports both axes. Escalate to **parallel axis-specific sub-agents** when the review is large, risky, or explicitly requested as a full review. The final report still keeps Standards and Spec separate.

The issue tracker should have been provided to you — run `/setup-matt-pocock-skills` if `docs/agents/issue-tracker.md` is missing.

## Process

### 1. Pin the fixed point

Whatever the user said is the fixed point — a commit SHA, branch name, tag, `main`, `HEAD~5`, etc. If they didn't specify one, ask for it.

Capture the diff command once: `git diff <fixed-point>...HEAD` (three-dot, so the comparison is against the merge-base). Also note the list of commits via `git log <fixed-point>..HEAD --oneline`.

Before going further, confirm the fixed point resolves (`git rev-parse <fixed-point>`) and the diff is non-empty. A bad ref or empty diff should fail here — not inside review sub-agents.

### 2. Identify the spec source

Look for the originating spec, in this order:

1. Issue references in the commit messages (`#123`, `Closes #45`, GitLab `!67`, etc.) — fetch via the workflow in `docs/agents/issue-tracker.md`.
2. A path the user passed as an argument.
3. A PRD/spec file under `docs/`, `specs/`, or `.scratch/` matching the branch name or feature.
4. If nothing is found, record "no spec available". Ask the user for a spec only when they explicitly requested spec compliance or the diff is too requirement-heavy to review meaningfully without one.

### 3. Identify the standards sources

Anything in the repo that documents how code should be written, such as `CODING_STANDARDS.md` or `CONTRIBUTING.md`.

### 4. Choose review mode

Use **quick mode** by default.

Use **full mode** when any of these apply:

- The user explicitly asks for `full`, `thorough`, `deep`, `parallel`, or `two-axis` review.
- The diff crosses multiple modules, product surfaces, or runtime boundaries.
- The diff changes high-risk behavior such as auth, permissions, data deletion, migrations, filesystem writes, sync behavior, external commands, or user-visible workflows.
- A concrete spec / PRD / issue is found and the diff is more than a small local change.
- The fixed point contains multiple commits whose intent is not obvious from the commit list.

If no spec is available, quick mode is usually enough unless the diff is otherwise risky.

### 5. Quick mode: spawn one review sub-agent

Use one `general-purpose` sub-agent.

**Combined reviewer prompt** — include:

- The full diff command and commit list.
- The list of standards-source files you found in step 3.
- The path or fetched contents of the spec, or state that no spec is available.
- The brief: "Review the diff along two separate axes. Under `Standards`, report every place the diff violates a documented standard. Cite the standard (file + the rule). Distinguish hard violations from judgement calls. Skip anything tooling enforces. Under `Spec`, report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong. Quote the spec line for each finding when a spec is available. Keep the two axes separate and do not rerank across them. Under 700 words."

If the spec is missing, tell the reviewer to skip Spec and report "no spec available".

### 6. Full mode: spawn both axis sub-agents in parallel

Send a single message with two `Agent` tool calls. Use the `general-purpose` subagent for both.

**Standards sub-agent prompt** — include:

- The full diff command and commit list.
- The list of standards-source files you found in step 3.
- The brief: "Report — per file/hunk where relevant — every place the diff violates a documented standard. Cite the standard (file + the rule). Distinguish hard violations from judgement calls. Skip anything tooling enforces. Under 400 words."

**Spec sub-agent prompt** — include:

- The diff command and commit list.
- The path or fetched contents of the spec.
- The brief: "Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong. Quote the spec line for each finding. Under 400 words."

If the spec is missing, skip the Spec sub-agent and note this in the final report.

### 7. Aggregate

Present the two reports under `## Standards` and `## Spec` headings, verbatim or lightly cleaned. Do **not** merge or rerank findings — the two axes are deliberately separate (see _Why two axes_).

End with a one-line summary: total findings per axis, and the worst issue _within each axis_ (if any). Don't pick a single winner across axes — that's the reranking the separation exists to prevent.

## Why two axes

A change can pass one axis and fail the other:

- Code that follows every standard but implements the wrong thing → **Standards pass, Spec fail.**
- Code that does exactly what the issue asked but breaks the project's conventions → **Spec pass, Standards fail.**

Reporting them separately stops one axis from masking the other.
