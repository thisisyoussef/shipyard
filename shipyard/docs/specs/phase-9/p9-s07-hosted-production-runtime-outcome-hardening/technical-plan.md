# Technical Plan

## Metadata
- Story ID: P9-S07
- Story Title: Hosted Production Runtime Outcome Hardening
- Author: Codex
- Date: 2026-03-26

## Proposed Design
- Components/modules affected:
  - `shipyard/src/agents/coordinator.ts`
  - `shipyard/src/engine/graph.ts`
  - `shipyard/src/engine/browser-evaluator.ts`
  - `shipyard/src/preview/supervisor.ts`
  - hosted runtime/config docs such as
    `shipyard/docs/architecture/hosted-railway.md`
  - regression coverage such as `shipyard/tests/graph-runtime.test.ts`,
    `shipyard/tests/ui-runtime.test.ts`, or hosted/manual smoke fixtures
- Public interfaces/contracts:
  - hosted verification capability contract
  - dev-server readiness detection contract
  - trace/runtime metadata for degraded hosted verification
  - operator-facing docs for Railway browser dependencies and fallback behavior
- Data flow summary: the hosted runtime classifies verification capabilities
  before recovery begins, runs command or browser checks that can actually
  execute in the current environment, recognizes ready long-lived preview
  servers as success, and only escalates into recovery when code evidence
  shows the target itself is broken.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - hosted Railway runtime
  - durable hosted workspace
  - lightweight access token gate
  - typed production deploy flow
  - trustworthy two-URL UX
  - hosted outcome reliability that matches local expectations
- Story ordering rationale: this story belongs after the initial hosted pack is
  implemented because it hardens the already-shipped Railway path using real
  trace evidence from production.
- Gaps/overlap check: this story owns hosted verification degradation,
  readiness semantics, and recovery guardrails. It does not reopen access
  control, file upload, or deploy UX scope.
- Whole-pack success signal: the public hosted runtime remains credible even
  when its environment is partially degraded, and traces explain whether the
  fault belongs to the app or the host.

## Architecture Decisions
- Decision: capability-detect browser verification in hosted mode and degrade
  explicitly when required dependencies are unavailable.
- Alternatives considered:
  - keep unconditional browser verification and rely on retries
  - disable browser verification everywhere
  - require browser dependencies only through undocumented provider setup
- Rationale: hosted Shipyard needs honest behavior in degraded environments
  without weakening healthy local flows.
- Decision: treat command-based dev-server readiness as a positive signal once
  the expected port or ready URL is reachable, even if the server process stays
  alive past the harness timeout.
- Alternatives considered:
  - require command exit for success
  - switch all verification to `vite preview` or static builds only
- Rationale: preview servers are intentionally long-lived, so readiness should
  be modeled separately from process completion.
- Decision: gate recovery loops on code-failure evidence rather than any
  verifier failure.
- Alternatives considered:
  - preserve the current recover-on-any-failure behavior
  - disable recovery in hosted mode entirely
- Rationale: Shipyard still needs recovery for real code failures, but
  infra-only failures should not cause destructive edit churn.

## Data Model / API Contracts
- Request shape:
  - existing verification request plus hosted capability context
  - command verification can report ready URL, ready port, or ready log match
- Response shape:
  - verification result records capability status, degraded reason, and
    whether the result reflects code failure or environment failure
  - traces/logs include selected verification mode and recovery eligibility
- Storage/index changes:
  - no new durable storage format required
  - optional trace metadata or structured runtime notes for degraded-hosted
    verification outcomes

## Dependency Plan
- Existing dependencies used:
  - coordinator verification planning
  - graph/runtime verification execution
  - browser evaluator
  - preview supervisor and existing trace plumbing
- New dependencies proposed (if any):
  - prefer none; first choice is capability detection plus better semantics
- Risk and mitigation:
  - Risk: degrading browser verification hides real UI regressions.
  - Mitigation: keep explicit degraded markers, preserve code-failure checks,
    and add targeted hosted smoke coverage.
  - Risk: ready-server heuristics produce false positives.
  - Mitigation: require concrete evidence such as reachable URL, port, or
    trusted readiness output.

## Test Strategy
- Unit tests:
  - browser capability classification in hosted mode
  - long-lived dev-server readiness detection
  - recovery gating for infra-only verifier failures
- Integration tests:
  - existing hosted target with preview available and browser dependencies
    missing should degrade safely without blocked-file churn
  - actual build or render failures should still remain recoverable or fail
    closed as code issues
- E2E or smoke tests:
  - hosted Railway replay or smoke using a previewable React/Vite target
  - trace inspection confirms degraded environment metadata and a bounded
    recovery count
- Edge-case coverage mapping:
  - preview already running from a persisted hosted target
  - command ready before timeout but process still alive
  - browser unavailable plus successful build
  - healthy browser runtime with real render failure

## UI Implementation Plan (if applicable)
- Behavior logic modules:
  - workbench and trace surfaces may need a clear degraded-verification status
- Component structure:
  - use existing status and activity surfaces before inventing new hosted-only
    panels
- Accessibility implementation plan:
  - degraded verification states must stay visible in text, not color only
- Visual regression capture plan:
  - optional workbench capture if a new degraded-status UI state lands

## Rollout and Risk Mitigation
- Rollback strategy: keep hosted degradation logic centralized so Shipyard can
  fall back to the current verification plan if a healthy environment regresses.
- Feature flags/toggles: optional hosted env override to force browser
  verification off or mark browser capability unavailable during rollout.
- Observability checks: traces should show verification mode, capability
  status, recovery count, and whether a failure was classified as environment
  or code.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
