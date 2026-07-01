---
name: review
description: Review the changes since a fixed point (commit, branch, tag, or merge-base) along two axes — Standards (does the code follow this repo's documented coding standards?) and Spec (does the code match what the originating issue/PRD asked for?). Runs both axes, in one sub-agent for small diffs or two parallel sub-agents for large diffs, and reports them side by side. Use when the user wants to review a branch, a PR, work-in-progress changes, or asks to "review since X".
---

Two-axis review of the diff between `HEAD` and a fixed point the user supplies:

- **Standards** — does the code conform to this repo's documented coding standards?
- **Spec** — does the code faithfully implement the originating issue / PRD / spec?

Both axes are **deliberately separate** so one cannot mask the other. Whether they run in one sub-agent or two depends on diff size: small diffs run both axes in a single sub-agent; large diffs split into two parallel sub-agents so neither axis pollutes the other's context. This skill aggregates their findings either way.

The issue tracker should have been provided to you — run `/setup-matt-pocock-skills` if `docs/agents/issue-tracker.md` is missing.

## Process

### 1. Pin the fixed point

Whatever the user said is the fixed point — a commit SHA, branch name, tag, `main`, `HEAD~5`, etc. If they didn't specify one, ask for it.

Capture the diff command once: `git diff <fixed-point>...HEAD` (three-dot, so the comparison is against the merge-base). Also note the list of commits via `git log <fixed-point>..HEAD --oneline`.

Before going further, confirm the fixed point resolves (`git rev-parse <fixed-point>`) and the diff is non-empty. A bad ref or empty diff should fail here — not inside two parallel sub-agents.

### 2. Identify the spec source

Look for the originating spec, in this order:

1. Issue references in the commit messages (`#123`, `Closes #45`, GitLab `!67`, etc.) — fetch via the workflow in `docs/agents/issue-tracker.md`.
2. A path the user passed as an argument.
3. A PRD/spec file under `docs/`, `specs/`, or `.scratch/` matching the branch name or feature.
4. If nothing is found, ask the user where the spec is. If they say there isn't one, the **Spec** sub-agent will skip and report "no spec available".

### 3. Identify the standards sources

Anything in the repo that documents how code should be written, such as `CODING_STANDARDS.md` or `CONTRIBUTING.md`.

### 4. Decide single vs parallel, then spawn

First size the diff. Run `git diff <fixed-point>...HEAD --stat` and count touched files and changed lines. Decide:

- **Single sub-agent** when the diff is small: roughly ≤ 5 files **and** ≤ 300 changed lines, **or** no spec was found (Spec axis would skip anyway). One `general-purpose` sub-agent carries both axes.
- **Two parallel sub-agents** when the diff is large: more files or lines than the single threshold, **and** a spec exists. Send a single message with two `Agent` tool calls so they run in parallel.

The two-axis **output** separation matters, not the agent count. A single sub-agent still reports under separate `## Standards` and `## Spec` headings and must not merge them.

#### Shared prompt inputs

- The full diff command and commit list.
- The list of standards-source files from step 3.
- The path or fetched contents of the spec (if found).

#### Standards brief

"Report — per file/hunk where relevant — every place the diff violates a documented standard. Cite the standard (file + the rule). Distinguish hard violations from judgement calls. Skip anything tooling enforces. Under 400 words."

#### Spec brief

"Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong. Quote the spec line for each finding. Under 400 words."

#### Single sub-agent mode

Send one `Agent` call with both briefs. Instruct it to produce two clearly separated sections — `## Standards` and `## Spec` — and to keep them independent (no cross-axis merging or reranking). If no spec exists, it runs only the Standards brief and notes "no spec available" under `## Spec`.

#### Parallel sub-agent mode

Send a single message with two `Agent` tool calls. Standards sub-agent gets the diff, commit list, standards sources, and the Standards brief. Spec sub-agent gets the diff, commit list, spec contents, and the Spec brief. If the spec is missing, skip the Spec sub-agent and note this in the final report.

### 5. Aggregate

Present the two reports under `## Standards` and `## Spec` headings, verbatim or lightly cleaned. Do **not** merge or rerank findings — the two axes are deliberately separate (see _Why two axes_).

End with a one-line summary: total findings per axis, and the worst issue _within each axis_ (if any). Don't pick a single winner across axes — that's the reranking the separation exists to prevent.

## Why two axes

A change can pass one axis and fail the other:

- Code that follows every standard but implements the wrong thing → **Standards pass, Spec fail.**
- Code that does exactly what the issue asked but breaks the project's conventions → **Spec pass, Standards fail.**

Reporting them separately stops one axis from masking the other.