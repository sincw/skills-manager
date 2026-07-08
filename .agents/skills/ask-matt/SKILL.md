---
name: ask-matt
description: Ask which skill or flow fits your situation. A router over the user-invoked skills in this repo.
disable-model-invocation: true
---

# Ask Matt

You don't remember every skill, so ask.

A **flow** is a path through the skills. Most paths run along one **main flow**, and starting situations can merge onto it. Everything else is standalone.

## The main flow: idea → ship

The route most work travels. You have an idea and want it built.

1. **`/grilling`** — sharpen the idea by interview. If the idea is tied to the current codebase, it keeps `CONTEXT.md` and ADRs current through `/domain-modeling`; otherwise it runs statelessly.
2. **Branch — can you settle every question in conversation?** If a question needs a runnable answer (state, business logic, a UI you have to see), detour through a prototype, bridged by **`/handoff`** in both directions (see Crossing sessions):
   - **`/handoff`** out, then open a fresh session against that file,
   - **`/prototype`** to answer the question with throwaway code,
   - **`/handoff`** back what you learned, and reference it from the original idea thread.
3. **Branch — is this a multi-session build?**
   - **Yes** → **`/to-prd`** (turn the thread into a PRD) → **`/read-across`** (cross-check the PRD — see PRD cross-check below) → **`/to-issues`** (split the PRD into AFK-max packages — independently-grabbable issues, one per AFK loop iteration). Then choose an issue execution mode (see below).
   - **No** → **`/implement`** right here, in the same context window.

### PRD cross-check — after `/to-prd`, before `/to-issues`

Run **`/read-across`** on the PRD right after it's drafted. Two independent reviewer sub-agents (Kimi K2.7 + GLM-5.2) audit it on consistency, completeness, feasibility, risk, and stakeholder coverage, then the parent agent arbitrates. Escalate any blocker before splitting issues — a PRD with an unresolved blocker produces issues that inherit the defect. Findings land in `.scratch/reviews/` and blocker/warning items can be converted into issues or triage labels. Skip only for trivial PRDs the user explicitly waives.

### Frontend design phase — don't skip when UI is visible

Between `/read-across` and `/implement` (or `/to-issues`), if the feature has **significant user-visible UI** and the visual direction is not yet locked, run **`/to-ui`** first. This is the node that prevents the "functional but ugly" trap: when every design choice is made in isolation during coding, with no alternatives compared and no human visual judgment early, the UI comes out ugly.

- Generate 4–6 single-file HTML mockup variants with genuinely different directions (layout, density, information hierarchy, interaction model — not color/spacing tweaks). Apply the **`/frontend-design`** skill per variant for intentional, non-templated aesthetics.
- Side-by-side `board.html`, collect human feedback into `feedback.md`, iterate 1–3 rounds.
- Converge on `winner.html` + `ui-spec.md`; archive discarded variants (label `DEPRECATED`).
- `/implement` then treats `ui-spec.md` as the **UI truth source** and maps its component inventory to real components. It must not read archived variants — those are not design input.

Skip `/to-ui` when: pure backend, pure data/script/migration, or the PRD explicitly says "reuse existing UI, no visual change".

### Context hygiene

Keep steps 1–3 in **one unbroken context window** — don't compact or clear until after `/to-issues` — so the grilling, PRD, and issues all build on the same thinking. Each `/implement` then starts fresh, working from the issue.

The limit on this is the **[smart zone](https://www.aihero.dev/ai-coding-dictionary/smart-zone)**: the window (~120k tokens on state-of-the-art models) within which the model still reasons sharply. If a session approaches it before `/to-issues`, don't push on degraded — `/handoff` and continue in a fresh thread.

### Issue execution modes

After `/to-issues`, execute the issue queue in one of two ways:

- **Manual sessions** — clear context between independent issues. Start a fresh session per issue and kick off **`/implement`** by passing it the PRD and the single issue to work on.
- **AFK batch loop** — for a queue of independent local issues that are already `ready-for-agent`, run **`loop/afk.sh <iterations> .scratch/<feature>/issues [loop/prompt.md]`** from a clean git worktree. The loop feeds the issue files and recent commits to `codex exec`, lets each iteration pick exactly one AFK-ready issue, expects one commit per iteration, and stops when no more tasks remain or an iteration produces no commit.

Use the AFK loop as an execution mechanism for prepared issue queues, not as a replacement for `/grilling`, `/to-prd`, or `/to-issues`. Do not use it for `needs-info`, `ready-for-human`, HITL-only, coupled, or ambiguous tasks.

## On-ramps

A starting situation that generates work, then merges onto the main flow.

- **Bugs and requests piling up** → use **`/diagnosing-bugs`** when something is broken or slow; use the main flow when the request is understood enough to turn into planned work.

## Codebase health

Not feature work — upkeep.

- **`/improve-codebase-architecture`** — run whenever you have a spare moment to keep the codebase good for agents to operate in. It surfaces deepening opportunities; picking one runs `/grilling` inline, after which the resulting idea enters the main flow.

## Codebase navigation

Not feature work — durable orientation.

- **`/codebase-map`** — run manually when you want to bootstrap or refresh `docs/agents/codebase-map/codebase-map.md`, the stable navigation map for future codebase-bound sessions. It reviews source drift and updates the map only when durable navigation facts changed.

## Crossing sessions

- **`/handoff`** — when a thread is full or you need to branch off (e.g. into a `/prototype` session), this compacts the conversation into a markdown file. You don't continue in place — you **open a new session and reference that file** to carry the context across. It's the bridge between context windows, in either direction. Use it when you want a **fresh session** but need the **current conversation preserved**.
- **`/compact`** (built-in) — stay in the **same conversation**, letting the earlier turns be summarized. Use it at **intentional breaks between phases**, when you don't mind losing the verbatim history. Don't compact mid-phase — the agent can lose its way. `/handoff` forks; `/compact` continues.

## Standalone

Off the main flow entirely.

- **`/grilling`** — use it standalone to sharpen any plan or design that does not live in a repo. In this branch it saves nothing locally and builds no `CONTEXT.md`.
- **`/read-across`** — use it standalone to cross-review any artifact (PRD, code, architecture, config, document) with two independent reviewer models.
- **`/writing-great-skills`** — reference for writing and editing skills well.

