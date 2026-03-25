# Feature Spec

## Metadata
- Story ID: P9-S05
- Story Title: Persistent Hosted Workspace Storage and Restore
- Author: Codex
- Date: 2026-03-25
- Related PRD/phase gate: Phase 9 hosted Shipyard and public deploy

## Problem Statement

The current hosted pack only guarantees that Shipyard writes files into a
predictable server-side workspace path. That is not enough for a real product:
if Railway restarts or redeploys the service without a persistent volume,
generated target files and `.shipyard/` session artifacts can disappear. A
returning user should not lose their in-progress project just because the
hosted service restarted. Shipyard needs a first persistence story that keeps
the hosted workspace durable across sessions and provider restarts.

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
  upgrades the hosted runtime from demo-safe ephemeral storage to a durable
  hosted workspace that can survive restart and resume flows.

## User Stories
- As a returning Shipyard user, I want my project files to still exist when I
  come back later so I can resume work across sessions.
- As the host operator, I want the Railway service to restore the same
  workspace after a restart or redeploy so hosted users do not lose progress.

## Acceptance Criteria
- [ ] AC-1: Hosted Shipyard uses a persistent workspace root that is intended
  to be backed by a Railway volume mounted at `/app/workspace`.
- [ ] AC-2: When the mounted volume contains existing targets and `.shipyard/`
  state, Shipyard reuses that workspace on boot instead of treating the
  service as a brand-new empty environment.
- [ ] AC-3: Existing targets remain discoverable after a service restart, and
  previously persisted session/runtime state can still be resumed through the
  normal Shipyard session flows.
- [ ] AC-4: First boot against an empty mounted volume still works and creates
  the expected workspace structure automatically.
- [ ] AC-5: Misconfigured, missing, unwritable, or full persistent storage
  produces a clear hosted-runtime error or warning rather than silent data
  loss.
- [ ] AC-6: Provider docs/config explicitly describe the required Railway
  volume mount and recovery expectations.
- [ ] AC-7: The persistence contract stays path-based and modular enough that a
  later S3/R2 snapshot or restore layer can wrap it without rewriting the
  entire runtime.
- [ ] AC-8: Local non-hosted development remains backward compatible without
  requiring mounted persistent storage.

## Edge Cases
- The Railway volume is attached but empty on first boot.
- The configured workspace path exists but is not writable.
- The service restarts in the middle of a turn, leaving partially written
  files.
- The mounted volume is unavailable after a deploy or provider incident.
- A migrated hosted service already has files in the old workspace path.

## Non-Functional Requirements
- Reliability: hosted targets and `.shipyard/` runtime artifacts should
  survive restarts and redeploys when the volume is present.
- Observability: startup logs and health diagnostics should make storage
  failures obvious.
- Safety: Shipyard should not silently fall back to a fresh ephemeral path when
  durable storage was expected.
- Extensibility: the solution should leave room for later object-storage sync
  without forcing it into the first implementation.

## UI Requirements (if applicable)
- Required states: if storage health is surfaced later, the minimum useful
  states are healthy, degraded, and unavailable.

## Out of Scope
- Real-time object-storage sync after every edit.
- GitHub backups for generated projects.
- Multi-user isolation or per-user storage quotas.
- Full file-version history or snapshot browsing UI.

## Done Definition
- Hosted Shipyard can keep project files between sessions and across Railway
  restarts when the persistent volume is configured.
- Returning hosted sessions can find prior targets and runtime state again.
- The storage contract is clean enough to extend later with S3 or R2 sync.
