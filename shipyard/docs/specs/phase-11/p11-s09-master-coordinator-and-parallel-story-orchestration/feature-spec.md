# Feature Spec

## Metadata
- Story ID: P11-S09
- Story Title: Master Coordinator and Parallel Story Orchestration
- Author: Codex
- Date: 2026-03-28
- Related PRD/phase gate: Phase 11 runtime factory foundations

## Problem Statement

`Ultimate mode` currently acts like a persistent simulator-backed loop over one
instruction stream. It can keep a build moving, but it is not yet a true master
coordinator for many stories or many specialized workers. Once artifacts,
approvals, profiles, PM phases, TDD lanes, GitHub-backed or degraded-local
source control, Railway-hosted workspaces, and task graphs exist, Shipyard
should evolve `ultimate mode` into a coordinator that can supervise multiple
story runs, respect dependencies, assign work to specialized roles, incorporate
live human interrupts, manage merge order, and keep the whole factory
progressing without collapsing back into one giant turn transcript.

## Story Pack Objectives
- Objective 1: Turn `ultimate mode` from a simulator loop into a real runtime
  supervisor.
- Objective 2: Schedule multiple stories or tasks in parallel when dependencies,
  approvals, leases, source-control state, hosted capacity, and isolation rules
  allow it.
- Objective 3: Keep human interrupt, approval, and feedback behavior central so
  autonomy does not outrun operator control.
- Objective 4: Apply a first-merge-wins policy that routes later conflicting
  work through explicit coordinator-supervised recovery instead of pretending
  parallel merges are free.
- How this story contributes to the overall objective set: it is the pack's
  capstone orchestration story and the runtime bridge to future multi-agent
  factory execution.

## User Stories
- As an operator, I want one master coordinator to keep several stories moving
  without losing the ability to interrupt or redirect priority.
- As a coordinator, I want to assign work based on dependencies, active
  approvals, loaded skills, agent-role fit, source-control state, and hosted
  workspace readiness.
- As a reviewer, I want each active story to remain inspectable and bounded even
  while several workers are running, including when one branch merges first and
  later work must reconcile.

## Acceptance Criteria
- [x] AC-1: Shipyard has a master coordinator runtime that can supervise
  multiple story or task runs at once rather than only one active loop.
- [x] AC-2: The coordinator respects dependency edges, approval wait states,
  advisory leases, source-control binding or degraded-source state, hosted
  workspace capacity, and isolated worker boundaries when scheduling work.
- [x] AC-3: The coordinator can choose specialized profiles or phase lanes such
  as discovery, PM, TDD, QA, deploy, or GitHub-ops/merge based on the active
  task.
- [x] AC-4: Human interrupts, edits, approvals, and reprioritization requests
  can preempt or reroute the coordinator safely.
- [x] AC-5: Coordinator state stays durable enough to recover after restart
  without losing task ownership or active next steps.
- [x] AC-6: When one branch or PR merges first, the coordinator marks later
  stale conflicting work explicitly, syncs it against the latest default branch,
  and routes it through a visible conflict-resolution workflow instead of
  silently force-merging.
- [x] AC-7: If GitHub auth or binding is unavailable, the coordinator can still
  continue planning or explicitly-degraded local implementation work while
  blocking merge or deploy steps with clear reasons.
- [x] AC-8: The orchestration contract is usable by a future kanban UI pack but
  does not require that UI to exist first.

## Edge Cases
- Empty/null inputs: the coordinator can idle cleanly when no ready tasks are
  available.
- Boundary values: one ready task still uses the same master-coordinator
  contract as many concurrent tasks.
- Invalid/malformed data: tasks with broken dependencies, stale assignments, or
  missing branch refs do not deadlock the whole scheduler; they surface as
  blocked or attention-needed.
- External-service failures: if one worker fails or times out, the coordinator
  preserves other ready work and marks the failed work explicitly.

## Non-Functional Requirements
- Security: the coordinator must not widen main-target write authority beyond
  what lower-level isolation and apply policies allow.
- Performance: scheduler decisions should be cheap enough to re-evaluate on each
  task transition or human interrupt.
- Observability: active stories, worker assignments, blocked reasons, merge
  staleness, hosted readiness, and next ready tasks must be visible in traces
  and status projections.
- Reliability: long-running orchestration must rotate or compact state so it
  does not repeat the oversized-session failures the current runtime has already
  hit in practice.

## Out of Scope
- The visual kanban board and its animations.
- Cross-machine fleet management.
- Zero-touch merge conflict resolution with no coordinator or human oversight.

## Done Definition
- Shipyard can supervise multiple specialized work streams through one durable
  coordinator instead of treating `ultimate mode` as a single forever-loop,
  including first-merge-wins recovery and hosted-runtime awareness.

## Implementation Evidence

- `shipyard/src/orchestration/contracts.ts`: introduces the durable
  `CoordinatorRun`, `CoordinatorWorkerAssignment`, `ConflictRecoveryItem`,
  `HumanIntervention`, and `OrchestrationWorkbenchState` schemas that future UI
  board work can consume directly.

  ```ts
  export const orchestrationWorkbenchStateSchema = z.object({
    active: z.boolean(),
    runId: z.string().trim().min(1).nullable(),
    mode: coordinatorModeSchema,
    status: coordinatorRunStatusSchema,
    summary: nonEmptyTextSchema,
    maxWorkers: z.number().int().positive(),
    availableWorkers: z.number().int().nonnegative(),
    activeWorkerCount: z.number().int().nonnegative(),
  });
  ```

- `shipyard/src/orchestration/store.ts` and `shipyard/src/engine/state.ts`:
  persist coordinator state under `.shipyard/orchestration/runtime.json` and
  add the target-local orchestration directory beside artifacts, pipeline, TDD,
  source control, hosting, tasks, and coordination state.

- `shipyard/src/orchestration/runtime.ts`: implements the master scheduler,
  dependency and approval-aware dispatch, human reprioritization and reroutes,
  degraded-source and hosted-capacity gating, first-merge-wins recovery queue
  handling, and restart-safe worker completion updates.

  ```ts
  if (options.brief) {
    const advanced = await advanceCoordinatorRun(sessionState, {
      ...options,
      brief: options.brief,
      pendingHumanFeedback: [],
    });
    nextState = advanced.state;
  } else {
    nextState = {
      ...loadedState,
      updatedAt: now,
      projection: createProjection({
        run: loadedState.activeRun,
        taskGraphState: runtimeInputs.taskGraphState,
        capacity,
        waitingForApproval,
        sourceControlState: runtimeInputs.sourceControlState,
        updatedAt: now,
      }),
    };
  }
  ```

- `shipyard/src/engine/ultimate-mode.ts`: upgrades `ultimate mode` to consult
  the coordinator first, dispatch role-aware work through the existing turn
  executor, record per-worker results, and only fall back to the human
  simulator when no task-graph-backed orchestration is available.

- `shipyard/src/ui/contracts.ts`,
  `shipyard/src/ui/workbench-state.ts`, and
  `shipyard/src/ui/server.ts`: add additive `orchestration` snapshot state and
  websocket publication via `orchestration:state`, keeping the current browser
  contract forward-compatible with the later task-board UI pack.

- `shipyard/tests/orchestration-runtime.test.ts`,
  `shipyard/tests/ultimate-mode.test.ts`, and
  `shipyard/tests/ui-view-models.test.ts`: validate dependency-aware scheduling,
  approval wait handling, hosted-capacity limits, first-merge-wins recovery,
  durable restart behavior, coordinator-first `ultimate mode` dispatch, failed
  worker isolation, and workbench reducer support for orchestration state.

## LangSmith / Monitoring

- Fresh deterministic finish-check traces on project
  `shipyard-p11-s09-finishcheck`:
  - coordinator happy path:
    `019d374e-628d-7000-8000-0159de48bd33`
  - first-merge-wins recovery path:
    `019d374e-7ae8-7000-8000-04e17a46c51c`
- Commands reviewed:
  - traced finish-check script with
    `LANGSMITH_PROJECT=shipyard-p11-s09-finishcheck LANGSMITH_TRACING=true LANGCHAIN_TRACING_V2=true pnpm --dir shipyard exec node --import tsx ../.p11-s09-finishcheck.mts`
  - `LANGSMITH_PROJECT=shipyard-p11-s09-finishcheck LANGSMITH_TRACING=true LANGCHAIN_TRACING_V2=true pnpm --dir shipyard exec langsmith trace list --project "$LANGSMITH_PROJECT" --last-n-minutes 30 --limit 5 --full`
  - `LANGSMITH_PROJECT=shipyard-p11-s09-finishcheck LANGSMITH_TRACING=true LANGCHAIN_TRACING_V2=true pnpm --dir shipyard exec langsmith run list --project "$LANGSMITH_PROJECT" --last-n-minutes 30 --error --limit 10 --full`
  - `LANGSMITH_PROJECT=shipyard-p11-s09-finishcheck LANGSMITH_TRACING=true LANGCHAIN_TRACING_V2=true pnpm --dir shipyard exec langsmith insights list --project "$LANGSMITH_PROJECT" --limit 3`
- The reviewed traces confirmed that Shipyard:
  - dispatched an `implementer` lane from the approved task graph while keeping
    one dependent story blocked and advertising the persistent hosted
    two-worker-capacity summary
  - dispatched `pr-ops` for the first-merge-wins recovery path with one open
    recovery item and a healthy GitHub automation summary instead of falling
    back to ad hoc merge behavior
- `langsmith run list --project "$LANGSMITH_PROJECT" --last-n-minutes 30 --error --limit 10 --full`
  returned `[]` for the isolated finish-check project.
- `langsmith insights list --project "$LANGSMITH_PROJECT" --limit 3` returned
  `null` for the isolated finish-check project.
