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
   - **Yes** → **`/to-prd`** (turn the thread into a PRD) → **`/to-issues`** (split the PRD into independently-grabbable issues). Then choose an issue execution mode: manual fresh sessions, or the AFK loop when the queue is ready for unattended work (see Issue execution modes).
   - **No** → **`/implement`** right here, in the same context window.

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

- **`/improve-codebase-architecture`** — run whenever you have a spare moment to keep the codebase good for agents to operate in. It surfaces deepening opportunities; picking one _generates an idea_ you can take into the main flow at `/grilling`.

## Crossing sessions

- **`/handoff`** — when a thread is full or you need to branch off (e.g. into a `/prototype` session), this compacts the conversation into a markdown file. You don't continue in place — you **open a new session and reference that file** to carry the context across. It's the bridge between context windows, in either direction. Use it when you want a **fresh session** but need the **current conversation preserved**.
- **`/compact`** (built-in) — stay in the **same conversation**, letting the earlier turns be summarized. Use it at **intentional breaks between phases**, when you don't mind losing the verbatim history. Don't compact mid-phase — the agent can lose its way. `/handoff` forks; `/compact` continues.

## Standalone

Off the main flow entirely.

- **`/grilling`** — use it standalone to sharpen any plan or design that does not live in a repo. In this branch it saves nothing locally and builds no `CONTEXT.md`.
- **`/writing-great-skills`** — reference for writing and editing skills well.

## Precondition

**`/setup-matt-pocock-skills`** — run before your first engineering flow to configure the issue tracker, triage labels, and doc layout the other skills assume. Custom issue trackers also work.
