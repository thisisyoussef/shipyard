# Technical Plan

## Metadata
- Story ID: P3-S01
- Story Title: Anthropic Client and Tool-Use Contract
- Author: Codex
- Date: 2026-03-24

## Proposed Design
- Components/modules affected:
  - `shipyard/src/engine/` for Claude client helpers
  - `shipyard/src/phases/code/` for prompt/model coordination when needed
  - `shipyard/package.json` if the official Anthropic SDK is added
  - `shipyard/tests/` for request assembly and response parsing tests
- Public interfaces/contracts:
  - a small client factory or request helper for Anthropic Messages API calls
  - shared types/helpers for assistant `tool_use` blocks and user `tool_result` blocks
  - a default model constant using `claude-sonnet-4-5`
- Data flow summary: Phase 2 registry emits tool definitions, the Claude helper turns them into the Messages API request, and the raw loop later consumes parsed response blocks to decide whether to continue.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - prove the model-to-tool pipeline
  - preserve surgical editing under live model behavior
  - keep the first live loop observable and bounded
- Story ordering rationale: this story lands first because the loop and the live tests both depend on a stable client and typed message-block helpers.
- Gaps/overlap check: this story owns client/config/protocol setup only; loop control flow and live prompt hardening remain separate.
- Whole-pack success signal: later stories can implement and test loop behavior without re-deciding API shapes or model configuration.

## Architecture Decisions
- Decision: use Anthropic's official TypeScript SDK unless the implementation team finds a compelling reason to stay on raw `fetch`.
- Alternatives considered:
  - use `fetch` directly against `/v1/messages`
  - defer the dependency and hand-roll request/response types
- Rationale: the official SDK keeps the first integration smaller and better typed while still preserving the no-framework intent of the phase.

## Data Model / API Contracts
- Request shape:
  - system prompt string
  - message history array
  - Anthropic tool definitions from the Phase 2 registry
  - target model defaulting to `claude-sonnet-4-5`
- Response shape:
  - assistant message content blocks
  - `stop_reason`
  - helper accessors for `tool_use` blocks versus final text blocks
- Storage/index changes:
  - none

## Dependency Plan
- Existing dependencies used: Node runtime, current engine/tool modules.
- New dependencies proposed (if any):
  - `@anthropic-ai/sdk` if the implementation team chooses the SDK route
- Risk and mitigation:
  - Risk: model-name churn or version drift.
  - Mitigation: centralize the default model constant and prefer Anthropic's alias over a pinned version unless reproducibility needs change later.

## Test Strategy
- Unit tests:
  - missing `ANTHROPIC_API_KEY`
  - request assembly from system prompt, messages, and tool list
  - assistant response block extraction for `tool_use` versus text
- Integration tests:
  - mocked client path proving tool definitions and content blocks are passed through unchanged
- E2E or smoke tests: deferred to P3-S03's live verification
- Edge-case coverage mapping:
  - empty tools
  - unknown content block type
  - malformed API response handling

## UI Implementation Plan (if applicable)
- Behavior logic modules: Not applicable.
- Component structure: Not applicable.
- Accessibility implementation plan: Not applicable.
- Visual regression capture plan: Not applicable.

## Rollout and Risk Mitigation
- Rollback strategy: if the SDK choice causes friction, keep the raw-loop contract but swap the client helper to raw `fetch`.
- Feature flags/toggles: none in Phase 3.
- Observability checks: surface config and API errors with stage labels so the raw loop can print useful diagnostics.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
