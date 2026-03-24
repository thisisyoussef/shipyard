# Feature Spec

## Metadata
- Story ID: P4-S01
- Story Title: Graph Runtime and Fallback Contract
- Author: Codex
- Date: 2026-03-24
- Related PRD/phase gate: Phase 4 LangGraph State Machine, step 4.1

## Problem Statement

Shipyard's current runtime still behaves like a REPL with a planning stub. Phase 4 needs a real execution engine that can carry shared state across planning, acting, verifying, recovering, and responding. LangGraph is the preferred framework for that state machine, but the phase also needs an explicit raw-loop fallback so the MVP is not blocked on framework plumbing if the integration fights the time budget.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Define one explicit runtime state object for the full agent lifecycle.
- Objective 2: Encode the control flow between plan, act, verify, recover, and respond as conditional transitions instead of ad hoc branching.
- Objective 3: Preserve a raw-loop fallback that produces equivalent behavior and traces if LangGraph setup becomes too costly.
- How this story or pack contributes to the overall objective set: This story establishes the Phase 4 execution contract and fallback policy for the rest of the pack.

## User Stories
- As the Shipyard engine, I want a stateful graph runtime so I can track message history, retries, blocked files, and final status across one instruction end to end.

## Acceptance Criteria
- [ ] AC-1: Define a Phase 4 graph state object carrying message history, current instruction, `ContextEnvelope`, target directory, phase config, file-hash map, retry-count map, blocked files, last edited file, status, and final result.
- [ ] AC-2: Implement a LangGraph `StateGraph` runtime with `plan`, `act`, `verify`, `recover`, and `respond` nodes, each returning partial state updates.
- [ ] AC-3: Wire conditional edges so `START -> plan -> act`, `act -> verify` when an edit occurred, `act -> respond` when work completes without edits, `verify -> respond` on pass, `verify -> recover` on fail, and `recover -> plan` or `respond` depending on retry/block status.
- [ ] AC-4: The `act` node integrates the Phase 3 raw tool loop behavior, including internal Claude tool-use iteration, until the model either finishes or reports that an edit was made.
- [ ] AC-5: The runtime caps tool-acting iterations at 25 and records a clear failure status if the cap is exceeded.
- [ ] AC-6: The implementation documents and preserves a fallback mode that uses the raw loop plus manual state tracking when LangGraph integration proves too expensive for the phase budget.

## Edge Cases
- Empty/null inputs: blank instructions reject before graph invocation.
- Boundary values: verification-free tasks can route from `act` directly to `respond`.
- Invalid/malformed data: unknown status values fail loudly rather than routing silently.
- External-service failures: model or tool-call failures surface through state as actionable errors.

## Non-Functional Requirements
- Security: state should not store secrets.
- Performance: state transitions should only carry the minimal message and retry data needed for the next node.
- Observability: each node transition should be traceable and status-driven.
- Reliability: the fallback path must stay behaviorally aligned enough to preserve the MVP if LangGraph is abandoned mid-phase.

## UI Requirements (if applicable)
- Required states: Not applicable.
- Accessibility contract: Not applicable.
- Design token contract: Not applicable.
- Visual-regression snapshot states: Not applicable.

## Out of Scope
- Human-in-the-loop approval nodes.
- Long-term graph persistence beyond the session artifacts already in Shipyard.
- Multi-agent branching beyond the single coordinator flow.

## Done Definition
- The graph state and node contracts are specified clearly enough to implement without inventing more runtime shape.
- The fallback plan is explicit rather than implied.
- Tests cover routing and iteration-limit behavior.
