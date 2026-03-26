# Technical Plan

## Metadata
- Story ID: P10-S07
- Story Title: Background Task Board and Isolated Task Runtimes
- Author: Codex
- Date: 2026-03-26

## Proposed Design
- Components/modules affected:
  - `shipyard/src/plans/store.ts`
  - `shipyard/src/plans/task-runner.ts`
  - `shipyard/src/ui/contracts.ts`
  - `shipyard/src/ui/server.ts`
  - `shipyard/src/ui/workbench-state.ts`
  - new task helpers under `shipyard/src/tasks/`
  - optional git-worktree helpers under `shipyard/src/git/` or runtime helpers
- Public interfaces/contracts:
  - `TaskRun`
  - `TaskRunStatus`
  - `TaskIsolationProfile`
  - `TaskReviewDecision`
- Data flow summary: a persisted plan can spawn task runs, each run gets an
  isolated environment plus durable thread, the coordinator executes inside that
  environment, verification evidence accumulates, and review/apply merges the
  accepted result back into the main target.

## Pack Cohesion and Sequencing
- Higher-level pack objectives:
  - durable execution
  - explicit policy and approvals
  - layered memory and repo knowledge
  - policy-driven routing and verification
  - background tasking and readiness surfaces
- Story ordering rationale: task-board work waits until durable threads,
  approvals, routing, and richer verification exist.
- Gaps/overlap check: this story covers task execution and review. P10-S08
  later unifies task runs with preview, deploy, and indexing as evented jobs.
- Whole-pack success signal: Shipyard can parallelize at the task level without
  abandoning explicit review or the single-writer apply model.

## Architecture Decisions
- Decision: isolate each background task in its own worktree or sandbox and
  require an explicit apply or discard decision for the main target.
- Alternatives considered:
  - mutate the main target directly from background tasks
  - keep all tasks foreground-only
- Rationale: direct mutation would break the trust model, while foreground-only
  execution leaves too much factory-style value on the table.

## Data Model / API Contracts
- Request shape:
  - plan task selection plus isolation profile and scheduling metadata
- Response shape:
  - task-run status, thread pointer, verification evidence, and review decision
- Storage/index changes:
  - target-local task-run state under `.shipyard/tasks/`
  - isolated worktree metadata and cleanup markers

## Dependency Plan
- Existing dependencies used: durable threads, policy profiles, plan storage,
  verification planner, UI event stream.
- New dependencies proposed (if any): none required beyond repo-owned git
  worktree helpers or sandbox adapters.
- Risk and mitigation:
  - Risk: isolated worktrees drift or leak storage over time.
  - Mitigation: add explicit cleanup states, stale-run reaper logic, and
  metadata linking each task to its isolation path.

## Test Strategy
- Unit tests:
  - task-run lifecycle and scheduling
  - apply or discard decision handling
  - cleanup and stale-isolation detection
- Integration tests:
  - spawn background task from persisted plan
  - review and apply accepted task output
  - cancel and retry blocked task
- E2E or smoke tests:
  - browser task board shows status transitions and review actions
- Edge-case coverage mapping:
  - no pending tasks
  - worktree creation failure
  - background task interrupted during verification
  - apply conflict detected

## Rollout and Risk Mitigation
- Rollback strategy: keep `next` / `continue` as the default execution path
  while background tasking rolls out gradually.
- Feature flags/toggles: enable isolated background runs before enabling
  review/apply in the UI if needed.
- Observability checks: log task lifecycles, isolation profile, review latency,
  cleanup state, and apply conflicts.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
