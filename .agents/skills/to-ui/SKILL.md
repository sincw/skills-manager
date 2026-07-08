---
name: to-ui
description: |
  Insert a UI design exploration phase between PRD and implementation. Generate multiple
  HTML mockup variants, compare side-by-side, collect human feedback, iterate, converge
  on a winner, and produce a ui-spec handoff that guides implementation. Prevents the
  "functional but ugly" trap of PRD→implement workflows. Use whenever the feature has
  significant frontend UI and the visual direction is not yet locked.
---

# UI Design Exploration

## Problem It Solves

PRD → implement skips the design decision phase. You end up with functional but ugly UI
because every design choice is made in isolation during coding, without comparing
alternatives or getting human visual judgment early.

## When to Use

- Feature has pages, forms, dashboards, dialogs, workflows — any user-visible UI
- Visual direction is not yet locked
- PRD is done and checked, but you haven't started coding

Skip when:
- Pure backend, pure data migration, pure script
- PRD explicitly states "reuse existing UI patterns, no visual changes"

## Core Insight: Show, Don't Describe

Humans cannot reliably judge UI from text descriptions. "A clean dashboard with cards
and a sidebar" could mean 20 different things. But put 4-6 concrete HTML mockups
side-by-side, and a human can instantly say "C feels right, but with B's header."

This is the t-tools `/t-ui-design` methodology extracted into a standalone skill.

## Workflow

### Phase 1: Read Upstream

Before generating anything, read:
- PRD / requirements doc
- User stories
- Existing design system or component library — **mandatory read, not optional**
- Existing frontend patterns in the codebase

Extract: target users, core tasks, key pages, states (loading/empty/error/edge), roles/permissions.

Variants must map to components the project can actually build. Don't invent controls
that can't be realized in the existing component library — an unbuildable winner is a
second design phase you didn't budget for.

If the upstream documents don't give enough to define UI scope, stop and ask for
clarification. Don't generate mockups from vague requirements.

### Phase 2: Generate Variants (4-6)

Generate 4-6 single-file HTML mockups, each a genuinely different design direction.
Not color tweaks — different layout, density, information hierarchy, interaction model.

Example directions:
- **High-density table-first** — for operations-heavy workflows
- **Card-flow overview** — browse-first, drill-down later
- **Wizard-step** — guided multi-step form
- **Master-detail split** — list on left, detail on right
- **Dashboard summary** — KPIs first, details behind clicks
- **Mobile-first task flow** — single column, bottom actions

Each variant must:
- Be a single HTML file with inline CSS and minimal inline JS
- Have zero external dependencies (no CDN, no npm, no framework, no images, no fonts)
- Use mock data labeled as such (`data-mock="true"`)
- Cover: core page area, primary action, key states, main feedback
- Be labeled with design direction name and tradeoffs

**Why single-file HTML?** It's the closest thing to real React components without
actually writing production code. Winner maps almost 1:1 to component structure.
No image generation API, no Figma, no external tools needed.

### Phase 3: Build Comparison Board

Create a `board.html` that:
- Shows all variants side-by-side or in a toggle-able grid
- Lists each variant's direction, use case, and key tradeoffs
- Has a feedback/selection area for the human to record preferences
- Is itself a self-contained HTML file

### Phase 4: Collect Feedback

Present the board to the human and collect structured feedback:
- Which variant(s) feel closest to the right direction?
- What specific elements to keep from each?
- What to remove?
- Density preference? Color/typography direction? Information hierarchy?

Write feedback to `feedback.md`. This creates cross-round memory so each iteration
builds on previous preferences rather than starting fresh.

### Phase 5: Iterate

Based on feedback, generate the next round:
- Keep the preferred direction(s), merge elements from multiple variants
- Drop clearly wrong directions (archive them)
- Don't just tweak colors — each round should narrow the direction
- Update the board to show how previous feedback was incorporated

Repeat until the human locks in a winner. Usually 1-3 rounds.

### Phase 6: Converge on Winner

Once winner confirmed:
1. Write `winner.html` — the final merged mockup (may combine elements from multiple variants)
2. Write `ui-spec.md` — the handoff contract:
   - Selected direction and rationale
   - Page/route/component inventory
   - Key interactions and states (loading, empty, error, submitting, permission-denied)
   - Component mapping (which existing design system components to use)
   - Assumptions and open items for implementation
3. Archive all non-winner variants (move them out of active directory, label as deprecated)
4. Rewrite `board.html` so it no longer sits in the pre-decision "unselected" state:
   mark the winner, mark history as archived, and link `winner.html` + `ui-spec.md` +
   `feedback.md` as the only downstream inputs. A board left in "pending" state after
   convergence will mislead downstream agents into treating dead variants as live.

### Phase 7: Handoff to Implementation

Implementation phase should:
- Read `ui-spec.md` as the UI truth source
- Optionally reference `winner.html` for visual confirmation
- Never read archived variants or treat them as design input
- Map `ui-spec.md` component inventory to actual code components

## Output Structure

```
.scratch/<feature>/ui/
├── board.html          # Side-by-side comparison board
├── variants/           # Active candidate HTML mockups
│   ├── 01-high-density-table.html
│   ├── 02-card-flow-overview.html
│   ├── 03-wizard-step.html
│   └── 04-master-detail.html
├── archive/            # Deprecated variants (moved here after convergence)
│   └── round-1/
├── winner.html         # Final selected/merged mockup
├── ui-spec.md          # Handoff spec for implementation
└── feedback.md         # Cross-round feedback history
```

## Technical Constraints

- **Single-file HTML only**: one `.html` file per variant, everything inline
- **No external dependencies**: no CDN, no npm packages, no frameworks, no image URLs,
  no external fonts, no external scripts. Icons = inline SVG or text symbols.
- **No image generation APIs**: no DALL-E, no Midjourney, no Figma plugins
- **Mock data must be labeled**: annotate with `data-mock`, `data-ui-assumption`,
  `data-ui-source` attributes
- **No engineering spec in mockups**: no API paths, DTO schemas, database fields, or
  implementation tasks in the HTML. Variants are UI direction, not engineering spec —
  that lives in the PRD / technical design.
- **Responsive preview**: every variant must be viewable at both desktop and mobile
  widths without overflow, overlap, or unreadable text. A desktop-only mockup hides
  mobile ugliness until implementation, when it's expensive to fix.
- **Real differences required**: if two variants only differ in border-radius and
  background color, that's one variant, not two
- **Not production code**: these are exploration mockups. Real React/components come
  later in implementation. Don't try to make them production-ready.

## ui-spec.md Contract

This is the single text-based handoff to implementation. Must contain:

```markdown
# UI Spec: <feature>

## Selected Direction
Which design direction was chosen and why.

## Page/Route Inventory
| Route | Page | Description |
|-------|------|-------------|
| /users | UserList | ... |
| /users/:id | UserDetail | ... |

## Component Map
| UI Element | Design System Component | Notes |
|------------|------------------------|-------|
| Data table | @radix-ui/react-table | With toolbar slot |
| Modal | Dialog from ui package | ... |

## Key States
- **Loading**: skeleton cards, 3-placeholder rows
- **Empty**: illustration + "Create your first X" CTA
- **Error**: toast + inline error on affected section
- **Submitting**: button loading + disable form
- **Permission denied**: redirect or inline "no access" card

## Interactions
- Click row → navigate to detail
- Bulk select → toolbar appears
- Search → debounced filter, URL param sync

## Assumptions & Open Items
- Assume pagination is server-side (confirm with backend)
- Color scheme TBD: wait for brand guidelines
- Mobile: stack cards vertically, hide table columns beyond 3
```

Do NOT include: API paths, DTO schemas, database fields, production React code,
or business rules that contradict the PRD.

## Integration Points

Where this fits in your workflow:

```
PRD → [PRD Check] → **UI Design Exploration** → Implementation
                         ↑ you are here
```

If you already have a `t-design` (technical design) phase:
```
PRD Check → UI Design Exploration → Technical Design → Implementation
                                      ↑ ui-spec.md feeds into frontend chapter
```

## Guardrails

- **Don't skip upstream**: if PRD is vague, pause and clarify. Mockups from bad
  requirements are worse than no mockups.
- **Don't design during implementation**: once `ui-spec.md` is locked, implementation
  follows it. New visual ideas go back to the exploration phase.
- **Archive, don't delete**: keep deprecated variants in `archive/` for traceability.
  Label them clearly as deprecated so no one accidentally implements them.
- **Feed the feedback loop**: `feedback.md` is the memory. Write to it every round.
  Without it, each iteration starts from zero.
- **Don't mutate product semantics**: if human feedback changes business rules (new
  workflow, new permission, new state the PRD didn't have), stop and route back to the
  PRD / upstream. UI exploration must not silently rewrite the product contract —
  `ui-spec.md` may not introduce rules that conflict with the PRD.
- **Winner cleanup is required**: after confirming winner, move all non-winner HTML
  out of `variants/`. An empty `variants/` directory is a signal that convergence
  happened. Stale variants left behind will confuse downstream agents.

## Combining with frontend-design Skill

This skill defines the **process** (explore, compare, converge, handoff).
The `frontend-design` skill defines the **aesthetic execution** (typography, palette,
layout, signature element).

When generating individual variants, apply `frontend-design` principles to make each
variant visually distinctive and intentional. The two skills are complementary:
- `to-ui`: what to generate, how to compare, how to converge
- `frontend-design`: how to make each variant look good and distinctive

## Anti-Patterns

| Don't | Do |
|-------|-----|
| Generate one design and call it done | Generate 4-6 genuinely different directions |
| Describe designs in text and ask "which sounds better?" | Show concrete HTML mockups side-by-side |
| Keep all variants around after winner chosen | Archive deprecated variants, clean active directory |
| Put API endpoints in ui-spec | Keep ui-spec strictly about UI structure and states |
| Skip feedback file, rely on chat memory | Write `feedback.md` every round for cross-session memory |
| Make variants that differ only in color | Each variant must have different layout/hierarchy/density |
| Start from scratch each round | Read `feedback.md` and build on previous preferences |
