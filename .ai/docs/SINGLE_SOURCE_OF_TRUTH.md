# Shipyard Workspace - Single Source of Truth

**Last Updated**: 2026-03-26
**Current Phase**: Day 1 foundation
**Active Focus**: keep the helper harness generic while growing the nested Shipyard CLI, richer runtime artifacts, and the now-hardened continuation-aware operator workflow
**Project Status**: Active
**Canonical App Directory**: `shipyard/`
**Canonical Harness Directory**: `.ai/`

---

## Current Focus

### Active Task

- **Title**: Use the shipped runtime-hardening follow-up pack as the baseline for the next runtime stories
- **Status**: Implemented and validated
- **Owner**: Codex

### Next Immediate Actions

1. Keep the harness aligned with the actual repo shape: `.ai/` beside `shipyard/`.
2. Continue building the persistent CLI loop, typed tools, and tracing inside `shipyard/`.
3. Advance the drafted Phase 7 and Phase 8 packs incrementally on the shipped planner, handoff, and spec-loading foundations while keeping tests, docs, and runtime artifacts in sync.
4. Build future runtime work on the shipped follow-up baseline: history-safe tool turns, write-aware compaction, bootstrap-ready discovery, concise handoffs, continuation-first loop thresholds, and task-aware loop budgets are now the expected default.
5. Use the drafted Phase 10 architecture pack to sequence the next larger runtime upgrades: durable threads, policy controls, layered memory, repo indexing, explicit routing/evals, background tasks, and readiness surfaces.

---

## Repo Baseline

- **Canonical repo handbook**: `AGENTS.md`
- **Canonical orchestrator**: `.ai/codex.md`
- **Claude compatibility mirror**: `.ai/agents/claude.md`
- **Root app package**: `shipyard/package.json`
- **App runtime state**: `shipyard/.shipyard/`
- **Branch rule**: start non-trivial work on a fresh `codex/` branch
- **Default validation commands**:
  - `pnpm --dir shipyard test`
  - `pnpm --dir shipyard typecheck`
  - `pnpm --dir shipyard build`
  - `git diff --check`
- **Finalization docs sweep**: before merging, update relevant docs/architecture diagrams (or explicitly record `N/A`)
- **Relevant traced-story finish gate**: use the LangSmith CLI to review recent traces, runs, and insights before merge, and fix unexpected behavior first
- **Helper-script status**: some imported workflow docs describe optional repo-owned helpers under `scripts/`; unless those helpers exist in this repo, follow the manual workflow equivalent instead of assuming the commands are wired today.
- **UI bridge flag**: `SHIPYARD_ENABLE_CLAUDE_UI_PHASE_BRIDGES=1` makes `scripts/run-ui-phase-bridge.mjs` use Claude first for UI implementation, QA, critic, and final polish while preserving a Codex-first fallback when the flag is off.
- **Greenfield bootstrap baseline**: shared scaffold presets now back both target creation and empty-target bootstrap in code phase; do not add a second scaffolding path when extending greenfield setup.
- **Docs baseline**: runtime-facing README and architecture pages under `shipyard/` now describe target-manager routing, plan/task queues, planner-backed graph execution, browser evaluation, and the current split-pane browser workbench. Keep those docs aligned when those surfaces change.

---

## Story Execution Guardrails

- `.ai/` is a helper harness for this workspace only. Do not let it drift into imported product-specific memory or unrelated backlog history.
- `shipyard/` is the only product-code surface in this repo.
- Keep durable repo truths in `.ai/memory/project/`.
- Keep current-work notes in `.ai/memory/session/`.
- Use the workflow files to size work, route features, and record handoff state instead of improvising a different process per task.
- Treat deployment as explicit. If a story does not define a deploy surface, say so instead of implying one.

---

## Read Order

1. `AGENTS.md`
2. `.ai/docs/SINGLE_SOURCE_OF_TRUTH.md`
3. `.ai/codex.md`
4. `shipyard/README.md`
5. `shipyard/CODEAGENT.md`
6. `shipyard/PRESEARCH.md`
7. `.claude/CLAUDE.md`
