# Feature Spec

## Metadata
- Story ID: P11-S07
- Story Title: Railway Hosted Runtime and Remote Workspace Integration
- Author: Codex
- Date: 2026-03-28
- Related PRD/phase gate: Phase 11 runtime factory foundations

## Problem Statement

Phase 9 established a Railway-hosted Shipyard baseline, but the new factory
pack still risks reading as local-first. Discovery, PM, TDD, GitHub branch
management, approvals, and coordinator state all need to work when Shipyard is
running on Railway with a persistent mounted workspace, not just from a local
terminal. The hosted runtime also cannot rely on local `gh auth`; it needs a
deployed-safe way to authenticate to GitHub, and it needs a clear fallback when
GitHub binding is unavailable so the project can remain manageable. Shipyard
therefore needs a Railway-hosted factory contract that reuses the existing
hosted runtime baseline, restores projects from persistent workspaces, consumes
the normalized source-control capability from `P11-S06`, and exposes clear
hosted preview or deploy state without confusing the Shipyard service URL with
the target app URL.

## Story Pack Objectives
- Objective 1: Make the same runtime factory behavior available from Railway,
  not only from local operator machines.
- Objective 2: Support hosted-safe GitHub auth and repo sync inside the Railway
  runtime without assuming interactive shell access.
- Objective 3: Preserve project manageability when hosted GitHub auth or binding
  is unavailable through an explicit degraded hosted mode.
- Objective 4: Keep the hosted Shipyard URL, private preview state, and target
  app public URLs clearly separated.
- How this story contributes to the overall objective set: it turns the pack
  from a local-only architecture sketch into a credible hosted factory path.

## User Stories
- As a hosted operator, I want to open Shipyard on Railway and run the same
  artifact, planning, and implementation flow without local shell setup.
- As a runtime owner, I want Railway-hosted projects to restore from a
  persistent volume and resume the same GitHub-backed or degraded-local state
  they had before a restart.
- As a deployment-minded user, I want GitHub-backed management to work in the
  deployed product too, not only on my laptop.
- As a fallback operator, I want the hosted project to remain usable even when
  GitHub auth is unavailable, with blocked actions called out clearly.

## Acceptance Criteria
- [x] AC-1: Shipyard defines a Railway-hosted factory runtime contract that
  builds on the Phase 9 hosted baseline and keeps all factory artifacts and
  runtime state under the persistent workspace path.
- [x] AC-2: Railway-hosted Shipyard can use a deployed-safe GitHub auth adapter
  such as OAuth, GitHub App, or service token instead of relying on local `gh`.
- [x] AC-3: Hosted projects can clone, pull, resume, and sync canonical GitHub
  bindings inside the Railway workspace when auth is available.
- [x] AC-4: If GitHub auth or binding is unavailable in hosted mode, Shipyard
  still creates or resumes a managed local workspace, records degraded-source
  status, and keeps non-merge phases usable.
- [x] AC-5: Hosted runtime status clearly distinguishes the Shipyard service
  URL, any private preview URL, and the target app's public deployment URL.
- [x] AC-6: Railway-specific env vars, volume requirements, health checks, and
  secret requirements are explicit for model provider, GitHub capability,
  deploy tokens, and persistent workspace state.
- [x] AC-7: Local and hosted runtimes share the same artifact, source-control,
  and coordinator contracts so later stories do not fork behavior by platform.

## Edge Cases
- Empty/null inputs: a fresh hosted workspace with no bound repo still enters a
  valid degraded local mode.
- Boundary values: a single small project uses the same hosted restore contract
  as a larger multi-story workspace.
- Invalid/malformed data: missing volume mount, stale repo binding, or a hosted
  auth adapter with insufficient scopes fails clearly and preserves workspace
  state.
- External-service failures: GitHub auth expiry, Railway restart, missing public
  domain, or browser dependency gaps degrade specific capabilities without
  pretending the whole project is lost.

## Non-Functional Requirements
- Security: hosted secrets stay in provider configuration, not committed files
  or user-visible traces.
- Reliability: hosted workspace restore and degraded-source recovery must be
  restart-safe.
- Observability: hosted auth mode, workspace mount health, preview status, and
  deploy status must be visible in runtime traces and health surfaces.
- Compatibility: the same runtime contracts must still work locally when Railway
  env vars are absent.

## Out of Scope
- A new hosted UI pack or board design.
- Non-Railway infrastructure providers in this story.
- Full target-app production deployment logic beyond surfacing existing deploy
  outputs and dependencies.

## Done Definition
- Shipyard has one credible Railway-hosted factory runtime contract that can
  manage GitHub-backed or degraded-local projects without relying on local shell
  auth assumptions.

## Implementation Evidence

- `shipyard/src/hosting/contracts.ts`: defines the hosted runtime profile,
  persistent workspace binding, degraded hosted fallback, hosted availability
  state, and compact workbench projection used by the Railway-backed runtime.

  ```ts
  export const hostedRuntimeModeSchema = z.enum([
    "local",
    "railway-hosted",
    "degraded-hosted",
  ]);
  ```

- `shipyard/src/hosting/store.ts`: persists hosted runtime metadata to
  `.shipyard/hosting/runtime.json` with atomic writes so Railway restarts can
  resume the same mounted workspace, hosted status, and last resumed session.

- `shipyard/src/hosting/runtime.ts`: resolves Railway-hosted mode from the
  mounted-workspace and public-domain contract, normalizes hosted-safe GitHub
  adapter availability through the `P11-S06` source-control runtime, restores
  existing session or repo binding state, records degraded hosted mode when
  auth or binding is missing, and keeps planning/TDD/code turns available even
  when PR-specific actions are blocked.

- `shipyard/src/ui/contracts.ts`,
  `shipyard/src/ui/workbench-state.ts`,
  `shipyard/src/ui/health.ts`, and
  `shipyard/src/ui/server.ts`: thread hosted runtime state into the browser
  workbench and health diagnostics so the service URL, private preview URL, and
  public deployment URL are surfaced separately for later board/coordinator
  consumers.

- `.github/workflows/railway-main-deploy.yml` and
  `shipyard/docs/architecture/hosted-railway.md`: document and enforce the
  Railway env and secret contract for persistent workspaces, hosted-safe GitHub
  auth, Vercel deploy tokens, and `/api/health`.

- `shipyard/tests/hosting-runtime.test.ts`,
  `shipyard/tests/ui-runtime.test.ts`, and
  `shipyard/tests/railway-config.test.ts`: add focused coverage for hosted
  profile resolution, degraded hosted fallback, restart-safe restore, hosted
  availability projection, and Railway workflow env sync.

## LangSmith / Monitoring

- Fresh deterministic finish-check traces on project
  `shipyard-p11-s07-finishcheck`:
  - hosted happy-path trace:
    `019d371a-2953-7000-8000-05a556e123ca`
  - degraded hosted trace:
    `019d371a-5358-7000-8000-05f6096dd268`
- Commands reviewed:
  - traced runtime script via
    `pnpm --dir shipyard exec node --import tsx -`
  - `pnpm --dir shipyard exec langsmith trace list --project "$LANGSMITH_PROJECT" --last-n-minutes 30 --limit 5 --full`
  - `pnpm --dir shipyard exec langsmith run list --project "$LANGSMITH_PROJECT" --trace-ids <trace-ids> --full`
  - `pnpm --dir shipyard exec langsmith run list --project "$LANGSMITH_PROJECT" --last-n-minutes 30 --error --limit 10 --full`
  - `pnpm --dir shipyard exec langsmith insights list --project "$LANGSMITH_PROJECT" --limit 3`
- The reviewed traces confirmed:
  - the hosted happy path restored a persisted Railway workspace, resolved the
    `github-token` hosted-safe adapter, reused the canonical
    `acme/shipyard-target` binding, and published separate Shipyard service,
    private preview, and public deployment URLs
  - the degraded hosted path still restored the persistent workspace, marked
    auth as `degraded-local`, and blocked only
    `attach_repository`, `open_pull_request`, and `merge_pull_request` while
    leaving planning, TDD, and standard code turns available
- `langsmith run list --project "$LANGSMITH_PROJECT" --last-n-minutes 30 --error --limit 10 --full`
  returned `[]` for the isolated finish-check project.
- `langsmith insights list --project "$LANGSMITH_PROJECT" --limit 3` returned
  `null` for the isolated finish-check project.
