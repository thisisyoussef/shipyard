# Feature Spec

## Metadata
- Story ID: P9-S01
- Story Title: Hosted UI Runtime and Railway Service Contract
- Author: Codex
- Date: 2026-03-25
- Related PRD/phase gate: Phase 9 hosted Shipyard and public deploy

## Problem Statement

Shipyard's browser runtime is still local-first. The UI server defaults to
loopback networking, the current startup path does not expose a Railway-ready
host/port contract, and the browser workflow assumes a local filesystem target.
For a public demo or assignment, Shipyard needs one provider-friendly launch
contract that can run on Railway, bind to provider networking, and keep all
generated project files under a predictable server-side workspace path.

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
- How this story or pack contributes to the overall objective set: This story
  establishes the hosted runtime baseline that every later access-control and
  deploy flow depends on.

## User Stories
- As an evaluator, I want to open one public Shipyard URL and use the browser
  workbench without starting anything locally.
- As the host operator, I want the Railway runtime to use a fixed
  server-side workspace path so generated code lands in a known place that the
  deploy tool can use later.

## Acceptance Criteria
- [ ] AC-1: Shipyard exposes a documented hosted start contract for browser
  mode, including provider-compatible host/port handling and a fixed target or
  targets directory path appropriate for Railway.
- [ ] AC-2: Hosted startup honors provider networking such as `PORT` instead
  of only local Shipyard-specific defaults, and it can bind to a non-loopback
  host when configured.
- [ ] AC-3: On first boot, Shipyard creates the configured hosted
  workspace/target directory if missing and can still enter the target-manager
  or empty-target flow cleanly.
- [ ] AC-4: The existing UI runtime still serves the built SPA, `/api/health`,
  and `/ws` from one service process.
- [ ] AC-5: Provider-facing docs/config capture the exact Railway build/start
  commands and required env vars for the hosted runtime.
- [ ] AC-6: Existing local CLI and local `--ui` behavior remain backward
  compatible when hosted settings are absent.

## Edge Cases
- Railway sets `PORT`, but no explicit Shipyard UI port env var is present.
- The hosted workspace path does not exist yet on first boot.
- A provider restart wipes the filesystem and Shipyard must recreate the
  workspace without operator intervention.
- The built UI bundle is missing or stale when the service starts.
- A health check hits the service before any browser client has connected.

## Non-Functional Requirements
- Security: hosted startup should not require committed secrets or expose them
  in logs.
- Reliability: the hosted runtime must boot deterministically against an empty
  workspace path.
- Observability: health checks and startup logs should make provider debugging
  possible.
- Compatibility: local development defaults must remain intact.

## UI Requirements (if applicable)
- Required states: not applicable in this infrastructure-first story.

## Out of Scope
- Access control for the public URL.
- Deployment of generated target apps.
- Public preview tunnels or Lovable-style sandbox URLs.
- Durable storage across Railway redeploys inside this story. That lands
  separately in `P9-S05`.

## Done Definition
- Shipyard has one credible Railway deployment contract for browser mode.
- The hosted runtime can boot against a fixed server-side workspace path.
- The repo documents how to start the public Shipyard service without
  disrupting existing local workflows.
