# Technical Plan

## Metadata
- Story ID: RHF-S05
- Story Title: Continuation-First Iteration Threshold Resume
- Author: Codex
- Date: 2026-03-26

## Proposed Design
- Components/modules affected:
  - `shipyard/src/engine/raw-loop.ts`
  - `shipyard/src/engine/graph.ts`
  - `shipyard/src/engine/turn.ts`
  - `shipyard/src/artifacts/handoff.ts`
  - focused tests such as `shipyard/tests/graph-runtime.test.ts` and `shipyard/tests/turn-runtime.test.ts`
- Public interfaces/contracts:
  - raw-loop result or error contract for continuation-threshold hits
  - graph state status for checkpoint or continuation vs failure
  - configurable outer continuation budget
- Data flow summary: the raw loop returns a typed continuation condition at the acting threshold, the graph persists a handoff instead of marking failure, and the turn executor resumes from that handoff until completion or a higher-level continuation limit stops the chain.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - checkpoint long-running work instead of failing it
  - reuse typed handoffs
  - keep failure semantics honest
- Story ordering rationale: this story depends on `RHF-S04` because continuation quality is only as good as the handoff payload that feeds it.
- Gaps/overlap check: this story owns threshold-to-continuation semantics; task-aware threshold sizing belongs in `RHF-S07`.
- Whole-pack success signal: loop-length exhaustion becomes a visible, bounded continuation path instead of a false red failure.

## Architecture Decisions
- Decision: introduce an explicit continuation state for acting-threshold hits and route it through the existing handoff system.
- Alternatives considered:
  - keep throwing and treat threshold hits as generic failure
  - silently increase the threshold instead of checkpointing
  - push continuation responsibility entirely onto the operator
- Rationale: Shipyard already has a typed handoff mechanism, so the missing piece is to use it when the loop runs long rather than discarding it.

## Data Model / API Contracts
- Request shape:
  - unchanged operator request shape, plus any internal continuation budget config
- Response shape:
  - raw-loop and graph state need a typed continuation or checkpoint outcome
  - final turn summary should report when continuation occurred
- Storage/index changes:
  - handoff persistence already exists; only metadata or status fields may need extension

## Dependency Plan
- Existing dependencies used: raw-loop state machine, graph runtime, handoff artifacts, turn executor, and trace/reporter plumbing.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: auto-resume loops forever.
  - Mitigation: add an outer continuation budget and expose continuation count in tests and traces.

## Test Strategy
- Unit tests:
  - raw loop returns continuation metadata at the acting threshold
  - graph distinguishes continuation from failure
- Integration tests:
  - threshold-hit run persists a handoff and auto-resumes successfully
  - outer continuation budget stops repeated non-progress loops cleanly
- E2E or smoke tests:
  - long greenfield replay confirms operator-visible continuation rather than hard failure
- Edge-case coverage mapping:
  - cancellation during continuation
  - genuine provider error
  - blocked-file handoff vs threshold handoff
  - repeated continuation attempts without progress

## Rollout and Risk Mitigation
- Rollback strategy: keep continuation mapping centralized in raw-loop, graph, and turn orchestration layers.
- Feature flags/toggles: optional continuation-budget config can act as rollout control if needed.
- Observability checks: traces and status text should show threshold hits, handoff creation, resume count, and outer-budget exhaustion clearly.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
