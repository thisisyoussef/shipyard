# Shipyard Workspace - Single Source of Truth

**Last Updated**: 2026-03-29
**Current Phase**: Day 1 foundation
**Active Focus**: keep the helper harness generic while growing the nested Shipyard CLI, richer runtime artifacts, the now-hardened continuation-aware operator workflow, and the evidence-backed Ship rebuild submission pack
**Project Status**: Active
**Canonical App Directory**: `shipyard/`
**Canonical Harness Directory**: `.ai/`

---

## Current Focus

### Active Task

- **Title**: Publish the Ship rebuild submission pack and align the durable docs with the current long-run runtime architecture
- **Status**: Implemented and pending merge
- **Owner**: Codex

### Next Immediate Actions

1. Keep the harness aligned with the actual repo shape: `.ai/` beside `shipyard/`.
2. Continue building the persistent CLI loop, typed tools, and tracing inside `shipyard/`.
3. Treat `shipyard/docs/submissions/ship-rebuild/**` plus the appendix in `shipyard/CODEAGENT.md` as the canonical Ship rebuild deliverable set until a newer submission supersedes it.
4. Build future runtime work on the shipped follow-up baseline: history-safe tool turns, write-aware compaction, bootstrap-ready discovery, concise handoffs, continuation-first loop thresholds, task-aware loop budgets, mission control, and release archiving are now the expected default.
5. Use the drafted Phase 10 architecture pack to sequence the next larger runtime upgrades: durable threads, policy controls, layered memory, repo indexing, explicit routing/evals, background tasks, and readiness surfaces.

---

## Repo Baseline

- **Canonical repo handbook**: `AGENTS.md`
- **Canonical orchestrator**: `.ai/codex.md`
- **Claude compatibility mirror**: `.ai/agents/claude.md`
- **Root app package**: `shipyard/package.json`
- **App runtime state**: `shipyard/.shipyard/`
- **Branch rule**: start non-trivial work on a fresh `codex/` branch, carry over required local `.env*` files into new branches/worktrees, and run `pnpm --dir shipyard install` before project commands so missing local `node_modules` is treated as setup, not as a graph/runtime regression
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
- **CODEAGENT baseline**: `shipyard/CODEAGENT.md` is now a durable
  implementation-handbook for the live runtime. Keep it aligned with the
  shared turn engine, target-manager flow, continuation/handoff model,
  provider routing, and the current browser workbench instead of treating it as
  a one-off submission appendix.
- **Submission baseline**: the Ship rebuild write-up now lives under
  `shipyard/docs/submissions/ship-rebuild/` and is linked from
  `.claude/CLAUDE.md`, `shipyard/docs/README.md`, and the appendix section of
  `shipyard/CODEAGENT.md`. Update those entry points together when the
  submission pack changes.
- **Execution fingerprint baseline**: standard instruction turns now emit a
  shared per-turn execution fingerprint in CLI output, browser completion
  state, local JSONL traces, and LangSmith metadata so local vs hosted/runtime
  routing differences are visible without code spelunking.
- **Model-route baseline**: the shipped default provider is now Anthropic with
  `claude-opus-4-6`; operator docs, local examples, and the Railway production
  workflow must keep that default and its secret sync in lockstep.
- **Deploy-link baseline**: `deploy_target` should not trust raw Vercel CLI
  `stdout` as the public app link. Resolve a shareable alias/domain from
  labeled CLI output or Vercel deployment metadata first, because generated
  deployment URLs can be login-gated by Vercel Authentication.

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
