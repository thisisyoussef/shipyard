# Technical Plan

## Metadata
- Story ID: P10-S03
- Story Title: Provider Routing and Capability Resolution
- Author: Codex
- Date: 2026-03-26

## Proposed Design
- Components/modules affected:
  - `shipyard/src/phases/phase.ts` and phase definitions
  - `shipyard/src/engine/` for provider/model resolution
  - `shipyard/src/agents/` for subagent-specific routing hooks
  - `shipyard/src/tools/target-manager/enrich-target.ts` and `shipyard/src/engine/target-enrichment.ts`
  - `shipyard/src/ui/server.ts` and `shipyard/src/engine/turn.ts` for runtime injection and metadata
  - `shipyard/tests/` for routing and capability coverage
- Public interfaces/contracts:
  - provider/model route or profile identifiers for phases
  - shared provider-resolution helper
  - provider-aware capability check helpers
- Data flow summary: a turn or helper role identifies its route/profile, the provider resolver combines defaults and overrides into a concrete provider/model selection, and the runtime requests the matching adapter plus capability information before executing the turn.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - introduce a provider-neutral runtime contract
  - keep one shared orchestration path
  - add configurable multi-provider routing
  - ship an OpenAI adapter
  - migrate tests to provider-neutral fakes
- Story ordering rationale: routing lands after Anthropic is already adapter-backed so the selection layer depends on a stable adapter interface instead of transitional code.
- Gaps/overlap check: this story owns selection and capability rules, not the actual OpenAI implementation or the broad test migration.
- Whole-pack success signal: provider choice becomes a runtime configuration concern instead of a scattered implementation detail.

## Architecture Decisions
- Decision: phases and helper roles should reference named model routes or profiles rather than parsing env vars directly.
- Alternatives considered:
  - put raw `provider` and `model` fields on every phase and subagent callsite
  - keep capability checks local to each feature module
- Rationale: named routes keep the phase contract readable while centralizing precedence and validation in one resolver.

## Data Model / API Contracts
- Routing inputs:
  - global default provider/model
  - per-phase route/profile
  - optional subagent-specific or enrichment-specific overrides
- Resolver output:
  - concrete provider ID
  - concrete model ID
  - availability or missing-config diagnostics
- Storage/index changes:
  - none required; runtime metadata may record resolved provider/model per turn

## Dependency Plan
- Existing dependencies used: engine runtime, phases, target-enrichment helpers, current env handling.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: routing sprawl or ambiguous precedence makes debugging harder.
  - Mitigation: keep one resolver with explicit precedence rules and focused tests.

## Test Strategy
- Unit tests:
  - global default resolution
  - route/profile override precedence
  - invalid provider or missing credential handling
  - provider-aware capability resolution for target enrichment
- Integration tests:
  - turn execution receives the expected provider/model route
  - helper subagent or enrichment path can override the default route predictably
- E2E or smoke tests:
  - deferred until OpenAI exists as a second provider
- Edge-case coverage mapping:
  - ambiguous overrides
  - unknown route/profile IDs
  - missing credentials for a non-default provider

## UI Implementation Plan (if applicable)
- Behavior logic modules: Not applicable.
- Component structure: Not applicable.
- Accessibility implementation plan: Not applicable.
- Visual regression capture plan: Not applicable.

## Rollout and Risk Mitigation
- Rollback strategy: keep Anthropic as the effective default route during migration even after the new resolver exists.
- Feature flags/toggles: the routing system itself is the new toggle surface; default config should preserve current behavior.
- Observability checks: turn summaries and traces should record resolved provider/model so routing bugs are diagnosable.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
