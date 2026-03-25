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
- 2026-03-25: Landed `P8-S01` with a dedicated read-only `load_spec` tool instead of overloading `read_file`, so later Phase 8 planning stories can reference stable `spec:` identifiers.
- 2026-03-25: Kept `load_spec` target-relative for its first landing because the repo has no existing configurable contract for workspace-outside-target spec roots.
- 2026-03-25: Landed `P7-S04` by persisting typed `ExecutionHandoff` artifacts under `.shipyard/artifacts/<sessionId>/`, recording only `activeHandoffPath` in session state, and injecting `latestHandoff` back into the context envelope on resumed turns.
- 2026-03-25: Kept the first handoff payload anchored to the shipped `TaskPlan` plus latest verification outcome so long-run reset routing can ship on `main` without depending on the stale `P7-S01` planner branch.
