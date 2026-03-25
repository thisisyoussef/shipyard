# Feature Spec

## Metadata
- Story ID: P9-S04
- Story Title: Deploy UX and Public URL Surfacing
- Author: Codex
- Date: 2026-03-25
- Related PRD/phase gate: Phase 9 hosted Shipyard and public deploy

## Problem Statement

Even with a deploy tool, hosted operators still need a trustworthy browser
experience that makes deploy available, reports status, and keeps the public
production URL distinct from the Railway-hosted Shipyard UI and any preview
surface. Right now the workbench has no deployment state, no first-class
deploy action, and no place to recover the last production URL after refresh.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Run Shipyard's browser runtime as a public Railway service with
  a predictable server-side workspace.
- Objective 2: Protect the hosted Shipyard URL with a lightweight access gate.
- Objective 3: Let Shipyard deploy the current target project to a public URL
  from inside the target directory.
- Objective 4: Make the hosted Shipyard URL and deployed target-app URL
  clearly distinct in the UX.
- How this story or pack contributes to the overall objective set: This story
  turns the hosted runtime and deploy primitive into a clear, trustworthy
  operator experience.

## User Stories
- As a hosted Shipyard user, I want a visible deploy action in the browser so I
  do not have to phrase the exact prompt every time I want a production URL.
- As a reviewer, I want the workbench to show whether I am looking at the
  hosted Shipyard URL or the deployed target-app URL so I can share the right
  link confidently.

## Acceptance Criteria
- [ ] AC-1: The browser workbench exposes a deploy action when a code target is
  active and disables it clearly when deploy prerequisites are missing or a
  deploy is already in flight.
- [ ] AC-2: Deploy requests travel through a first-class backend contract and
  surface in activity/live status without requiring the model to invent all UI
  copy.
- [ ] AC-3: The UI shows explicit deploy states: idle, deploying, success, and
  error.
- [ ] AC-4: On success, the latest production URL is shown in the workbench and
  clearly labeled as the deployed target-app URL, separate from the hosted
  Shipyard URL and any preview URL.
- [ ] AC-5: The latest deploy result survives refresh/reconnect for the active
  target so the operator can recover the share link later.
- [ ] AC-6: Failure states surface provider output excerpts and next-step
  guidance without leaking secrets.
- [ ] AC-7: The UI copy stays truthful on hosted Railway and does not imply the
  current preview panel is automatically a public cloud preview.
- [ ] AC-8: CLI and natural-language deploy flows continue to work via the
  underlying tool surface even if the browser action becomes the primary UX.

## Edge Cases
- A deploy is requested while the agent is already busy on another turn.
- No target is selected yet.
- `VERCEL_TOKEN` is missing even though the deploy button is visible.
- The operator switches targets after a successful deploy.
- Multiple deploys happen in one session and the latest URL must win.
- Preview is unavailable or local-only while production deploy still succeeds.

## Non-Functional Requirements
- Accessibility: deploy actions and resulting links must be keyboard and
  screen-reader accessible.
- Reliability: deploy state must survive refresh/reconnect for the active
  target.
- Observability: deploy progress and failure summaries should appear in the
  same evidence surfaces as other Shipyard work.
- Truthfulness: URL labels and copy must not overpromise public preview
  behavior.

## UI Requirements (if applicable)
- Required states: idle, prerequisites missing, deploying, success, and error.
- Accessibility contract: the deploy button, status text, and production URL
  link are all reachable by keyboard and announced clearly.
- Design token contract: deploy surfaces should reuse the current workbench
  tokens and shell patterns.
- Visual-regression snapshot states: disabled deploy, deploying, successful
  deploy with URL, failed deploy with error text.

## Out of Scope
- Automatic deploy after every turn.
- Cross-session deployment history dashboards.
- Environment management UI for multiple platforms.
- Replacing the local preview panel with a hosted sandbox preview.

## Done Definition
- The browser workbench has a trustworthy deploy surface.
- The latest production URL is recoverable after refresh/reconnect.
- Hosted Shipyard makes the difference between editor URL and deployed app URL
  obvious.
