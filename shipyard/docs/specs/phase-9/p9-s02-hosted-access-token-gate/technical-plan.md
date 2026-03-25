# Technical Plan

## Metadata
- Story ID: P9-S02
- Story Title: Hosted Access Token Gate
- Author: Codex
- Date: 2026-03-25

## Proposed Design
- Components/modules affected:
  - `shipyard/src/ui/server.ts`
  - `shipyard/src/ui/contracts.ts`
  - a small auth/access helper under `shipyard/src/ui/`
  - `shipyard/ui/src/App.tsx`
  - one small hosted-access component or inline gate in the current SPA
  - `shipyard/tests/ui-runtime.test.ts`
  - UI component tests or render tests as needed
- Public interfaces/contracts:
  - `SHIPYARD_ACCESS_TOKEN` env var
  - optional `?access_token=` bootstrap path
  - locked/unlocked hosted browser flow
- Data flow summary: the hosted page loads, the app checks for a cached or
  bootstrap token, the websocket/auth bootstrap is attempted, and only valid
  clients receive session state or can submit instructions.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - hosted Railway runtime
  - durable hosted workspace
  - lightweight access token gate
  - typed production deploy flow
  - trustworthy two-URL UX
- Story ordering rationale: this story follows the hosted runtime baseline so
  the public URL can be protected before broader sharing.
- Gaps/overlap check: this story owns access protection only. It does not add
  user accounts, rate limiting, or provider deployment logic.
- Whole-pack success signal: the public Shipyard URL is shareable for demos
  without leaving the agent loop open to arbitrary traffic.

## Architecture Decisions
- Decision: use a lightweight shared-secret gate at the UI bootstrap/transport
  boundary rather than adding a full auth system.
- Alternatives considered:
  - query-param-only auth with no login UI
  - HTTP Basic Auth at a reverse proxy
  - full account/session management
- Rationale: the pack targets a simple assignment-safe gate, not production
  identity.
- Decision: keep the gate opt-in via `SHIPYARD_ACCESS_TOKEN`.
- Alternatives considered:
  - always require a token
  - separate hosted-only build flavor
- Rationale: local development should stay frictionless.

## Data Model / API Contracts
- Request shape:
  - optional access token provided via bootstrap query or a small login form
  - authenticated websocket bootstrap before normal status/instruction flow
- Response shape:
  - locked-state UI until auth succeeds
  - clear invalid-token failure state without secret leakage
- Storage/index changes:
  - no token persistence inside `.shipyard/`
  - browser-local temporary storage for reconnect convenience is acceptable

## Dependency Plan
- Existing dependencies used:
  - current HTTP + websocket runtime
  - current SPA shell
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: the token leaks through query strings, logs, or traces.
  - Mitigation: strip bootstrap query params from the visible URL, redact
    token-bearing errors, and never persist the token in Shipyard artifacts.

## Test Strategy
- Unit tests:
  - token validation helper
  - token redaction helper
- Integration tests:
  - websocket/session rejection when missing or invalid
  - successful unlock and reconnect with a valid token
- E2E or smoke tests:
  - hosted login flow in the browser once the runtime is deployed
- Edge-case coverage mapping:
  - stale browser token
  - token rotation
  - direct unauthenticated websocket attempts
  - bootstrap query-param cleanup

## UI Implementation Plan (if applicable)
- Behavior logic modules:
  - App-level locked/unlocked hosted access state
- Component structure:
  - a small login gate ahead of the main workbench shell
- Accessibility implementation plan:
  - labeled password-style input, submit button, keyboard submit, and polite
    invalid-token feedback
- Visual regression capture plan:
  - locked, invalid, and unlocked states

## Rollout and Risk Mitigation
- Rollback strategy: if the gate causes issues, leave `SHIPYARD_ACCESS_TOKEN`
  unset and the hosted runtime falls back to current open behavior.
- Feature flags/toggles: the env var itself is the feature gate.
- Observability checks: hosted auth failures should log a safe reason while
  keeping the token redacted.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
