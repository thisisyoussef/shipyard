# Feature Spec

## Metadata
- Story ID: P9-S03
- Story Title: Target Deploy Tool and Vercel Delivery Contract
- Author: Codex
- Date: 2026-03-25
- Related PRD/phase gate: Phase 9 hosted Shipyard and public deploy

## Problem Statement

Shipyard can edit target files and show local progress, but it has no
first-class way to publish a built target project to a public URL. Asking the
model to improvise shell commands would blur timeout rules, secret handling,
and URL parsing. Shipyard needs a typed deploy tool that can publish the
current target and return a reliable shareable production URL.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Run Shipyard's browser runtime as a public Railway service with
  a predictable server-side workspace.
- Objective 2: Protect the hosted Shipyard URL with a lightweight access gate.
- Objective 3: Let Shipyard deploy the current target project to a public URL
  from inside the target directory.
- Objective 4: Make the hosted Shipyard URL and deployed target-app URL
  clearly distinct in the UX.
- How this story or pack contributes to the overall objective set: This story
  adds the actual publish primitive that turns a generated project into a
  public app URL.

## User Stories
- As an operator, I want to tell Shipyard to deploy the current target to
  Vercel so I can get a public production URL without leaving the session.
- As the host operator, I want deploy failures to be explicit and secret-safe
  so the hosted service never leaves deployment status ambiguous.

## Acceptance Criteria
- [ ] AC-1: A first-class deploy tool is added to the code-phase tool surface
  with a typed input contract instead of relying on ad hoc `run_command`.
- [ ] AC-2: The first supported platform is `vercel`, which runs a
  non-interactive production deploy from the current target directory using
  `VERCEL_TOKEN`.
- [ ] AC-3: The deploy tool supports a longer bounded execution window than the
  generic 120-second `run_command` cap and returns truncated structured logs on
  failure.
- [ ] AC-4: Successful deploys return at least platform, production URL, and
  enough metadata for activity, tracing, and later UI surfacing.
- [ ] AC-5: Missing provider token, missing CLI, unsupported platform choice,
  and provider build/deploy failures all return actionable error results
  without echoing secrets.
- [ ] AC-6: Deploy events are traceable just like other Shipyard tool calls.
- [ ] AC-7: Local use and hosted use both call the same deploy tool contract.

## Edge Cases
- The target directory is not actually deployable to Vercel.
- The deploy command emits multiple candidate URLs.
- The provider CLI tries to prompt interactively despite the non-interactive
  contract.
- The deploy exceeds the normal command timeout window.
- The same target is deployed multiple times in one session.

## Non-Functional Requirements
- Security: provider tokens must never appear in tool output, traces, or UI.
- Reliability: deployment failures must be recoverable and clearly attributable
  to config vs app build issues.
- Observability: deploy success/failure should show up in traces and activity
  just like file/tool work.
- Portability: the tool contract should be extensible to future providers even
  if only `vercel` is implemented first.

## UI Requirements (if applicable)
- Required states: not applicable in this tool-first story.

## Out of Scope
- GitHub repo sync before deploy.
- Preview deployments or branch deploys.
- Netlify deployment support.
- Railway deployment of the generated target app.
- Automatic deploy after every code edit.

## Done Definition
- Shipyard has a typed deploy primitive for the active target.
- Vercel production deploys can run non-interactively from Shipyard.
- Failures stay actionable and secret-safe.
