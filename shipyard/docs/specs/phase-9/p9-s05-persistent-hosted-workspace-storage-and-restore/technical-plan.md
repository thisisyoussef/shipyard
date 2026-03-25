# Technical Plan

## Metadata
- Story ID: P9-S05
- Story Title: Persistent Hosted Workspace Storage and Restore
- Author: Codex
- Date: 2026-03-25

## Proposed Design
- Components/modules affected:
  - `shipyard/src/bin/shipyard.ts`
  - `shipyard/src/ui/server.ts`
  - `shipyard/src/engine/state.ts`
  - `shipyard/src/context/discovery.ts` if hosted-target discovery needs to
    emphasize restored targets
  - a small hosted-workspace persistence helper, for example
    `shipyard/src/hosting/persistent-workspace.ts`
  - Railway-facing deploy docs/config such as `shipyard/README.md`,
    `shipyard/docs/architecture/**`, or provider config files
  - `shipyard/tests/ui-runtime.test.ts`
  - target-manager or session-history tests if resume flows need new coverage
- Public interfaces/contracts:
  - hosted workspace root contract at `/app/workspace`
  - Railway volume mount requirement for durable hosted mode
  - boot-time validation of workspace availability/writability
- Data flow summary: on hosted boot, Shipyard resolves the persistent workspace
  root, validates that it is writable, creates base directories on first boot,
  scans any existing targets and `.shipyard/` runtime artifacts, and continues
  operating against the same mounted path on later sessions and redeploys.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - hosted Railway runtime
  - durable hosted workspace
  - lightweight access token gate
  - typed production deploy flow
  - trustworthy two-URL UX
- Story ordering rationale: this story follows `P9-S01` because the hosted
  workspace path must exist before it can become durable, and it should land
  before later UX/deploy assumptions depend on restart continuity.
- Gaps/overlap check: this story owns volume-backed persistence and restore
  behavior only. Object-storage sync, GitHub backup, and multi-user storage
  concerns remain future work.
- Whole-pack success signal: the hosted Railway runtime can restart without
  erasing the projects and session state inside `/app/workspace`.

## Architecture Decisions
- Decision: start with Railway volume-backed filesystem persistence instead of
  introducing S3/R2 synchronization in the first pass.
- Alternatives considered:
  - sync every edit directly to S3 or R2
  - GitHub as the only durability mechanism
  - keep the workspace ephemeral and accept restart loss
- Rationale: the current Shipyard runtime is file-heavy and already operates on
  a local filesystem model. A mounted volume preserves that model with the
  least architectural churn.
- Decision: add an explicit hosted-workspace validation helper rather than
  letting ad hoc file writes discover storage failures later.
- Alternatives considered:
  - opportunistic directory creation only
  - rely on generic filesystem errors during runtime
- Rationale: when durable storage is expected, startup should fail loudly and
  early rather than allow silent data loss or split-brain paths.
- Decision: keep a clear seam for future snapshot backends.
- Alternatives considered:
  - hard-code Railway-specific assumptions everywhere
  - design a full storage abstraction up front
- Rationale: the first story should not over-engineer object storage, but it
  should avoid making that future impossible.

## Data Model / API Contracts
- Request shape:
  - hosted startup config pointing at the persistent workspace root
- Response shape:
  - startup success with a validated workspace path
  - explicit error/warning when the durable path is unavailable or unwritable
- Storage/index changes:
  - no new primary artifact format
  - the existing target directories and `.shipyard/` state become durable by
    virtue of living on the mounted volume

## Dependency Plan
- Existing dependencies used:
  - current session persistence under `.shipyard/`
  - current target-manager and discovery flows
  - existing hosted runtime bootstrap
- New dependencies proposed (if any): none for the first pass.
- Risk and mitigation:
  - Risk: Shipyard silently boots against ephemeral storage if the volume mount
    is missing.
  - Mitigation: validate the configured hosted path on startup and make the
    failure explicit in logs and service health.
  - Risk: future object-storage sync becomes awkward.
  - Mitigation: isolate workspace-path resolution and validation in one helper
    instead of scattering provider assumptions across the codebase.

## Test Strategy
- Unit tests:
  - hosted workspace path resolution
  - writability and first-boot directory initialization
- Integration tests:
  - boot with an empty persistent workspace
  - boot with existing targets/session artifacts and verify restore behavior
  - failure behavior for unwritable or missing hosted storage
- E2E or smoke tests:
  - hosted restart smoke on Railway with a mounted volume and a previously
    created target
- Edge-case coverage mapping:
  - empty first boot
  - restored existing targets
  - volume missing or read-only
  - interrupted prior writes

## UI Implementation Plan (if applicable)
- Behavior logic modules:
  - none required for the first persistence pass unless storage health is
    surfaced explicitly
- Component structure:
  - no new UI required in the minimum viable storage story
- Accessibility implementation plan:
  - not applicable unless later stories surface storage health in the workbench
- Visual regression capture plan:
  - not applicable in the storage-first baseline story

## Rollout and Risk Mitigation
- Rollback strategy: local and non-hosted usage can continue using the existing
  workspace behavior; hosted durable mode remains tied to the configured
  mounted path.
- Feature flags/toggles: the hosted workspace path and provider volume mount
  act as the deployment gate for this story.
- Observability checks: startup logs, health checks, and manual provider smoke
  steps should confirm whether the durable workspace is actually mounted and in
  use.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
