# Technical Plan

## Metadata
- Story ID: P10-S05
- Story Title: Provider-Neutral Test Harness and Contract Migration
- Author: Codex
- Date: 2026-03-26

## Proposed Design
- Components/modules affected:
  - `shipyard/tests/` across engine, subagent, target-manager, and UI runtime suites
  - shared test helper modules for fake adapters and normalized turn results
  - any test-only fixtures or helpers that currently speak Anthropic request/response wire types
  - lightweight docs or README notes for future test authors
- Public interfaces/contracts:
  - provider-neutral fake adapter helper(s)
  - shared normalized turn-result fixtures
  - focused provider contract test harnesses for Anthropic and OpenAI adapters
- Data flow summary: broad tests inject fake adapters or fake adapter results through the shared runtime seam, while provider-specific contract tests stay responsible for validating Anthropic and OpenAI wire translation.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - introduce a provider-neutral runtime contract
  - keep one shared orchestration path
  - add configurable multi-provider routing
  - ship an OpenAI adapter
  - migrate tests to provider-neutral fakes
- Story ordering rationale: this story lands after both adapters and routing exist so the final test seam can stabilize around the completed architecture.
- Gaps/overlap check: this story owns broad suite migration and test-helper guidance, not provider implementation details.
- Whole-pack success signal: shared-runtime regressions can be tested without entangling most of the suite with provider wire formats.

## Architecture Decisions
- Decision: keep a small number of provider-specific contract tests and migrate the broader runtime suite to adapter-based fakes.
- Alternatives considered:
  - leave existing Anthropic-shaped mocks in place and add OpenAI-specific duplicates
  - abstract only a subset of tests and tolerate mixed seams indefinitely
- Rationale: isolating provider specifics to focused contract suites keeps the broader test surface aligned with the production architecture.

## Data Model / API Contracts
- Fake adapter contract:
  - accepts shared turn input
  - returns normalized tool calls or final text
  - can simulate cancellation or provider failure
- Provider contract suites:
  - assert request assembly and response normalization for Anthropic
  - assert request assembly and response normalization for OpenAI
- Storage/index changes:
  - none

## Dependency Plan
- Existing dependencies used: current Vitest suites and runtime dependency-injection seams.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: the suite may lose behavioral coverage while mocks are migrated.
  - Mitigation: migrate by behavior area and preserve or tighten assertions rather than translating fixtures mechanically.

## Test Strategy
- Unit tests:
  - fake adapter helper emits tool-call and final-text scenarios
  - shared runtime tests consume fake adapters without provider wire objects
- Integration tests:
  - graph, raw loop, turn execution, target enrichment, and UI runtime still pass through adapter injection seams
- E2E or smoke tests:
  - provider-specific smoke paths remain focused on adapter contracts only
- Edge-case coverage mapping:
  - cancellation through fake adapters
  - provider failure simulation
  - multi-tool-call turns
  - final-text-only turns

## UI Implementation Plan (if applicable)
- Behavior logic modules: existing UI runtime tests keep their current behavior coverage but swap in provider-neutral fakes.
- Component structure: Not applicable.
- Accessibility implementation plan: Not applicable.
- Visual regression capture plan: Not applicable.

## Rollout and Risk Mitigation
- Rollback strategy: retain focused Anthropic contract coverage while broad tests migrate so regressions are attributable during the transition.
- Feature flags/toggles: none.
- Observability checks: test helper naming and failure messages should distinguish shared-runtime failures from provider adapter failures.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
