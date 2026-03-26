# Technical Plan

## Metadata
- Story ID: RHF-S06
- Story Title: Bootstrap-Ready Discovery Alignment
- Author: Codex
- Date: 2026-03-26

## Proposed Design
- Components/modules affected:
  - `shipyard/src/context/discovery.ts`
  - discovery-report types and any serializers that display greenfield vs existing state
  - routing code in `shipyard/src/engine/turn.ts` or `shipyard/src/agents/coordinator.ts`
  - focused tests such as `shipyard/tests/scaffold-bootstrap.test.ts` and routing coverage
- Public interfaces/contracts:
  - explicit `bootstrapReady` discovery field, or an equivalent shared readiness contract
  - routing rules that prefer lightweight bootstrap when bootstrap-ready is true
- Data flow summary: discovery calculates bootstrap readiness from filtered top-level entries, exposes that signal to the runtime, and the coordinator or turn path uses it to pick the lightweight bootstrap flow for doc-seeded targets.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - remove wasted exploration turns for doc-seeded targets
  - align discovery with bootstrap behavior
  - keep bootstrap-ready routing explicit
- Story ordering rationale: this story can land in parallel with continuation work, but it belongs in the same pack because it removes the same class of wasted loops observed in seeded greenfield replays.
- Gaps/overlap check: this story owns readiness alignment only; prompt policy stays in `RHF-S03`.
- Whole-pack success signal: a workspace containing only seed docs behaves like a bootstrap target everywhere in the runtime.

## Architecture Decisions
- Decision: add or derive one explicit bootstrap-ready signal instead of overloading `isGreenfield` with conflicting meanings.
- Alternatives considered:
  - redefine every doc-seeded target as fully greenfield
  - keep separate implicit rules in discovery and bootstrap validation
  - special-case the mismatch only in one coordinator branch
- Rationale: a dedicated readiness signal is easier to test and less confusing than stretching one boolean to mean both "empty" and "safe to bootstrap."

## Data Model / API Contracts
- Request shape:
  - unchanged operator request shape
- Response shape:
  - discovery report gains bootstrap-readiness information or equivalent normalized contract
- Storage/index changes:
  - none

## Dependency Plan
- Existing dependencies used: discovery, target bootstrap validation, coordinator routing, and scaffold/bootstrap tests.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: routing becomes inconsistent if some paths still key off `isGreenfield` only.
  - Mitigation: update all bootstrap-selection call sites together and add coverage for each path.

## Test Strategy
- Unit tests:
  - discovery marks empty and doc-seeded targets as bootstrap-ready
  - discovery rejects targets with real app files
- Integration tests:
  - coordinator or turn routing prefers lightweight bootstrap when bootstrap-ready is true
  - doc-seeded targets do not trigger broad exploration
- E2E or smoke tests:
  - seeded-target replay confirms the same bootstrap behavior as a truly empty target
- Edge-case coverage mapping:
  - `.shipyard` plus seed docs
  - seed docs plus `package.json`
  - deterministic filtered-entry ordering

## Rollout and Risk Mitigation
- Rollback strategy: keep readiness computation isolated so behavior can revert cleanly if a routing regression appears.
- Feature flags/toggles: none required.
- Observability checks: discovery summaries or traces should show the bootstrap-ready decision explicitly.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
