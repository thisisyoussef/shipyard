# Technical Plan

## Metadata
- Story ID: P10-S02
- Story Title: Anthropic Adapter Migration and Runtime Decoupling
- Author: Codex
- Date: 2026-03-26

## Proposed Design
- Components/modules affected:
  - `shipyard/src/engine/` for shared loop and graph refactors
  - `shipyard/src/engine/providers/` or equivalent provider module path for the Anthropic adapter
  - `shipyard/src/agents/` for subagent loop consumers
  - `shipyard/src/tracing/` for provider-aware metadata
  - `shipyard/tests/` for Anthropic regression tests through the adapter boundary
- Public interfaces/contracts:
  - Anthropic adapter implementing `ModelAdapter`
  - provider-neutral loop options and turn-history storage in shared runtime code
  - provider-aware trace metadata fields
- Data flow summary: shared runtime code constructs provider-neutral turn input, the Anthropic adapter projects it to Anthropic wire types, the adapter normalizes the response back into Shipyard-owned turn results, and the loop continues without direct Anthropic type imports.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - introduce a provider-neutral runtime contract
  - keep one shared orchestration path
  - add configurable multi-provider routing
  - ship an OpenAI adapter
  - migrate tests to provider-neutral fakes
- Story ordering rationale: this story follows the contract story so Anthropic becomes the first real consumer and validator of the new abstraction.
- Gaps/overlap check: this story owns the Anthropic migration and shared-runtime decoupling, not provider selection or OpenAI behavior.
- Whole-pack success signal: after this story, the shared loop is ready to host more than one provider without changing its core control flow.

## Architecture Decisions
- Decision: keep one `raw-loop.ts` / graph orchestration path and swap providers through adapter injection.
- Alternatives considered:
  - add a dedicated Anthropic loop and later clone it for OpenAI
  - keep Anthropic types in shared state and add translation shims around OpenAI only
- Rationale: a single shared loop keeps cancellation, tracing, checkpointing, and verification logic consistent across providers.

## Data Model / API Contracts
- Shared runtime contract:
  - provider-neutral message history
  - provider-neutral tool-call results
  - provider/model metadata available to traces and summaries
- Anthropic adapter responsibilities:
  - validate config
  - build provider requests
  - parse Anthropic response blocks
  - normalize tool calls, tool-call IDs, and final text
- Storage/index changes:
  - no persistence format changes required beyond storing provider/model metadata where useful

## Dependency Plan
- Existing dependencies used: current Anthropic SDK, LangSmith tracing, shared engine/tool modules.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: the adapter migration may accidentally change shared loop semantics.
  - Mitigation: preserve current Anthropic regression coverage and port tests before altering behavior.

## Test Strategy
- Unit tests:
  - Anthropic adapter config and request assembly still fail clearly on missing credentials
  - Anthropic adapter normalizes tool-use and final-text responses correctly
- Integration tests:
  - shared raw loop completes Anthropic tool-use turns through the adapter
  - shared runtime cancellation still resolves correctly through the adapter path
- E2E or smoke tests:
  - existing manual Anthropic smoke scripts remain valid with adapter-backed wiring
- Edge-case coverage mapping:
  - no-tool completion
  - malformed Anthropic blocks
  - cancelled in-flight request

## UI Implementation Plan (if applicable)
- Behavior logic modules: Not applicable.
- Component structure: Not applicable.
- Accessibility implementation plan: Not applicable.
- Visual regression capture plan: Not applicable.

## Rollout and Risk Mitigation
- Rollback strategy: retain the old Anthropic helper implementation until the adapter path is proven, then collapse the legacy entrypoints into adapter-owned internals.
- Feature flags/toggles: default provider remains Anthropic during this migration.
- Observability checks: traces and logs should show provider/model metadata coming from the adapter path.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
