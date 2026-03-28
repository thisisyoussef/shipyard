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
- [ ] AC-1: Shipyard has typed contracts for story nodes, task nodes,
  dependency edges, assignments, task or story status, source-control refs, and
  hosted workspace refs.
- [ ] AC-2: Shipyard has a coordination-bus contract for message threads,
  acknowledgements, and advisory file or scope leases.
- [ ] AC-3: The runtime can project the task graph into non-visual board
  columns and card metadata, including phase, assigned agent, branch or PR
  state, degraded-source mode, and hosted runtime availability, without
  shipping the board UI itself.
- [ ] AC-4: Task graph state can reference approved specs, active TDD lanes,
  quality reports, GitHub bindings or degraded-local source mode, Railway
  workspace status, and later apply or review decisions.
- [ ] AC-5: File leases and coordination messages are explicit and auditable
  rather than informal chat convention.
- [ ] AC-6: The data contracts stay provider-neutral and external-system-neutral
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
