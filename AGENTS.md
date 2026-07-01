## Core Rule
working language is Chinese

## Agent skills

### Issue tracker

Issues and PRDs are tracked as local markdown under `.scratch/`; external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the default canonical triage label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: root `CONTEXT.md` plus `docs/adr/`. See `docs/agents/domain.md`.

### Codebase map

Before `/implement`, `/diagnosing-bugs`, `/improve-codebase-architecture`, or a `/prototype` that must sit near existing modules, pages, routes, or runtime conventions, read `docs/agents/codebase-map/codebase-map.md` if it exists. In the AFK loop, read it after picking the issue and before exploring code. Treat the map as navigation guidance only; if it conflicts with actual code, trust the code and mention the map drift. Do not update it unless the user explicitly invokes `/codebase-map`.

### Code scanning

Use `fast_context_search` only when the relevant code location is unknown or a broad source scan is needed. Do not call it just to satisfy process. When exact files or entry points are known, or when verifying implementation details, read files directly. If broad discovery is needed and `fast_context_search` is unavailable, fails, or lacks repository access, state the fallback reason and use tool search such as `rg` / `rg --files` plus targeted reads.
