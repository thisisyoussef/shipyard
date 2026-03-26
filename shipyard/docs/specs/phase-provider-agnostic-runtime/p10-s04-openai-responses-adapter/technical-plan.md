# Technical Plan

## Metadata
- Story ID: P10-S04
- Story Title: OpenAI Responses Adapter
- Author: Codex
- Date: 2026-03-26

## Proposed Design
- Components/modules affected:
  - `shipyard/src/engine/providers/` or equivalent provider module path for the OpenAI adapter
  - `shipyard/src/engine/` for adapter registration and provider lookup
  - `shipyard/package.json` if the official OpenAI SDK is added
  - `shipyard/tests/` for OpenAI adapter contract coverage
- Public interfaces/contracts:
  - OpenAI adapter implementing `ModelAdapter`
  - provider-aware config resolution for OpenAI credentials and model IDs
  - normalization helpers for OpenAI tool-call and tool-result items
- Data flow summary: shared runtime constructs provider-neutral turn input, the OpenAI adapter maps system/history/tools into a Responses API request, normalizes returned `function_call` items or final text into Shipyard-owned turn results, and encodes tool-call results back into `function_call_output` inputs for the next loop iteration.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - introduce a provider-neutral runtime contract
  - keep one shared orchestration path
  - add configurable multi-provider routing
  - ship an OpenAI adapter
  - migrate tests to provider-neutral fakes
- Story ordering rationale: this story lands after routing exists so OpenAI plugs into a settled contract and selection layer instead of inventing new knobs.
- Gaps/overlap check: this story owns the OpenAI adapter only; broad test migration and docs cleanup remain separate.
- Whole-pack success signal: Shipyard can execute the same tool-using loop against more than one provider through the same orchestration contract.

## Architecture Decisions
- Decision: target the OpenAI Responses API instead of building a Chat Completions-specific path.
- Alternatives considered:
  - Chat Completions or a second ad hoc loop
  - a minimal text-only OpenAI path without tool support
- Rationale: Responses aligns more closely with the desired tool-calling contract and keeps the multi-provider story centered on one shared tool loop.

## Data Model / API Contracts
- OpenAI request shape:
  - system or developer instruction content derived from the shared prompt
  - prior turn inputs in the adapter's chosen Responses-compatible format
  - `tools` populated from provider-side function-tool projection
  - resolved model identifier
- OpenAI response shape:
  - normalized final text
  - normalized function tool calls with stable IDs and parsed arguments
  - provider/model metadata for traces
- Storage/index changes:
  - none required

## Dependency Plan
- Existing dependencies used: shared engine/provider config, strict TypeScript, current tracing and test infrastructure.
- New dependencies proposed (if any):
  - official OpenAI TypeScript SDK, if that is the smallest way to speak the Responses API cleanly
- Risk and mitigation:
  - Risk: OpenAI wire-format differences may tempt a second loop implementation.
  - Mitigation: keep all translation logic inside the adapter and refuse shared-loop changes that duplicate provider semantics.

## Test Strategy
- Unit tests:
  - missing OpenAI credentials
  - tool projection into OpenAI function tools
  - normalization of `function_call` items
  - encoding of tool results into `function_call_output`
- Integration tests:
  - shared raw loop completes a tool-calling turn through the OpenAI adapter with a fake or mocked client
- E2E or smoke tests:
  - optional manual smoke path once credentials exist
- Edge-case coverage mapping:
  - final text without tools
  - malformed tool-argument JSON
  - missing `call_id`
  - multiple tool calls in one response

## UI Implementation Plan (if applicable)
- Behavior logic modules: Not applicable.
- Component structure: Not applicable.
- Accessibility implementation plan: Not applicable.
- Visual regression capture plan: Not applicable.

## Rollout and Risk Mitigation
- Rollback strategy: keep Anthropic as the default provider route while OpenAI is added as an opt-in path.
- Feature flags/toggles: provider routing already acts as the functional toggle surface for OpenAI.
- Observability checks: trace metadata and adapter contract tests should clearly distinguish OpenAI request assembly failures from shared-loop failures.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
