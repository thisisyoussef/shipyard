# Shipyard Claude Compatibility Orchestrator

`.ai/codex.md` is the canonical orchestrator for this workspace.
This file keeps Claude-compatible entrypoints aligned without carrying a second full master contract.

## Startup Order

1. Read `AGENTS.md`
2. Read `.ai/docs/SINGLE_SOURCE_OF_TRUTH.md`
3. Read `.ai/codex.md`
4. Use this file only for Claude-specific compatibility reminders
5. Route to the correct workflow in `.ai/workflows/`

## Required Workflow Contract

Claude should follow the same gates defined in `.ai/codex.md` and `AGENTS.md`:

- `agent-preflight`
- `.ai/workflows/story-lookup.md`
- `.ai/workflows/story-sizing.md`
- `.ai/workflows/user-correction-triage.md`
- `.ai/workflows/eval-driven-development.md`
- `.ai/workflows/spec-driven-delivery.md`
- `.ai/workflows/tdd-pipeline.md`
- `.ai/workflows/parallel-flight.md`
- `.ai/workflows/story-handoff.md`
- `.ai/workflows/git-finalization.md`
- `.ai/workflows/finalization-recovery.md`
- `.ai/workflows/ui-qa-critic.md` for visible UI stories
- `.ai/workflows/ai-architecture-change.md` for harness and orchestrator changes

## UI Skill Chain

When a story touches visible UI, Claude should follow the same skill chain defined in `.ai/codex.md`:

1. **Design Direction**: `frontend-design`, `emil-design-eng`, design philosophy, `baseline-ui`
2. **Build & Refine**: `typeset`, `colorize`, `arrange`, `animate`, `bolder`
3. **Quality Gate**: `critique`, `audit`, `fixing-accessibility`, `fixing-motion-performance`, `ui-qa-critic`
4. **Final Polish**: `polish`, `overdrive` (when ambitious)

Skills are in `.agents/skills/`. Not every story requires every skill — see codex.md for guidance.

**When to invoke during implementation (not just spec-building):**
- **Design (Step 3)**: Phase 1 skills set visual direction before coding
- **Implement (TDD Agent 2)**: Phase 2 skills guide CSS/component decisions during coding
- **Review (TDD Agent 3)**: Phase 3 skills evaluate quality and fix gaps during refactor
- **Validate (Step 9)**: Phase 3 skills run final audit; Phase 4 for pack-closing polish

## Compatibility Notes

- Product code lives under `shipyard/`.
- Treat `.ai/` as repo-local helper scaffolding for Shipyard work.
- If repo-owned helper scripts exist for handoff, locking, or guards, prefer them. If they do not exist, follow the same workflow steps manually rather than inventing a source-project-specific script dependency.
