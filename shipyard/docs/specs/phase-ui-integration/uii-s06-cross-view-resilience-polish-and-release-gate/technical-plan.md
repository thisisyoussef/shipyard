# Technical Plan

## Metadata
- Story ID: UII-S06
- Story Title: Cross-View Resilience, Polish, and Release Gate
- Author: Codex
- Date: 2026-03-28

## Proposed Design
- Components/modules affected:
  - route surfaces under `shipyard/ui/src/views/`
  - app shell and controller selectors from `UII-S01`
  - any shared state-notice helpers under `shipyard/ui/src/`
  - `shipyard/ui/README.md`
  - `shipyard/docs/specs/phase-ui-integration/*`
  - any impacted docs under `shipyard/docs/`
- Public interfaces/contracts:
  - reusable empty/loading/error state props or helper shapes
  - final manual audit checklist
- Data flow summary: close-out work uses the existing controller and route
  models to surface explicit state notices, restore UI memory, and update docs
  plus audit artifacts to match the actual integrated experience.

## Pack Cohesion and Sequencing
- Higher-level pack objectives:
  - seamless route experience
  - reload/reconnect trust
  - explicit system states
  - docs + QA close-out
- Story ordering rationale: this story must trail the feature stories so it can
  audit the final integrated system rather than polish a moving target.
- Gaps/overlap check: this story fixes resilience/polish gaps and closes docs;
  it should not absorb new large feature work.
- Whole-pack success signal: the pack ends with a clear release gate instead of
  “works for me” implementation notes.

## Architecture Decisions
- Decision: use explicit state components/notices instead of silent `null`
  renders for unavailable runtime data.
  - Rationale: trust is higher when the UI explains why data is missing.
- Decision: treat preview harness parity as a regression gate.
  - Rationale: the mock harness is a deliberate design/development tool and
    should remain intact after live integration.
- Decision: ship a reusable audit checklist with the pack.
  - Rationale: visible UI work needs a repeatable manual validation path.

## Data Model / API Contracts
- Request shape:
  - no major new contracts expected; use existing route/controller state
- Response shape:
  - explicit UI states for loading, empty, error, stale, and unauthorized cases
- Storage/index changes:
  - finalize any local UI preference restore behavior introduced earlier in the pack

## Dependency Plan
- Existing dependencies used: all prior pack stories, current docs/spec tree,
  preview harness, test suite.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: polish work quietly expands scope.
  - Mitigation: treat this as a gate story; new feature requests become follow-up
    tasks instead of slipping in.
  - Risk: docs drift from the integrated reality.
  - Mitigation: update docs and audit checklist in the same story as validation.

## Test Strategy
- Unit tests:
  - any remaining local UI memory and state-notice helpers
- Integration tests:
  - route fallbacks, reconnect states, and legacy entry surfaces
- E2E or smoke tests:
  - run the user audit checklist across dashboard, editor, ultimate, board, and
    preview harness
- Edge-case coverage mapping:
  - unauthorized access
  - reconnect while active
  - missing target
  - stale board
  - preview unavailable

## UI Implementation Plan
- Behavior logic modules:
  - state-notice helpers
  - restore-path helpers for stored UI prefs
- Component structure:
  - route-specific fallback and notice surfaces
- Accessibility implementation plan:
  - final pass on labels, focus handling, and readable status copy
- Visual regression capture plan:
  - final route/state matrix for pack close-out

## Rollout and Risk Mitigation
- Rollback strategy: polish and resilience updates are additive; any risky tweak
  should remain isolated from the core controller and contract layers.
- Feature flags/toggles: none required.
- Observability checks: confirm the UI exposes enough state to debug missing
  target, reconnect, stale board, and access-gate cases without inspecting code.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
