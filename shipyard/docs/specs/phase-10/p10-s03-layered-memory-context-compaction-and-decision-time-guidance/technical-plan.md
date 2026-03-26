# Technical Plan

## Metadata
- Story ID: P10-S03
- Story Title: Layered Memory, Context Compaction, and Decision-Time Guidance
- Author: Codex
- Date: 2026-03-26

## Proposed Design
- Components/modules affected:
  - `shipyard/src/context/envelope.ts`
  - `shipyard/src/engine/state.ts`
  - `shipyard/src/engine/turn.ts`
  - `shipyard/src/artifacts/handoff.ts`
  - `shipyard/src/tracing/langsmith.ts`
  - new memory helpers under `shipyard/src/context/memory/`
- Public interfaces/contracts:
  - `MemoryLayer`
  - `MemoryReceipt`
  - `CompactedContextSlice`
  - `DecisionTimeGuidance`
- Data flow summary: thread and target-local artifacts feed typed memory layers,
  a retrieval step selects relevant slices for the active turn, compaction keeps
  larger slices bounded, and optional guidance hooks append short runtime
  nudges when the current trajectory matches a known failure pattern.

## Pack Cohesion and Sequencing
- Higher-level pack objectives:
  - durable execution
  - explicit policy and approvals
  - layered memory and repo knowledge
  - policy-driven routing and verification
  - background tasking and readiness surfaces
- Story ordering rationale: memory layering follows the durable thread work so
  retrieved context can use thread state as the source of truth.
- Gaps/overlap check: this story defines memory retrieval and compaction only;
  P10-S04 adds the durable repo index that becomes one of those memory layers.
- Whole-pack success signal: later routing, planner, and task-board stories can
  ask for the right context slice instead of inheriting a giant generic prompt.

## Architecture Decisions
- Decision: keep memory retrieval explicit and typed rather than hiding it
  inside one long prompt-construction function.
- Alternatives considered:
  - preserve the current serialized envelope and keep adding more summaries
  - move all context into one vector-store-style abstraction immediately
- Rationale: the first option will keep growing token cost, while the second is
  too large and too fuzzy for the current runtime. Layered memory gives
  Shipyard a clear migration path with bounded complexity.

## Data Model / API Contracts
- Request shape:
  - active turn context plus thread ID, active task, and retrieval intent
- Response shape:
  - ordered memory receipts plus the final prompt-ready context slices
- Storage/index changes:
  - add target-local memory summaries under `.shipyard/`
  - preserve source pointers back to session, thread, upload, or handoff files

## Dependency Plan
- Existing dependencies used: session state, thread state, upload receipts,
  target rules, local traces.
- New dependencies proposed (if any): none required; compaction can start with
  existing model capabilities and local summaries.
- Risk and mitigation:
  - Risk: over-compaction hides critical details.
  - Mitigation: keep source pointers and targeted escape hatches so the
    coordinator can rehydrate the raw artifact when needed.

## Test Strategy
- Unit tests:
  - memory-layer selection
  - compaction and source-pointer preservation
  - decision-time guidance classification
- Integration tests:
  - long-running thread with repeated failures
  - plan-backed task carry-forward using layered retrieval
- E2E or smoke tests:
  - browser workbench shows memory receipts for a resumed session
- Edge-case coverage mapping:
  - empty target with no memory
  - malformed compacted summary
  - stale failure note replaced by a newer success
  - very large diff or command output

## Rollout and Risk Mitigation
- Rollback strategy: keep the current serialized envelope as a temporary escape
  hatch behind a debug flag while layered retrieval proves stable.
- Feature flags/toggles: decision-time guidance can ship after base memory
  layering if needed.
- Observability checks: record layer selection, dropped content, compaction
  sizes, and guidance-trigger reasons.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
