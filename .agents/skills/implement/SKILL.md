---
name: implement
description: "Implement a piece of work based on a PRD or set of issues."
disable-model-invocation: true
---

Implement the work described by the user in the PRD or issues.

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, use /review to review the work.

Commit your work to the current branch.

Before committing, inspect `git status --short`, `git diff`, and `git diff --cached`.
Stage only the files changed for this task.

Use one focused commit unless the user asks for multiple commits.

Commit messages must clearly describe the change. Use this format:

```text
<type>: <short imperative summary>

Why:
- Explain the problem, request, or issue this change addresses.

Changes:
- Summarize the important code or behavior changes.
- Mention notable files, modules, or user-facing effects when useful.
```

Use one of these types unless the repo already has a stronger convention:
`feat`, `fix`, `refactor`, `test`, `docs`, `chore`.

The summary line should be specific, under 72 characters, and written in imperative style.
Avoid vague messages like `update files`, `fix bug`, or `implement changes`.
