# ISSUES

Local issue files from the configured `.scratch/<feature>/issues/` directory are provided at the start of context, with their file paths.

Work only on AFK-ready issues. In this repo, that means issues whose status is `ready-for-agent` or whose body clearly says they are AFK tasks. Do not work on `needs-info`, `ready-for-human`, `wontfix`, `done`, or HITL-only tasks.

You have also been passed the last few commits. Review them to understand what work has already been completed.

If all AFK tasks are complete, output exactly:

```xml
<promise>NO MORE TASKS</promise>
```

# TASK SELECTION

Pick exactly one next task. Prioritize tasks in this order:

1. Critical bugfixes
2. Development infrastructure
3. AFK-max packages for new features
4. Polish and quick wins
5. Refactors

Development infrastructure like tests, types, and dev scripts is an important precursor to building features.

An AFK-max package is one issue file and one commit: the largest coherent unit that can be completed safely in one loop. It may absorb multiple related tracer bullets when they share the same user path, code area, feedback loop, and rollback boundary.

# EXPLORATION

Explore the repo before editing. Read `AGENTS.md`, `docs/agents/*`, relevant PRDs/issues under `.scratch/`, and `CONTEXT.md`/ADRs if they exist.

# IMPLEMENTATION

Use `$implement` for the selected issue. Use `$tdd` where possible, at the public seams described by the issue or PRD.

Only work on one task. Do not opportunistically complete adjacent issues.
One task means one AFK-ready issue package, not one tracer bullet inside it.

# FEEDBACK LOOPS

Before committing, run the relevant feedback loops for this repo. Start with any `Suggested verification` listed in the issue. Prefer the project's own scripts if present, such as:

- tests
- typecheck
- lint
- build

If a feedback loop is unavailable, do not invent one. Note what you could and could not run in the final message and, if relevant, in the issue note.

# COMMIT

Make exactly one git commit for the selected task.

The commit message must include:

1. The issue title or issue file path
2. Key decisions made
3. Files changed
4. Blockers or notes for the next iteration, if any

Stage only files relevant to the selected task.

# THE ISSUE

If the task is complete, add a short completion note to the issue file and move it to `issues/done/`.

If the task is not complete, leave the issue in place and append a note with:

- what was done
- what remains
- the blocker or next step

Commit the issue update together with the work.

# FINAL RULES

ONLY WORK ON A SINGLE TASK.
