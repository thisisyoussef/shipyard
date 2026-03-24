# Technical Plan

## Metadata
- Story ID: P3-S02
- Story Title: Raw Claude Tool Loop
- Author: Codex
- Date: 2026-03-24

## Proposed Design
- Components/modules affected:
  - `shipyard/src/engine/raw-loop.ts`
  - `shipyard/src/tools/registry.ts`
  - Claude client helpers from P3-S01
  - `shipyard/tests/` for loop behavior coverage
- Public interfaces/contracts:
  - `runRawToolLoop(systemPrompt, userMessage, toolNames, targetDirectory)`
  - internal helpers for text extraction, tool-use extraction, truncated logging, and tool-result message assembly
- Data flow summary: the loop builds message history, calls Claude, branches on `stop_reason`, executes any requested tools through the registry, appends `tool_result` blocks, and repeats until the model ends the turn with final text.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - prove the model-to-tool pipeline
  - preserve surgical editing under live model behavior
  - keep the first live loop observable and bounded
- Story ordering rationale: this story follows the client/protocol setup from P3-S01 and creates the runtime that P3-S03 will test live.
- Gaps/overlap check: this story owns loop control flow only; live prompt tuning and behavior verification remain separate.
- Whole-pack success signal: Shipyard can complete at least one full tool-using Claude conversation without framework assistance.

## Architecture Decisions
- Decision: keep the public raw-loop signature small and match the prompt's four required inputs, while allowing internal dependency injection for tests if needed.
- Alternatives considered:
  - expose a larger options object immediately
  - hide the loop inside the existing REPL before it is proven independently
- Rationale: a small public API keeps the fallback loop simple while still leaving room for test seams internally.

## Data Model / API Contracts
- Request shape:
  - `systemPrompt: string`
  - `userMessage: string`
  - `toolNames: string[]`
  - `targetDirectory: string`
- Response shape:
  - final assistant text string on success
  - thrown or returned error when iteration cap or unrecoverable provider failure occurs
- Storage/index changes:
  - none

## Dependency Plan
- Existing dependencies used: Phase 2 registry, P3-S01 Claude client helpers, Node console output.
- New dependencies proposed (if any): none beyond the client choice already made in P3-S01.
- Risk and mitigation:
  - Risk: the loop could spin forever if Claude keeps requesting tools.
  - Mitigation: hard-cap at 25 iterations and print the turn count during execution.

## Test Strategy
- Unit tests:
  - one-turn final text response
  - `tool_use` continuation path
  - multi-tool response in a single turn
  - iteration cap failure
  - unknown-tool result handling
- Integration tests:
  - registry-backed tool execution with mocked Claude responses
- E2E or smoke tests: deferred to P3-S03 live scenarios
- Edge-case coverage mapping:
  - no text blocks in the final response
  - empty tool list
  - truncated logging boundaries

## UI Implementation Plan (if applicable)
- Behavior logic modules: Not applicable.
- Component structure: Not applicable.
- Accessibility implementation plan: Not applicable.
- Visual regression capture plan: Not applicable.

## Rollout and Risk Mitigation
- Rollback strategy: if the raw loop proves unstable, keep the Claude client helpers and fall back to the existing local REPL while debugging.
- Feature flags/toggles: none.
- Observability checks: log turn numbers, tool names, and truncated inputs/outputs on every loop iteration.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
