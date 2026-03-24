# Technical Plan

## Metadata
- Story ID: P4-S01
- Story Title: Graph Runtime and Fallback Contract
- Author: Codex
- Date: 2026-03-24

## Proposed Design
- Components/modules affected:
  - `shipyard/src/engine/` for graph state, node helpers, and the compiled runtime
  - Phase 3 runtime helpers for model and tool execution
  - `shipyard/src/phases/code/` for phase config and prompt composition
  - `shipyard/tests/` for routing and fallback coverage
- Public interfaces/contracts:
  - a compiled graph or equivalent runtime entrypoint
  - shared `AgentGraphState` type
  - explicit status enum or string union for `planning`, `acting`, `verifying`, `recovering`, `done`
- Data flow summary: the graph starts with a fresh state object, updates it through node-local partial returns, and ends when the `respond` node has populated `finalResult` and status `done`.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - stateful execution engine
  - reversible editing and bounded recovery
  - real CLI wiring and trace capture
- Story ordering rationale: the runtime contract must exist before checkpointing, context serialization, or tracing can be attached to real node transitions.
- Gaps/overlap check: this story owns state shape and routing only; checkpoint behavior, CLI wiring, and trace capture stay in later stories.
- Whole-pack success signal: later stories can plug into named node transitions and shared state instead of re-inventing runtime control flow.

## Architecture Decisions
- Decision: use `StateGraph` as the preferred runtime while explicitly preserving a manual-state raw-loop fallback.
- Alternatives considered:
  - stay on the raw loop only
  - over-generalize into a custom graph abstraction before proving the MVP
- Rationale: LangGraph gives clearer state transitions and automatic tracing, but the fallback protects the schedule.

## Data Model / API Contracts
- Request shape:
  - `instruction`
  - `ContextEnvelope`
  - `targetDirectory`
  - `phaseConfig`
- Response shape:
  - updated graph state
  - `finalResult` string from the `respond` node
  - status-driven routing outcome
- Storage/index changes:
  - state carries in-memory `fileHashes`, `retryCountsByFile`, `blockedFiles`, and `lastEditedFile`

## Dependency Plan
- Existing dependencies used: `@langchain/langgraph`, `langsmith`, Phase 3 Claude runtime, current session state helpers.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: LangGraph integration burns the time budget without producing a better runtime.
  - Mitigation: define the fallback contract up front and switch to the raw-loop path if wiring exceeds the planned budget.

## Test Strategy
- Unit tests:
  - route selector helpers for every status branch
  - iteration-cap failure
  - fallback-mode state updates
- Integration tests:
  - plan -> act -> respond path without edits
  - plan -> act -> verify -> recover -> plan retry path
- E2E or smoke tests: deferred to P4-S04
- Edge-case coverage mapping:
  - unknown status
  - max retries hit
  - no final text after a non-tool model response

## UI Implementation Plan (if applicable)
- Behavior logic modules: Not applicable.
- Component structure: Not applicable.
- Accessibility implementation plan: Not applicable.
- Visual regression capture plan: Not applicable.

## Rollout and Risk Mitigation
- Rollback strategy: keep the raw loop as the production path until the graph proves stable.
- Feature flags/toggles: a simple runtime selector is acceptable if needed to swap graph vs fallback.
- Observability checks: node names and statuses should appear in traces and logs.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
