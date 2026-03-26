# Feature Spec

## Metadata
- Story ID: P10-S08
- Story Title: Evented Job Runtime and Agent Readiness Dashboard
- Author: Codex
- Date: 2026-03-26
- Related PRD/phase gate: Phase 10 durable runtime, policy, and factory workflow

## Problem Statement

Shipyard already has several long-lived or background-capable workflows:
preview startup, deploy execution, verification, indexing, enrichment, and soon
background task runs. Today those surfaces still feel like separate features
rather than one operational runtime. To make the system easier to operate and
trust, Shipyard needs a unified job model plus a readiness dashboard that says
whether the current target and runtime setup are actually ready for heavier
automation.

## Story Pack Objectives
- Objective 1: Represent preview, deploy, eval, indexing, enrichment, and task
  runs as first-class jobs with consistent lifecycle and artifact retention.
- Objective 2: Surface readiness and governance signals in the workbench rather
  than hiding them in traces or scattered status banners.
- Objective 3: Make job history, retries, and failures inspectable across local
  and hosted workflows.
- How this story contributes to the overall objective set: it turns the pack's
  richer runtime contracts into an operator-visible control surface.

## User Stories
- As an operator, I want to see what Shipyard is doing in the background and
  whether the current target is ready for a heavier autonomous run.
- As a reviewer, I want one place to inspect preview, deploy, eval, indexing,
  and task-job history with artifacts and retry status.
- As a runtime owner, I want readiness signals such as policy posture, index
  freshness, verification coverage, and recent failure rates to guide defaults.

## Acceptance Criteria
- [ ] AC-1: Preview, deploy, eval, indexing, enrichment, and task runs can all
  be represented as jobs with a shared lifecycle contract.
- [ ] AC-2: Job state includes artifacts, timestamps, retry history, retention
  metadata, and clear terminal states.
- [ ] AC-3: The workbench exposes current jobs, recent jobs, and a readiness
  dashboard summarizing policy posture, memory or index freshness, verification
  coverage, and recent task outcomes.
- [ ] AC-4: Job events can stream to CLI and browser surfaces without requiring
  a second runtime service.
- [ ] AC-5: Retention and redaction rules exist for job artifacts so sensitive
  data does not linger indefinitely.
- [ ] AC-6: Readiness signals can inform warnings or defaults for heavier
  automation paths without blocking benign local iteration.

## Edge Cases
- Empty/null inputs: no-job states still produce a useful readiness summary.
- Boundary values: one active job and many simultaneous jobs use the same job
  contract.
- Invalid/malformed data: corrupted retained job artifacts are quarantined and
  do not break the whole dashboard.
- External-service failures: dropped event delivery still allows job recovery
  from durable state.

## Non-Functional Requirements
- Security: retained job artifacts must follow redaction and retention rules.
- Performance: readiness projection and job history rendering must stay fast
  even with many recent jobs.
- Observability: jobs need stable IDs, lifecycle timestamps, and links to
  underlying traces or threads.
- Reliability: the dashboard should survive refreshes and process restarts by
  rebuilding from durable job state.

## UI Requirements (if applicable)
- Required states: no active jobs, active job, failed job, retained artifact
  available, readiness warning, readiness healthy.
- Accessibility contract: job history and readiness metrics must be keyboard
  navigable and readable without relying on color alone.

## Out of Scope
- Billing dashboards.
- External notification or pager integrations.
- Full organizational analytics beyond the current target and runtime.

## Done Definition
- Shipyard can treat operational work as first-class jobs and can show whether
  the current target and runtime posture are actually ready for heavier agentic
  workflows.
