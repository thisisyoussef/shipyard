# Feature Spec

## Metadata
- Story ID: P9-S07
- Story Title: Hosted Production Runtime Outcome Hardening
- Author: Codex
- Date: 2026-03-26
- Related PRD/phase gate: Phase 9 hosted Shipyard and public deploy

## Problem Statement

Hosted Shipyard can currently produce worse outcomes than comparable local
runs even when the core model prompt and coordinator logic are similar. The
observed Railway failure class is environmental: browser verification assumes a
launchable Playwright/Chromium runtime, long-lived dev servers are treated as
failures when they stay alive past the command timeout, and the resulting
infra-only verifier failures push Shipyard into planner-backed recovery loops
that churn `src/App.tsx` until the file blocks. Production needs a hosted-safe
runtime path that degrades honestly when verifier capabilities are missing
instead of letting runtime scaffolding damage otherwise decent code.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Run Shipyard's browser runtime as a public Railway service with
  a predictable server-side workspace.
- Objective 2: Protect the hosted Shipyard URL with a lightweight access gate.
- Objective 3: Let Shipyard deploy the current target project to a public URL
  from inside the target directory.
- Objective 4: Make the hosted Shipyard URL and deployed target-app URL
  clearly distinct in the UX.
- Objective 5: Persist hosted project files across sessions, service restarts,
  and Railway redeploys, starting with a mounted volume at `/app/workspace`.
- Objective 6: Let hosted users upload local reference files into the chat
  flow so Shipyard can inspect them without relying on browser-only filesystem
  paths.
- Objective 7: Keep hosted runtime outcomes aligned with local quality by
  failing safely when browser-verification capabilities or preview semantics
  degrade in production.
- How this story or pack contributes to the overall objective set: This story
  closes the hosted-runtime credibility gap after the first six hosted stories
  shipped by making production verification and recovery behavior honest.

## User Stories
- As a hosted Shipyard user, I want production turns to fail clearly when the
  environment is degraded instead of silently corrupting the working file with
  recovery churn.
- As an operator comparing local and Railway quality, I want the hosted
  runtime to distinguish infrastructure failures from target-code failures so
  trace evidence points to the real cause.

## Acceptance Criteria
- [ ] AC-1: Hosted verification detects missing or unavailable browser
  evaluator capabilities and records an explicit degraded-environment outcome
  instead of repeatedly retrying browser checks that cannot succeed.
- [ ] AC-2: Verification treats a long-lived dev server as successful when the
  server reaches a ready state or exposes the expected URL before the process
  timeout, rather than marking the check failed only because the process stays
  alive.
- [ ] AC-3: Infra-only verification failures on hosted runs do not trigger
  destructive recovery loops or blocked-file handoffs unless there is separate
  evidence of a real code failure.
- [ ] AC-4: Trace or runtime metadata distinguishes at least these cases:
  browser unavailable, command ready, code failure, and degraded hosted
  verification mode.
- [ ] AC-5: Regression coverage reproduces the Railway failure class for an
  existing previewable target and proves Shipyard now degrades safely instead
  of spiraling through repeated `plan -> act -> verify -> recover` cycles.
- [ ] AC-6: Hosted runtime docs explain the browser dependency contract and
  the fallback behavior when Railway lacks those dependencies.

## Edge Cases
- Browser verification is unavailable, but command verification shows the app
  built successfully.
- `npm run dev` or a similar preview command starts successfully, emits a
  ready URL, and then remains alive until the harness timeout.
- A real compile error or browser-render failure occurs while the hosted
  environment is otherwise healthy.
- The target already has a running preview and persisted workspace state from a
  prior hosted session.
- Hosted runtime capability changes across deploys because a provider image or
  package set changes.

## Non-Functional Requirements
- Reliability: hosted runs must fail closed for real app issues while failing
  safe for environment-only verification gaps.
- Observability: traces and logs must clearly separate runtime-environment
  degradation from model/code quality problems.
- Performance: narrow hosted edits should avoid expensive recover loops when
  the verifier is the only broken component.
- Compatibility: local CLI and local UI flows must keep the current richer
  verification behavior when their environment supports it.

## UI Requirements (if applicable)
- Required states:
  - hosted verification degraded
  - command-ready verification success
  - explicit infra failure details when browser verification is unavailable

## Out of Scope
- Replacing the core model provider or prompt strategy.
- A full redesign of planner-vs-lightweight routing across every local and
  hosted scenario.
- Multi-container preview sandboxes or per-session browser infrastructure.
- Broad deploy-provider changes unrelated to hosted verification safety.

## Done Definition
- Hosted Railway runs can distinguish degraded environment failures from code
  failures, and they no longer enter destructive recovery spirals because a
  browser dependency or long-lived server check was misclassified.
