# Feature Spec

## Metadata
- Story ID: P11-S08
- Story Title: Task Graph, Dependency Metadata, and Coordination Bus Contracts
- Author: Codex
- Date: 2026-03-28
- Related PRD/phase gate: Phase 11 runtime factory foundations

## Problem Statement

Shipyard's current plan queue is linear and foreground-oriented. It knows about
task status, but not enough about story grouping, dependency edges, agent
assignment, source-control state, hosted workspace state, advisory file
ownership, or message-thread coordination to power a true multi-agent system
later. The future visual board needs a durable, non-UI state model first.
Shipyard therefore needs a task graph and coordination bus contract that can
represent stories, tasks, dependencies, assignments, GitHub or degraded-local
refs, hosted-runtime readiness, leases, and projected board columns without
shipping the visual board yet.

## Story Pack Objectives
- Objective 1: Define one durable runtime model for story and task graphs rather
  than several incompatible queue or board shapes.
- Objective 2: Add explicit coordination signals such as assignments, messages,
  source-control refs, hosted-runtime refs, and file leases before parallel
  execution begins.
- Objective 3: Produce a non-visual board projection that future UI work can
  render directly without redefining the data contract.
- How this story contributes to the overall objective set: it is the shared
  scheduling and coordination substrate for later multi-agent orchestration.

## User Stories
- As an operator, I want stories and tasks grouped under one graph so I can see
  which work is ready, blocked, or waiting review.
- As a future coordinator, I want to assign a task to a role and reserve files
  or scopes explicitly before work begins while still knowing its branch, PR,
  and hosted workspace context.
- As a future UI pack, I want one durable `BoardProjection` contract to render
  instead of rebuilding state from sessions or raw artifacts.

## Acceptance Criteria
- [x] AC-1: Shipyard has typed contracts for story nodes, task nodes,
  dependency edges, assignments, task or story status, source-control refs, and
  hosted workspace refs.
- [x] AC-2: Shipyard has a coordination-bus contract for message threads,
  acknowledgements, and advisory file or scope leases.
- [x] AC-3: The runtime can project the task graph into non-visual board
  columns and card metadata, including phase, assigned agent, branch or PR
  state, degraded-source mode, and hosted runtime availability, without
  shipping the board UI itself.
- [x] AC-4: Task graph state can reference approved specs, active TDD lanes,
  quality reports, GitHub bindings or degraded-local source mode, Railway
  workspace status, and later apply or review decisions.
- [x] AC-5: File leases and coordination messages are explicit and auditable
  rather than informal chat convention.
- [x] AC-6: The data contracts stay provider-neutral and external-system-neutral
  at the core even though first-party GitHub and Railway adapters ship first.

## Edge Cases
- Empty/null inputs: a story graph with no runnable tasks still projects a valid
  empty board state.
- Boundary values: one-story, one-task projects use the same contracts as
  larger dependency graphs.
- Invalid/malformed data: orphaned dependency edges, stale lease holders, or
  branch refs that point to merged or deleted work fail clearly and do not
  corrupt unrelated nodes.
- External-service failures: if a future external coordination adapter is
  unavailable, Shipyard retains its local coordination log, source-control
  state, and lease state.

## Non-Functional Requirements
- Security: leases and coordination messages must not become an implicit new
  write authority.
- Performance: graph projection should be cheap enough for per-event updates.
- Observability: assignment, dependency, lease, acknowledgement, source-control,
  and hosted-state changes must be visible in traces and later dashboards.
- Reliability: lease expiration and message replay rules must be deterministic
  enough for restart-safe coordination.

## Out of Scope
- The rendered kanban board UI.
- Animated transitions between board columns.
- Full cross-repository or cross-machine coordination.

## Done Definition
- Shipyard has a durable non-visual story/task graph plus coordination-bus
  contracts that later UI and orchestration work can consume directly,
  including GitHub and hosted-runtime status.

## Implementation Evidence

- `shipyard/src/tasks/contracts.ts`: defines the durable `StoryNode`,
  `TaskNode`, `TaskDependency`, `TaskAssignment`, `SourceControlRef`,
  `HostedWorkspaceRef`, `BoardCardProjection`, and `BoardProjection`
  contracts, plus the persisted task-graph state shape.

  ```ts
  export const boardProjectionSchema = z.object({
    updatedAt: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    storyCount: z.number().int().nonnegative(),
    taskCount: z.number().int().nonnegative(),
    columns: z.array(boardColumnProjectionSchema).length(5),
  });
  ```

- `shipyard/src/tasks/store.ts` and `shipyard/src/engine/state.ts`: add the
  `.shipyard/tasks/runtime.json` persistence path plus the new `.shipyard/tasks`
  and `.shipyard/coordination` directories to the standard target-local
  Shipyard state tree.

- `shipyard/src/tasks/runtime.ts`: projects approved backlog/story/spec
  artifacts into one task graph, derives dependency edges and blocked states,
  attaches TDD/source-control/hosted-runtime refs, preserves assignments,
  emits a deterministic board projection, and syncs the result into the active
  session workbench.

- `shipyard/src/coordination/contracts.ts`,
  `shipyard/src/coordination/store.ts`, and
  `shipyard/src/coordination/runtime.ts`: add explicit coordination threads,
  acknowledgements, advisory file leases, lease lifecycle persistence, and
  auditable mutation logs under `.shipyard/coordination/runtime.json`.

- `shipyard/src/ui/contracts.ts`,
  `shipyard/src/ui/workbench-state.ts`, and
  `shipyard/src/ui/server.ts`: add additive `taskBoard` session state,
  `tasks:state` websocket publication, and task-board refreshes on session and
  preview updates without replacing the existing project board.

- `shipyard/tests/task-graph-runtime.test.ts`,
  `shipyard/tests/coordination-runtime.test.ts`, and
  `shipyard/tests/task-graph-ui-runtime.test.ts`: validate backlog-to-graph
  projection, dependency blocking, deterministic columns, restart-safe task
  graph persistence, lease/acknowledgement audit behavior, source-control plus
  hosted-runtime freshness, assignment projection, and browser-visible
  `tasks:state` snapshots.

## LangSmith / Monitoring

- Fresh deterministic finish-check trace on project
  `shipyard-p11-s08-finishcheck`:
  - task-graph + coordination happy-path trace:
    `019d3731-6e4b-7000-8000-0345c28c7557`
- Commands reviewed:
  - traced runtime script via
    `pnpm --dir shipyard exec node --import tsx ./.p11-s08-finishcheck.mts`
  - `pnpm --dir shipyard exec langsmith trace list --project "$LANGSMITH_PROJECT" --last-n-minutes 30 --limit 5 --full`
  - `pnpm --dir shipyard exec langsmith run list --project "$LANGSMITH_PROJECT" --last-n-minutes 30 --error --limit 10 --full`
  - `pnpm --dir shipyard exec langsmith insights list --project "$LANGSMITH_PROJECT" --limit 3`
- The reviewed trace confirmed that Shipyard:
  - projected approved backlog, story, and spec artifacts into a two-story task
    graph with one blocked dependency
  - attached the hosted-safe GitHub binding and persistent Railway workspace
    metadata to the projection path
  - preserved the implementer ownership on the board card while also recording
    an advisory file lease and an open coordination thread for the same story
- `langsmith run list --project "$LANGSMITH_PROJECT" --last-n-minutes 30 --error --limit 10 --full`
  returned `[]` for the isolated finish-check project.
- `langsmith insights list --project "$LANGSMITH_PROJECT" --limit 3` returned
  `null` for the isolated finish-check project.
