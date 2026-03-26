# Decisions Today

- 2026-03-24: Moved the runnable application into `shipyard/` so the repo root can host a parallel `.ai/` helper harness.
- 2026-03-24: Imported the harness baseline from the source repo's fuller worktree snapshot instead of its sparse root `.ai/`, because the root copy only contained state files.
- 2026-03-24: Reset imported project memory so the harness starts as Shipyard-specific scaffolding rather than reused product history.
- 2026-03-24: Standardized root-level validation to `pnpm --dir shipyard test`, `pnpm --dir shipyard typecheck`, and `pnpm --dir shipyard build`.
- 2026-03-24: Added a dedicated `.ai/workflows/bug-fixes.md` path for isolated surgical bug batches, tracked through `.ai/memory/session/bug-fix-batch.md`.
- 2026-03-24: Aligned the browser runtime with operator expectations by emitting final text for failed turns and backing the advertised UI trace path with real per-session trace logging.
- 2026-03-24: Disabled Vitest file-level parallelism by default because the CLI and local-runtime integration suites are deterministic in-band but flaky when the repo test gate runs files concurrently.
- 2026-03-24: Made the design-phase default Claude-first via `scripts/generate-design-brief.mjs`, with Codex fallback only when Claude is unavailable or errors.
- 2026-03-24: Added Refero-aware UI brainstorming so the Claude design bridge researches real-product references before drafting design briefs when Refero is configured.
- 2026-03-25: Added the Phase 7 `ExecutionSpec` planner contract as a read-only helper agent, with lightweight fallback specs for exact-path, greenfield, and target-manager turns so planner overhead stays opt-in.
- 2026-03-25: Landed `P8-S01` with a dedicated read-only `load_spec` tool instead of overloading `read_file`, so later Phase 8 planning stories can reference stable `spec:` identifiers.
- 2026-03-25: Kept `load_spec` target-relative for its first landing because the repo has no existing configurable contract for workspace-outside-target spec roots.
- 2026-03-25: Landed `P7-S04` by persisting typed `ExecutionHandoff` artifacts under `.shipyard/artifacts/<sessionId>/`, recording only `activeHandoffPath` in session state, and injecting `latestHandoff` back into the context envelope on resumed turns.
- 2026-03-25: Kept the first handoff payload anchored to the shipped `TaskPlan` plus latest verification outcome so long-run reset routing can ship on `main` without depending on the stale `P7-S01` planner branch.
- 2026-03-25: Expanded the design bridge context so Claude reads `.ai/agents/claude.md` and `.claude/CLAUDE.md` and follows the same imperative design skill chain Codex uses.
- 2026-03-25: Added `scripts/run-ui-phase-bridge.mjs` plus the `SHIPYARD_ENABLE_CLAUDE_UI_PHASE_BRIDGES` flag so UI implementation, QA, critic, and final polish can use Claude first without changing the phase skill contracts.
- 2026-03-25: Added a shared `ts-pnpm-workspace` scaffold preset plus `bootstrap_target`, so both target creation and already-selected empty targets reuse the same greenfield generator instead of repeated `write_file` boilerplate.
- 2026-03-25: Corrected the hosted Railway contract so the nested `shipyard/`
  app deploys from its own root; `shipyard/railway.json` now uses `pnpm build`
  and `pnpm start -- --ui`, and the public Railway service lives at
  `shipyard-production-f2e5.up.railway.app` behind the shared access gate.
- 2026-03-26: Drafted the `phase-runtime-hardening` supplemental spec pack to address long-loop prompt bloat, Anthropic budget exhaustion, continuation-aware routing, bootstrap seed-doc allowlists, and graph-aware live smoke coverage.
- 2026-03-26: Drafted the `phase-runtime-hardening-follow-up` supplemental pack to address history-safe tool-turn storage, write-aware compaction, greenfield batching prompts, handoff fidelity, continuation-first iteration thresholds, bootstrap-ready discovery, and task-aware replay budgets.
- 2026-03-26: Refreshed the runtime-facing README and architecture docs so they now match the shipped target-manager routing, `plan:` / `next` / `continue` flow, planner-backed graph runtime, browser evaluator, and the current split-pane browser workbench shell.
- 2026-03-26: Drafted the `phase-10` architecture pack with eight stories that sequence the next major runtime upgrades: durable threads, policy and sandboxing, layered memory, repo indexing, explicit routing, richer verification/evals, isolated background tasks, and evented readiness surfaces.
- 2026-03-26: Implemented the `phase-runtime-hardening-follow-up` pack by digesting completed tool turns, preserving write-aware compaction tails, relaxing new-file prompt policy, compressing handoffs, aligning bootstrap-ready discovery, and auto-resuming threshold-hit loops through checkpoint-backed continuations.
- 2026-03-26: Task-aware acting budgets now resolve broad greenfield and same-session continuation intent before exact-path narrow defaults; the live smoke and LangSmith traces confirmed a `broad-greenfield` bootstrap turn followed by a `broad-continuation` follow-up in the same session.
- 2026-03-26: Promoted the fresh-branch/worktree `.env*` carryover rule into `AGENTS.md`, the single-source baseline, and the startup workflow so new story worktrees copy the working `shipyard/.env` setup before project commands.
