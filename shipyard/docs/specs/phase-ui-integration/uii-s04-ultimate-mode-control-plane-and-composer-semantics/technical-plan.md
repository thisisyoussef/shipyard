# Technical Plan

## Metadata
- Story ID: UII-S04
- Story Title: Ultimate Mode Control Plane and Composer Semantics
- Author: Codex
- Date: 2026-03-28

## Proposed Design
- Components/modules affected:
  - `shipyard/src/engine/ultimate-mode.ts`
  - `shipyard/src/ui/contracts.ts`
  - `shipyard/src/ui/workbench-state.ts`
  - `shipyard/src/ui/server.ts`
  - `shipyard/ui/src/panels/ComposerPanel.tsx`
  - `shipyard/ui/src/shell/UltimateBadge.tsx`
  - `shipyard/ui/src/shell/UltimateToggle.tsx`
  - `shipyard/ui/src/HumanFeedbackPage.tsx`
- Public interfaces/contracts:
  - `ultimate:toggle`
  - `ultimate:feedback`
  - `ultimate:state`
  - `UltimateUiState`
- Data flow summary: the composer and badge send typed ultimate actions to the
  server; the server routes them through the existing ultimate runtime,
  maintains a lightweight UI projection for the active project, and broadcasts
  `ultimate:state`; session snapshots carry the same state back on reload.

## Pack Cohesion and Sequencing
- Higher-level pack objectives:
  - first-class ultimate UX
  - typed runtime truth
  - reload-safe state
  - future-compatible supervisor projection
- Story ordering rationale: this story depends on the live editor/composer from
  `UII-S03`; otherwise the typed controls would still be mounted on mocks.
- Gaps/overlap check: this story improves the control plane only; broader
  multi-story coordination remains a later Phase 11 concern.
- Whole-pack success signal: an operator can tell exactly what ultimate mode is
  doing and what the next send action will mean.

## Architecture Decisions
- Decision: typed messages should call the same underlying ultimate runtime
  logic instead of synthesizing fake text commands end-to-end.
  - Alternatives considered:
    - keep wrapping everything as plain text instructions
    - implement a second ultimate runtime path
  - Rationale: typed controls improve UX without creating a second behavior
    surface to maintain.
- Decision: publish a richer `UltimateUiState` than the minimal mock needs.
  - Rationale: queued feedback count, phase, and last-cycle context are needed
    for trustworthy UI, reconnect, and later coordinator alignment.
- Decision: keep text-command fallback fully supported.
  - Rationale: terminal parity, backward compatibility, and human-feedback page
    compatibility all depend on it.

## Data Model / API Contracts
- Request shape:
  - `ultimate:toggle { enabled: boolean, brief?: string }`
  - `ultimate:feedback { text: string }`
- Response shape:
  - `ultimate:state { active, phase, currentBrief, turnCount, pendingFeedbackCount, startedAt, lastCycleSummary }`
- Storage/index changes:
  - additive `ultimateState` inside persisted/broadcast workbench state

## Dependency Plan
- Existing dependencies used: current ultimate runtime/controller, websocket
  server, workbench reducer, composer/human-feedback surfaces.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: typed controls drift from command behavior.
  - Mitigation: the server routes both through shared lower-level helpers.
  - Risk: reload while active loses projection truth.
  - Mitigation: store `ultimateState` in the same workbench snapshot path that
    the browser already rehydrates.

## Test Strategy
- Unit tests:
  - contract validation for typed ultimate messages
  - reducer updates for `ultimate:state`
- Integration tests:
  - toggle start/feedback/stop behavior through the UI runtime
  - reconnect/reload preserves truthful ultimate state
- E2E or smoke tests:
  - start from composer, send feedback from badge, stop from badge, verify
    `/human-feedback` still reaches the same loop
- Edge-case coverage mapping:
  - blank feedback
  - stop during active cycle
  - reconnect while active
  - command fallback parity

## UI Implementation Plan
- Behavior logic modules:
  - ultimate projection state
  - composer send-mode resolution
  - badge feedback controls
- Component structure:
  - composer toggle
  - header badge/dropdown
  - human-feedback compatibility path
- Accessibility implementation plan:
  - toggles and badge controls are keyboard-operable with clear labels
- Visual regression capture plan:
  - armed state, active state, stopping state, dropdown open state

## Rollout and Risk Mitigation
- Rollback strategy: typed controls are additive; command-based ultimate remains
  available if the new UI path regresses.
- Feature flags/toggles: none required.
- Observability checks: trace ultimate start/feedback/stop actions and include
  the resulting projection state in runtime logs when practical.

## Validation Commands
```bash
pnpm --dir shipyard test -- tests/ultimate-mode.test.ts tests/ui-runtime.test.ts tests/ui-view-models.test.ts
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
