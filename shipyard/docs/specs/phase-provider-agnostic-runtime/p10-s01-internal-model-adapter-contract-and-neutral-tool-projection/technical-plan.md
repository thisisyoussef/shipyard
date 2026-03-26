# Technical Plan

## Metadata
- Story ID: P10-S01
- Story Title: Internal Model Adapter Contract and Neutral Tool Projection
- Author: Codex
- Date: 2026-03-26

## Proposed Design
- Components/modules affected:
  - `shipyard/src/engine/` for the provider-neutral contract module
  - `shipyard/src/tools/registry.ts` for registry cleanup
  - `shipyard/src/phases/` and later adapter modules as consumers of generic tool definitions
  - `shipyard/tests/` for contract and registry regression coverage
- Public interfaces/contracts:
  - `ModelAdapter`
  - `TurnMessage`
  - `ToolCall`
  - `ToolCallResult`
  - `ModelTurnResult`
  - generic provider-side tool projection helpers that accept `ToolDefinition[]`
- Data flow summary: phases or runtime modules identify tool names, the registry resolves `ToolDefinition[]`, and the active provider adapter projects those tools into its own wire format while the shared runtime consumes Shipyard-owned turn/result types.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - introduce a provider-neutral runtime contract
  - keep one shared orchestration path
  - add configurable multi-provider routing
  - ship an OpenAI adapter
- Story ordering rationale: this story lands first because every later provider-migration story depends on one stable internal contract and on a provider-neutral registry.
- Gaps/overlap check: this story owns contract definition and registry cleanup only; Anthropic migration, routing, and OpenAI implementation remain separate.
- Whole-pack success signal: later stories can swap providers without re-deciding message or tool contract ownership.

## Architecture Decisions
- Decision: Shipyard should own the runtime turn/tool types even when provider SDKs already expose similar types.
- Alternatives considered:
  - keep Anthropic message types as the shared runtime contract
  - make the registry emit multiple provider-specific tool descriptor formats
- Rationale: a Shipyard-owned contract localizes provider differences and lets the registry stay generic.

## Data Model / API Contracts
- Request-side contract:
  - system prompt or role-equivalent instruction
  - prior turn history represented with Shipyard-owned message items
  - generic tool definitions resolved from the registry
  - optional provider/model selection metadata for later stories
- Response-side contract:
  - normalized final text
  - normalized tool calls with stable IDs, tool names, and parsed input
  - normalized stop reason or next-action signal for the orchestration loop
- Storage/index changes:
  - none

## Dependency Plan
- Existing dependencies used: current engine/tool modules and strict TypeScript.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: the first contract may leak Anthropic assumptions in naming or field shape.
  - Mitigation: keep the contract minimal and centered on loop needs, not on any one provider wire format.

## Test Strategy
- Unit tests:
  - internal model contract helpers normalize turn items as expected
  - registry still resolves `ToolDefinition[]` deterministically after cleanup
  - provider projection helpers can consume multiple registered tools
- Integration tests:
  - focused fake-adapter path proving generic tool metadata is sufficient for projection
- E2E or smoke tests: deferred to later provider-migration stories
- Edge-case coverage mapping:
  - empty tool sets
  - malformed tool-result normalization
  - registry behavior after provider-specific exports are removed

## UI Implementation Plan (if applicable)
- Behavior logic modules: Not applicable.
- Component structure: Not applicable.
- Accessibility implementation plan: Not applicable.
- Visual regression capture plan: Not applicable.

## Rollout and Risk Mitigation
- Rollback strategy: retain the old Anthropic implementation details inside Anthropic-only modules until later migration stories are complete.
- Feature flags/toggles: none in this story.
- Observability checks: contract helpers should remain snapshot-friendly for later trace assertions.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
