# Technical Plan

## Metadata
- Story ID: P9-S01
- Story Title: Hosted UI Runtime and Railway Service Contract
- Author: Codex
- Date: 2026-03-25

## Proposed Design
- Components/modules affected:
  - `shipyard/package.json`
  - `shipyard/src/bin/shipyard.ts`
  - `shipyard/src/ui/server.ts`
  - provider config such as `shipyard/Dockerfile`, `shipyard/Procfile`, or
    `shipyard/railway.json`
  - `shipyard/tests/ui-runtime.test.ts`
  - deploy/readme docs that describe Railway startup
- Public interfaces/contracts:
  - hosted `shipyard --ui` launch contract
  - host/port override contract for public runtime use
  - fixed hosted workspace/target path contract
  - minimal readiness/health response contract
- Data flow summary: Railway starts Shipyard in browser mode, Shipyard resolves
  the fixed workspace path, creates it if needed, binds the existing HTTP + WS
  server to provider networking, and serves the same SPA/session model through
  one public service.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - hosted Railway runtime
  - lightweight access token gate
  - typed production deploy flow
  - trustworthy two-URL UX
- Story ordering rationale: this story must land first because later auth and
  deploy work depend on a real hosted runtime contract.
- Gaps/overlap check: this story owns provider startup and workspace wiring
  only. It does not include access control or deploy tooling.
- Whole-pack success signal: later stories can run on top of a public Shipyard
  service instead of a purely local developer workflow.

## Architecture Decisions
- Decision: extend the existing UI runtime with hosted host/port handling
  rather than wrapping it in a second server framework.
- Alternatives considered:
  - introduce a separate Express app
  - run a reverse-proxy sidecar just for Railway
- Rationale: the current HTTP + WebSocket server already owns health, asset
  serving, and session bootstrap. Duplicating that surface would add needless
  drift.
- Decision: accept `/app/workspace`-style provider-local storage for the first
  hosted pack.
- Alternatives considered:
  - remote object storage
  - per-session external volumes
- Rationale: the user story targets a simple assignment/demo path, not durable
  multi-tenant infrastructure.

## Data Model / API Contracts
- Request shape:
  - CLI flags or env for host/port
  - fixed target/workspace path supplied by startup config
- Response shape:
  - existing startup lines plus hosted host/port clarity
  - minimal health payload suitable for Railway readiness checks
- Storage/index changes:
  - fixed hosted workspace directory such as `/app/workspace`
  - no new persisted artifact format in this story

## Dependency Plan
- Existing dependencies used:
  - current Node HTTP server
  - current `ws` runtime
  - current session/discovery bootstrap
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: hosted configuration accidentally breaks local defaults.
  - Mitigation: keep host/port overrides opt-in and preserve existing local
    defaults when provider settings are absent.

## Test Strategy
- Unit tests:
  - host/port resolution rules
  - hosted workspace initialization
- Integration tests:
  - UI runtime boot with hosted host/port overrides
  - `/api/health` response under hosted startup
- E2E or smoke tests:
  - manual Railway smoke after config lands
- Edge-case coverage mapping:
  - missing workspace path on first boot
  - provider `PORT` only
  - missing built UI bundle
  - early health checks

## UI Implementation Plan (if applicable)
- Behavior logic modules:
  - not applicable beyond startup/logging honesty
- Component structure:
  - not applicable in this story
- Accessibility implementation plan:
  - not applicable in this story
- Visual regression capture plan:
  - not applicable in this story

## Rollout and Risk Mitigation
- Rollback strategy: keep hosted startup behind explicit provider config so
  local Shipyard users can continue using the existing entry path.
- Feature flags/toggles: optional host/port overrides and provider startup
  scripts are sufficient for the initial rollout.
- Observability checks: startup logs plus `/api/health` should confirm the
  hosted session, workspace path, and runtime readiness.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
