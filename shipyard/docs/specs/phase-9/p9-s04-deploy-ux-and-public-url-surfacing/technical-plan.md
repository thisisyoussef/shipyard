# Technical Plan

## Metadata
- Story ID: P9-S04
- Story Title: Deploy UX and Public URL Surfacing
- Author: Codex
- Date: 2026-03-25

## Proposed Design
- Components/modules affected:
  - `shipyard/src/ui/contracts.ts`
  - `shipyard/src/ui/events.ts`
  - `shipyard/src/ui/server.ts`
  - `shipyard/src/engine/state.ts` or a small deployment-artifact module under
    `shipyard/src/`
  - `shipyard/ui/src/App.tsx`
  - `shipyard/ui/src/ShipyardWorkbench.tsx`
  - `shipyard/ui/src/TargetHeader.tsx`
  - `shipyard/ui/src/panels/PreviewPanel.tsx` or a dedicated deploy-status
    surface
  - `shipyard/tests/ui-runtime.test.ts`
  - `shipyard/tests/ui-workbench.test.ts`
- Public interfaces/contracts:
  - first-class frontend deploy request contract
  - deploy status/result view model
  - persisted latest-deploy summary for the active target
- Data flow summary: the user clicks Deploy in the workbench, the frontend
  sends a dedicated deploy request, the backend executes the deploy tool and
  streams deploy state, the latest result is persisted for the active target,
  and the UI surfaces the resulting production URL alongside clear labels.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - hosted Railway runtime
  - lightweight access token gate
  - typed production deploy flow
  - trustworthy two-URL UX
- Story ordering rationale: this story comes last because it should present the
  real hosted/auth/deploy contracts instead of guessing before they exist.
- Gaps/overlap check: this story owns backend/UI wiring and persisted latest
  deploy status, not provider command execution itself.
- Whole-pack success signal: a hosted user can trigger deploy and recover the
  resulting public URL from the workbench without ambiguity.

## Architecture Decisions
- Decision: add a first-class deploy request/response path for the workbench
  instead of relying only on normal language instructions to reach the tool.
- Alternatives considered:
  - make users type `deploy` into the composer every time
  - hide deploy status only inside transcript text
- Rationale: hosted operators need a deterministic, visible action and a stable
  place to recover the production URL.
- Decision: persist only the latest deploy summary needed for recovery and URL
  sharing.
- Alternatives considered:
  - keep deploy results in transient memory only
  - build a full deployment history system
- Rationale: the simple assignment path needs recoverability, not a full deploy
  dashboard.

## Data Model / API Contracts
- Request shape:
  - first-class deploy request from the browser, likely including platform
    choice with `vercel` default
- Response shape:
  - idle or disabled state
  - in-flight deploy state
  - success result with production URL
  - error result with safe log excerpt
- Storage/index changes:
  - persist the latest deploy summary for the active target, either in session
    state or a small `.shipyard/deployments/` artifact

## Dependency Plan
- Existing dependencies used:
  - current UI websocket contracts
  - current session persistence
  - deploy tool from `P9-S03`
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: the UI confuses preview and production URLs.
  - Mitigation: use explicit labels and keep production URL surfacing distinct
    from preview copy and controls.

## Test Strategy
- Unit tests:
  - deploy-state reducer/view-model updates
  - latest-deploy persistence helpers
- Integration tests:
  - frontend deploy request to backend status updates
  - refresh/reconnect recovering the latest production URL
- E2E or smoke tests:
  - hosted browser deploy click-through with a real provider token when access
    exists
- Edge-case coverage mapping:
  - deploy while agent busy
  - missing provider token
  - target switch after deploy
  - preview unavailable but production deploy succeeds

## UI Implementation Plan (if applicable)
- Behavior logic modules:
  - App-level deploy request handling and state hydration
- Component structure:
  - add a deploy action near the target header or preview surface, plus a small
    production-URL status block
- Accessibility implementation plan:
  - keyboard-activatable deploy control, descriptive status text, and a labeled
    production URL link
- Visual regression capture plan:
  - disabled, deploying, success, and error deploy states

## Rollout and Risk Mitigation
- Rollback strategy: the deploy tool remains available even if the first-class
  browser control must be hidden or reverted.
- Feature flags/toggles: the deploy button can be conditioned on an available
  code target and provider prerequisites.
- Observability checks: deploy state changes should appear in both websocket
  activity and persisted latest-deploy state for reconnect recovery.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
