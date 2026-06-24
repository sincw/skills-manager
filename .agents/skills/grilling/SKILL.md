---
name: grilling
description: Grill a plan or design through a one-question-at-a-time interview. Use when the user wants to stress-test a plan before building, uses any 'grill' trigger phrase, or another skill needs design interrogation.
---

# Grilling

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one by one. For each question, provide your recommended answer.

Ask the questions one at a time, waiting for feedback on each question before continuing. Asking multiple questions at once is bewildering.

If a question can be answered by exploring the codebase, explore the codebase instead.

## Context branch

Before the first question, decide whether the plan is tied to the current codebase.

- **Codebase-bound**: read relevant code, `CONTEXT.md`, and ADRs before asking questions that local context can answer. As stable terms or durable decisions crystallize, run the `/domain-modeling` skill inline so the project glossary and ADRs stay current.
- **Standalone**: run statelessly. Do not create or update project docs for a plan that does not live in this repo.

When using `/domain-modeling`, follow its bar for writes:

- update `CONTEXT.md` only when a domain term is resolved or sharpened
- keep implementation details out of `CONTEXT.md`
- offer an ADR only for decisions that are hard to reverse, surprising without context, and the result of a real trade-off

## Domain documentation checkpoint

Before ending a codebase-bound grill, review the shared understanding reached in the interview.

- If any domain terms were resolved or sharpened, run `/domain-modeling` inline to create or update `CONTEXT.md`.
- If any decisions meet the ADR bar above, run `/domain-modeling` inline to create the needed ADRs under `docs/adr/`.
- If neither threshold was met, say that no domain docs were created because there were no resolved terms or ADR-level decisions yet.

Do not create empty `CONTEXT.md` or `docs/adr/` just because a repository exists.
