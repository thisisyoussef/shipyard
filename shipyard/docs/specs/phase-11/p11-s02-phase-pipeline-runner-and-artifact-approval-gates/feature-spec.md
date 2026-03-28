# Feature Spec

## Metadata
- Story ID: P11-S02
- Story Title: Phase Pipeline Runner and Artifact Approval Gates
- Author: Codex
- Date: 2026-03-28
- Related PRD/phase gate: Phase 11 runtime factory foundations

## Problem Statement

Shipyard can execute single instructions, plan queues, and `ultimate` loops, but
it still lacks a true phase pipeline. There is no runtime-native way to say:
"run discovery, pause for approval, produce a feature spec, let the operator
edit it, then continue into the next phase." The current workflow exists mostly
in external docs and operator discipline. Shipyard needs a pipeline runner that
can execute named phases in sequence, persist their output artifacts, pause for
approval when configured, accept edits or rejections, and resume from the right
phase without losing context.

## Story Pack Objectives
- Objective 1: Make phase transitions and approvals explicit runtime behavior.
- Objective 2: Preserve flexibility so the operator can skip, rerun, or step
  backwards without losing durable artifacts.
- Objective 3: Give later PM and TDD phases a clean way to consume approved
  upstream output.
- How this story contributes to the overall objective set: it is the control
  plane that turns the artifact registry into an actual multi-phase workflow.

## User Stories
- As an operator, I want Shipyard to pause on a draft spec, let me approve or
  edit it, and only then continue into implementation.
- As a phase runner, I want to pass approved artifacts to the next phase
  instead of rebuilding context from loose files and chat.
- As a supervisor, I want to rewind a rejected artifact back to the producing
  phase with clear feedback and preserved history.

## Acceptance Criteria
- [x] AC-1: Shipyard can define ordered phase pipelines where each phase
  declares the artifact types it consumes and produces.
- [x] AC-2: A phase can require approval in `required`, `advisory`, or
  `disabled` mode before downstream execution continues.
- [x] AC-3: The operator can approve, reject, or edit a produced artifact and
  the pipeline resumes deterministically from the correct point.
- [x] AC-4: Pipeline state is durable enough to survive process restart,
  interruption, or later `continue`/resume actions.
- [x] AC-5: Operators can skip phases, rerun phases, or move backward to a
  previous phase with explicit audit trail entries.
- [x] AC-6: Existing non-pipeline instructions remain available and do not
  require the heavier pipeline path unless requested.

## Edge Cases
- Empty/null inputs: starting a pipeline with no valid initial brief fails
  before phase execution starts.
- Boundary values: pipelines with one phase still use the same approval and
  artifact semantics as multi-phase pipelines.
- Invalid/malformed data: malformed edited artifact payloads fail validation and
  return to the current approval gate instead of corrupting downstream phases.
- External-service failures: if a phase crashes after producing an artifact but
  before advancing state, the pipeline can recover without duplicating
  downstream work.

## Non-Functional Requirements
- Security: edited approval payloads must be validated against the artifact
  contract before they are accepted as new versions.
- Performance: pause/resume and phase-state persistence should be cheap enough
  for interactive local use.
- Observability: every phase transition and approval decision must be visible in
  local traces and operator history.
- Reliability: resume semantics must be deterministic across cancellations and
  process restarts.

## Out of Scope
- Visual approval-gate screens.
- PM/TDD phase content generation details.
- Cross-project or cross-repository pipeline orchestration.

## Done Definition
- Shipyard can run a persisted multi-phase pipeline with explicit artifact
  approvals instead of relying on human memory and manual discipline alone.

## Implementation Evidence

- `shipyard/src/pipeline/contracts.ts`: defines the durable pipeline contract:
  ordered phase definitions, approval gate modes, phase run state, pending
  approval metadata, audit entries, and the compact workbench projection used
  by the browser runtime.

  ```ts
  export const persistedPipelineRunSchema = z.object({
    version: z.literal(PIPELINE_RUN_VERSION),
    runId: z.string().trim().min(1),
    pipeline: phasePipelineDefinitionSchema,
    status: pipelineRunStatusSchema,
    // ...
  });
  ```

- `shipyard/src/pipeline/store.ts` and `shipyard/src/engine/state.ts`:
  persist pipeline runs under `.shipyard/pipelines/` and bootstrap that
  directory alongside the rest of Shipyard's target-local runtime state.

  ```ts
  export function getPipelineDirectory(targetDirectory: string): string {
    return path.join(getShipyardDirectory(targetDirectory), "pipelines");
  }
  ```

- `shipyard/src/pipeline/turn.ts`: implements the explicit command surface,
  default pipeline creation, phase execution, artifact versioning for
  approve/edit/reject decisions, restart-safe resume, and skip/rerun/back
  control flow without changing normal turns.

  ```ts
  export function parsePipelineCommand(
    instruction: string,
  ): PipelineCommand | null {
    // pipeline start/status/continue/approve/reject/edit/skip/rerun/back
  }
  ```

- `shipyard/src/ui/contracts.ts`, `shipyard/src/ui/workbench-state.ts`,
  `shipyard/src/ui/server.ts`, and `shipyard/src/engine/loop.ts`: route
  `pipeline ...` instructions through browser and CLI execution, then publish
  compact approval-wait state via `workbenchState.pipelineState`.

  ```ts
  export const workbenchStateSchema = z.object({
    // ...
    pipelineState: pipelineWorkbenchStateSchema.nullable().default(null),
  });
  ```

- `shipyard/tests/pipeline-runtime.test.ts`: covers required/advisory gates,
  edited approvals as new artifact versions, reject/rerun behavior, malformed
  edits, and restart-safe resume.

- `shipyard/tests/ui-runtime.test.ts`: proves the browser websocket snapshot
  includes the approval-wait pipeline projection once a required gate is hit.
