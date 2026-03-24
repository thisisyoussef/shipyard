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

## Compatibility Notes

- Product code lives under `shipyard/`.
- Treat `.ai/` as repo-local helper scaffolding for Shipyard work.
- If repo-owned helper scripts exist for handoff, locking, or guards, prefer them. If they do not exist, follow the same workflow steps manually rather than inventing a source-project-specific script dependency.
