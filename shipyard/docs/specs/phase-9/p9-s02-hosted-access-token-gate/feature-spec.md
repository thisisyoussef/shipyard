# Feature Spec

## Metadata
- Story ID: P9-S02
- Story Title: Hosted Access Token Gate
- Author: Codex
- Date: 2026-03-25
- Related PRD/phase gate: Phase 9 hosted Shipyard and public deploy

## Problem Statement

A public Railway URL makes Shipyard reachable from anywhere, but today anyone
who reaches the browser runtime can immediately receive session state and send
agent instructions. For an assignment or demo, Shipyard needs a minimal access
control layer that is simple enough to operate from environment variables yet
strong enough to prevent accidental open use of API credits.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Run Shipyard's browser runtime as a public Railway service with
  a predictable server-side workspace.
- Objective 2: Protect the hosted Shipyard URL with a lightweight access gate.
- Objective 3: Let Shipyard deploy the current target project to a public URL
  from inside the target directory.
- Objective 4: Make the hosted Shipyard URL and deployed target-app URL
  clearly distinct in the UX.
- How this story or pack contributes to the overall objective set: This story
  protects the public Shipyard surface so the hosted runtime is safe enough to
  share for demos and grading.

## User Stories
- As the host operator, I want to require an access token before someone can
  use the hosted agent so random visitors cannot spend provider credits.
- As an invited evaluator, I want a simple login step or bootstrap link that
  unlocks the hosted UI without creating a full account.

## Acceptance Criteria
- [ ] AC-1: When `SHIPYARD_ACCESS_TOKEN` is unset, Shipyard keeps the current
  open local behavior.
- [ ] AC-2: When `SHIPYARD_ACCESS_TOKEN` is set, the browser starts in a
  locked state until the user provides a matching token through a simple login
  flow or a one-time `?access_token=` bootstrap.
- [ ] AC-3: Unauthenticated clients cannot receive session state, run
  instructions, or open a functional websocket turn loop.
- [ ] AC-4: The browser can remember the accepted token long enough for
  refresh/reconnect convenience, and it clears any bootstrap query token from
  the visible URL after capture.
- [ ] AC-5: Invalid or missing tokens produce a clear error without revealing
  the configured secret.
- [ ] AC-6: Session files, traces, and tool logs never persist or echo the
  access token.
- [ ] AC-7: Hosted health checks remain minimal and do not expose session
  internals or secrets just because the app is publicly reachable.

## Edge Cases
- A browser reconnects after the websocket drops mid-session.
- The operator rotates `SHIPYARD_ACCESS_TOKEN` while a page is already open.
- A stale token is stored in local storage.
- A user shares a bootstrap link that still contains `?access_token=...`.
- A direct websocket request attempts to connect without ever loading the page.

## Non-Functional Requirements
- Security: the configured access token must never appear in traces, logs, or
  error messages.
- Reliability: reconnect behavior should remain smooth after a token has been
  accepted.
- Observability: invalid-access failures should still be diagnosable without
  exposing secrets.
- Performance: the access gate should add minimal overhead to normal startup.

## UI Requirements (if applicable)
- Required states: locked, submitting, invalid token, and unlocked.
- Accessibility contract: token entry works with keyboard only, includes a
  labeled field, and announces invalid-auth errors clearly.
- Design token contract: the gate should reuse the current Shipyard UI system
  rather than introducing a separate auth aesthetic.
- Visual-regression snapshot states: locked form, invalid token error,
  successful unlock.

## Out of Scope
- Real user accounts.
- OAuth or SSO.
- Multi-user permissions or roles.
- Rate limiting or abuse analytics.

## Done Definition
- Hosted Shipyard can require a shared secret before exposing the session and
  agent loop.
- The access gate is simple enough for assignment/demo use.
- Tokens stay out of traces, logs, and persisted session artifacts.
