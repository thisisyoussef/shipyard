# Architecture Decisions (ADR Log)

Record durable workspace decisions here.

## Template

- **ADR-ID**:
- **Date**:
- **Context**:
- **Decision**:
- **Alternatives Considered**:
- **Consequences**:

## Seeded Decisions

- **ADR-ID**: ADR-0001
- **Date**: 2026-03-24
- **Context**: The workspace needs a reusable helper harness without mixing it into the runnable application surface.
- **Decision**: Keep helper workflow material in root `.ai/` and keep the application itself in `shipyard/`.
- **Alternatives Considered**: Keep everything at repo root; embed the harness inside `shipyard/`.
- **Consequences**: Repo-level docs must describe the two-surface layout clearly, and validation commands from the root must target `shipyard/`.

- **ADR-ID**: ADR-0002
- **Date**: 2026-03-24
- **Context**: Shipyard is currently a Day 1 local coding-agent foundation with a persistent CLI loop and typed tool registry.
- **Decision**: Keep the app as a standalone TypeScript CLI with a persistent loop, typed tools, local checkpoints, and local trace logging.
- **Alternatives Considered**: Turn the app into a web service immediately; defer typed tools until later.
- **Consequences**: The app can evolve incrementally from a stable local runtime, and the harness can stay focused on building that core.

- **ADR-ID**: ADR-0003
- **Date**: 2026-03-24
- **Context**: The imported harness source included project-specific memory from another repo.
- **Decision**: Reset imported backlog/history files and keep only repo-generic workflows, templates, and memory slots.
- **Alternatives Considered**: Keep the imported memory and rename it; rebuild the harness from scratch.
- **Consequences**: The harness starts clean, but future tasks must maintain the new generic baseline intentionally.

- **ADR-ID**: ADR-0004
- **Date**: 2026-03-25
- **Context**: Broad Shipyard instructions need more structure than the
  lightweight `TaskPlan`, but the runtime still needs to stay fast for
  exact-path and other narrow work.
- **Decision**: Add a read-only planner helper that emits a typed
  `ExecutionSpec` for broad code-phase instructions, while keeping a lightweight
  fallback spec for trivial, greenfield, and target-manager paths.
- **Alternatives Considered**: Keep stretching `TaskPlan`; make planner mode the
  default for every instruction.
- **Consequences**: Planner output becomes reusable by later evaluation and plan
  mode stories, and route metadata must clearly distinguish planner-backed vs
  lightweight runs.

- **ADR-ID**: ADR-0005
- **Date**: 2026-03-25
- **Context**: Phase 8 needs spec-driven planning without depending on pasted context or overloading generic file reads.
- **Decision**: Add a dedicated read-only `load_spec` tool that returns named, bounded spec documents instead of folding raw spec loading into `read_file` or `rollingSummary`.
- **Alternatives Considered**: Reuse `read_file` alone; tell operators to keep pasting briefs manually.
- **Consequences**: Spec-driven stories can reuse stable `spec:` refs and bounded tool output, while later plan/task stories can build on that contract without inventing another spec-loading path.

- **ADR-ID**: ADR-0006
- **Date**: 2026-03-25
- **Context**: The harness already used a Claude-first bridge for design briefs, but later UI implementation and QA phases had no equivalent scripted delegate and no reversible switch for trying Claude there.
- **Decision**: Add a flag-gated `scripts/run-ui-phase-bridge.mjs` entrypoint for UI implementation, QA, critic, and final polish. The flag only changes provider routing; the phase prompts must preserve the exact Codex skill chain for each phase.
- **Alternatives Considered**: Keep later phases manual only; make all later UI phases Claude-first unconditionally; define a separate Claude-only skill chain.
- **Consequences**: The repo can trial Claude in later UI phases without changing the workflow contract, and turning the flag off returns those scripted bridges to a Codex-first path.

- **ADR-ID**: ADR-0007
- **Date**: 2026-03-25
- **Context**: Shipyard needed richer greenfield bootstrap without duplicating scaffold logic between target creation and code-phase empty-target setup.
- **Decision**: Keep the scaffold catalog in `shipyard/src/tools/target-manager/scaffolds.ts` as the single source of truth, and route both `create_target` and `bootstrap_target` through one shared materialization helper.
- **Alternatives Considered**: Add a second project-scaffolder tool; keep relying on repeated `write_file` calls for boilerplate.
- **Consequences**: New presets must be added once and reused across both flows, and code-phase guidance should prefer the shared bootstrap tool for standard workspace starters.

- **ADR-ID**: ADR-0008
- **Date**: 2026-03-25
- **Context**: Long-running or recovery-heavy turns need more durable resume state than an eight-line rolling summary, but the richer planner artifact is not yet merged on `main`.
- **Decision**: Persist typed `ExecutionHandoff` artifacts under `shipyard/.shipyard/artifacts/<sessionId>/` and keep only the active artifact path in session state, with the first landing anchored to the current `TaskPlan` plus latest verification outcome.
- **Alternatives Considered**: Stretch `rollingSummary`; write ad hoc notes blobs; block the story on the unmerged planner branch.
- **Consequences**: Resume state stays structured and target-local today, traces/logs must expose handoff metadata, and later planner work can enrich the existing handoff contract instead of inventing a second reset path.
