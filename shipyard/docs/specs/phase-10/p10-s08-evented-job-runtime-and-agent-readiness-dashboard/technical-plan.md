# Technical Plan

## Metadata
- Story ID: P10-S08
- Story Title: Evented Job Runtime and Agent Readiness Dashboard
- Author: Codex
- Date: 2026-03-26

## Proposed Design
- Components/modules affected:
  - `shipyard/src/preview/supervisor.ts`
  - `shipyard/src/ui/server.ts`
  - `shipyard/src/ui/workbench-state.ts`
  - `shipyard/src/ui/contracts.ts`
  - `shipyard/src/tracing/langsmith.ts`
  - new job helpers under `shipyard/src/jobs/`
- Public interfaces/contracts:
  - `RuntimeJob`
  - `RuntimeJobStatus`
  - `JobArtifact`
  - `ReadinessReport`
  - `ReadinessSignal`
- Data flow summary: long-lived operations emit or project into the shared job
  runtime, the job store retains lifecycle and artifacts, UI and CLI surfaces
  subscribe to the same event stream, and a readiness projector summarizes
  recent policy, memory, index, verification, and task signals.

## Pack Cohesion and Sequencing
- Higher-level pack objectives:
  - durable execution
  - explicit policy and approvals
  - layered memory and repo knowledge
  - policy-driven routing and verification
  - background tasking and readiness surfaces
- Story ordering rationale: this story lands last because it should project the
  real contracts introduced by earlier stories rather than invent placeholder
  statuses.
- Gaps/overlap check: this story is operational and UI-facing. It does not
  replace the underlying policy, memory, routing, or task implementations.
- Whole-pack success signal: operators can see the system's actual posture and
  recent operational evidence before they trust a heavier automated flow.

## Architecture Decisions
- Decision: model long-lived operational work as jobs with one shared lifecycle
  contract and compute readiness from existing durable signals instead of
  creating a disconnected dashboard store.
- Alternatives considered:
  - keep each subsystem's status in separate UI panels
  - build the readiness dashboard first with mocked data
- Rationale: separate panels hide system posture, and a mock-first dashboard
  would drift from reality quickly.

## Data Model / API Contracts
- Request shape:
  - job creation or projection events from preview, deploy, eval, indexing,
    enrichment, and task systems
- Response shape:
  - shared job state and readiness report for the active target
- Storage/index changes:
  - target-local job retention under `.shipyard/jobs/`
  - retained readiness snapshots for recent sessions if needed

## Dependency Plan
- Existing dependencies used: preview supervisor, deploy flow, verification
  artifacts, index freshness, task-run state, UI event stream, traces.
- New dependencies proposed (if any): none required.
- Risk and mitigation:
  - Risk: dashboard becomes noisy or misleading if signals are too raw.
  - Mitigation: summarize into a bounded readiness report with drill-down links
    to the underlying job or trace evidence.

## Test Strategy
- Unit tests:
  - job lifecycle transitions
  - readiness signal aggregation
  - artifact retention and redaction
- Integration tests:
  - preview and deploy projection into shared jobs
  - task and verification jobs reflected in readiness
  - rebuild dashboard state after restart
- E2E or smoke tests:
  - browser workbench renders current jobs and readiness warnings correctly
- Edge-case coverage mapping:
  - no jobs yet
  - corrupted retained artifact
  - dropped event then rebuild from durable state
  - warning-only readiness posture

## Rollout and Risk Mitigation
- Rollback strategy: keep subsystem-specific status panels available while the
  unified job model proves stable.
- Feature flags/toggles: enable readiness scoring after shared job projection if
  needed.
- Observability checks: log job creation, retries, retention cleanup,
  readiness-signal contributions, and stale dashboard rebuilds.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
