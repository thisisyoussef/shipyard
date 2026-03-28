# Technical Plan

## Metadata
- Story ID: P11-S07
- Story Title: Railway Hosted Runtime and Remote Workspace Integration
- Author: Codex
- Date: 2026-03-28

## Proposed Design
- Components/modules affected:
  - `shipyard/src/hosting/`
  - `shipyard/src/bin/shipyard.ts`
  - `shipyard/src/context/`
  - `shipyard/src/preview/`
  - `shipyard/src/ui/server.ts`
  - `shipyard/src/tools/`
  - `shipyard/src/tools/target-manager/`
  - `shipyard/src/artifacts/types.ts`
  - `shipyard/railway.json`
  - `shipyard/docs/architecture/hosted-railway.md`
- Public interfaces/contracts:
  - `HostedFactoryRuntimeProfile`
  - `RemoteWorkspaceBinding`
  - `HostedSourceControlAdapter`
  - `HostedPreviewSurface`
  - `HostedAvailabilityState`
- Data flow summary: Railway boots Shipyard into browser mode, validates the
  persistent workspace contract, restores target directories and `.shipyard/`
  state, resolves the active hosted source-control capability, reopens or
  clones the project, runs factory phases against the persistent workspace, and
  publishes hosted status that clearly separates Shipyard, preview, and public
  deployment surfaces.

## Pack Cohesion and Sequencing
- Higher-level pack objectives:
  - runtime-native spec and approval flow
  - role-aware skills and agent profiles
  - PM and TDD orchestration
  - GitHub-first and Railway-hosted runtime execution
  - coordination and multi-story execution
- Story ordering rationale: this story follows `P11-S06` because hosted runtime
  execution should consume the normalized source-control contract rather than
  inventing a second auth model.
- Gaps/overlap check: this story makes the runtime hosted-capable, but it does
  not define board projection or multi-story scheduling.
- Whole-pack success signal: later task-graph and coordinator work can rely on
  one hosted execution contract instead of treating Railway as a special-case
  afterthought.

## Architecture Decisions
- Decision: build on the existing Phase 9 Railway-hosted runtime contract
  instead of creating a separate cloud-only factory runtime.
- Alternatives considered:
  - postpone hosted execution until after all local factory work ships
  - build a parallel hosted service with different contracts
- Rationale: the repo already has a credible Railway baseline, and duplicating
  the runtime would increase drift and operator confusion.
- Decision: treat hosted GitHub auth as an adapter choice under the same
  normalized source-control capability contract from `P11-S06`.
- Alternatives considered:
  - require local `gh` inside the Railway container
  - bypass the normalized source-control contract in hosted mode
- Rationale: hosted environments need non-interactive auth, and behavior should
  stay consistent across local and deployed execution.

## Data Model / API Contracts
- Request shape:
  - prepare or validate hosted runtime profile
  - restore or create remote workspace binding
  - resolve hosted source-control adapter
  - publish hosted preview or deploy state
- Response shape:
  - hosted availability summary
  - workspace mount and restore status
  - source-control adapter status
  - preview or deploy surface metadata
- Storage/index changes:
  - hosted runtime profile under `.shipyard/hosting/`
  - remote workspace metadata linked to target and repo binding
  - hosted degraded-mode history and recovery notes

## Dependency Plan
- Existing dependencies used: Phase 9 hosted Railway runtime baseline, hosted
  workspace helpers, artifact registry, pipeline runner, and the normalized
  source-control capability from `P11-S06`.
- New dependencies proposed (if any): none required beyond hosted-safe GitHub
  auth inputs and the existing provider environment.
- Risk and mitigation:
  - Risk: hosted and local behavior drift and create different project states.
  - Mitigation: keep shared contracts in `artifacts/`, `source-control/`, and
    `coordination/`, with Railway-specific behavior isolated to `hosting/`.
  - Risk: GitHub auth failure makes the hosted project unusable.
  - Mitigation: persist explicit degraded-source state and keep non-merge lanes
    available while blocked actions remain visible.

## Test Strategy
- Unit tests:
  - hosted runtime profile resolution
  - persistent workspace validation
  - hosted auth-adapter selection and degraded fallback
  - hosted preview or deploy status projection
- Integration tests:
  - boot hosted runtime against a GitHub-bound project
  - boot hosted runtime in degraded local mode with no GitHub auth
  - restore workspace and runtime state after restart
- E2E or smoke tests:
  - Railway-like boot sequence yields a usable hosted session with durable
    target state and visible hosted status
- Edge-case coverage mapping:
  - missing volume mount
  - GitHub auth scope mismatch
  - Railway restart mid-turn
  - preview or deploy URL unavailable

## Rollout and Risk Mitigation
- Rollback strategy: keep current local runtime flows intact while hosted
  factory execution lands behind explicit provider configuration.
- Feature flags/toggles: enable hosted factory mode only when workspace mount,
  hosted auth, and provider env checks pass.
- Observability checks: log workspace mount validation, hosted auth adapter
  choice, degraded-mode entries, preview or deploy status, and restart restore
  outcomes.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
