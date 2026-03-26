# Technical Plan

## Metadata
- Story ID: P10-S01
- Story Title: Durable Graph Threads and Unified Execution State
- Author: Codex
- Date: 2026-03-26

## Proposed Design
- Components/modules affected:
  - `shipyard/src/engine/graph.ts`
  - `shipyard/src/engine/turn.ts`
  - `shipyard/src/engine/state.ts`
  - `shipyard/src/plans/store.ts`
  - `shipyard/src/plans/turn.ts`
  - `shipyard/src/plans/task-runner.ts`
  - `shipyard/src/artifacts/handoff.ts`
  - `shipyard/src/ui/contracts.ts`
  - `shipyard/src/ui/server.ts`
  - new thread/checkpoint helpers under `shipyard/src/runtime/` or
    `shipyard/src/threads/`
- Public interfaces/contracts:
  - `RuntimeThread`
  - `RuntimeCheckpoint`
  - `ThreadResumePointer`
  - `ThreadMigrationReport`
- Data flow summary: instruction entry resolves or creates a thread, the graph
  reads and writes state through the thread store, checkpoints capture durable
  execution boundaries, and UI or CLI surfaces consume a projected thread
  summary rather than stitching together several storage systems.

## Pack Cohesion and Sequencing
- Higher-level pack objectives:
  - durable execution
  - explicit policy and approvals
  - layered memory and repo knowledge
  - policy-driven routing and verification
  - background tasking and readiness surfaces
- Story ordering rationale: this story lands first because every later
  architecture recommendation depends on stable pause/resume and checkpoint
  semantics.
- Gaps/overlap check: this story unifies persistence only. It does not yet
  decide which actions require approval or how richer memory retrieval works.
- Whole-pack success signal: later stories can treat thread state as the source
  of truth instead of reading from plans, sessions, checkpoints, and handoffs
  separately.

## Architecture Decisions
- Decision: make durable threads the runtime source of truth and treat session
  or handoff files as projections or migration inputs, not peer systems.
- Alternatives considered:
  - keep the current split persistence design and add more glue code
  - rewrite the whole runtime around a brand-new service boundary
- Rationale: the first option compounds complexity, and the second is too large
  for the value needed right now. A unifying thread contract gives Shipyard the
  durability benefits without discarding the shipped runtime.

## Data Model / API Contracts
- Request shape:
  - thread lookup by session plus target
  - thread creation on first broad instruction or explicit `plan:` flow
- Response shape:
  - projected thread summary for CLI/UI
  - checkpoint metadata for traces and operator review
- Storage/index changes:
  - add target-local thread storage under `.shipyard/threads/`
  - add migration or projection helpers for legacy `.shipyard/plans/` and
    `.shipyard/artifacts/`

## Dependency Plan
- Existing dependencies used: current `StateGraph`, plan-store helpers,
  checkpoint manager, session persistence, UI event stream.
- New dependencies proposed (if any): optional graph checkpointer support if
  the built-in durable model fits the current runtime.
- Risk and mitigation:
  - Risk: migration confusion between legacy session state and thread state.
  - Mitigation: keep a read-only migration report, preserve legacy artifacts
    during rollout, and add deterministic replay tests for representative flows.

## Test Strategy
- Unit tests:
  - thread creation and projection
  - checkpoint persistence and reload
  - legacy plan or handoff migration
- Integration tests:
  - `plan:` -> `next` -> `continue` on one thread
  - interruption, recovery, and resume across process restarts
- E2E or smoke tests:
  - CLI resume and browser-session rehydrate against the same durable thread
- Edge-case coverage mapping:
  - malformed legacy artifact
  - missing checkpoint backend
  - thread resume after failed verification
  - trivial-turn lightweight fallback

## Rollout and Risk Mitigation
- Rollback strategy: keep legacy session and plan reads available until the new
  thread store proves stable.
- Feature flags/toggles: allow the durable thread model to be enabled first for
  graph-mode turns before making it universal.
- Observability checks: emit thread IDs, checkpoint IDs, migration outcomes,
  and resume reasons into local JSONL traces and LangSmith metadata.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
