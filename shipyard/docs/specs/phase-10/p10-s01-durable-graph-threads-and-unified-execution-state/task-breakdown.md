# Task Breakdown

## Story
- Story ID: P10-S01
- Story Title: Durable Graph Threads and Unified Execution State

## Execution Notes
- Treat this as a migration story, not a rewrite-from-scratch story.
- Preserve one consistent source of truth for pause/resume before adding policy
  or background-task features on top.
- Keep the lightweight path explicit so the durable thread model does not
  penalize small exact-path edits.

## Story Pack Alignment
- Higher-level pack objectives:
  - durable execution
  - explicit policy and approvals
  - layered memory and repo knowledge
  - policy-driven routing and verification
  - background tasking and readiness surfaces
- Planned stories in this pack:
  - P10-S01 Durable Graph Threads and Unified Execution State
  - P10-S02 Risk-Tiered Approval Modes and Sandbox Policy Profiles
  - P10-S03 Layered Memory, Context Compaction, and Decision-Time Guidance
  - P10-S04 Repository Index and Generated Architecture Wiki
  - P10-S05 RoutingDecision Policy and Bounded Helper Roles
  - P10-S06 Verification Planner, Assertion Library, and Eval Ops
  - P10-S07 Background Task Board and Isolated Task Runtimes
  - P10-S08 Evented Job Runtime and Agent Readiness Dashboard
- Why this story set is cohesive: the whole pack depends on replacing ad hoc
  long-run state with explicit durable runtime contracts.
- Coverage check: P10-S01 advances the durable execution objective and unlocks
  the rest of the pack.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing coverage for thread creation, projection, checkpoint persistence, legacy migration, and resume across `plan:` / `next` / standard turns. | must-have | no | `pnpm --dir shipyard test -- tests/graph-runtime.test.ts tests/plan-mode.test.ts tests/task-runner.test.ts` |
| T002 | Introduce typed thread and checkpoint artifacts plus target-local storage and migration helpers. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Route graph, turn execution, plan mode, and task runner through the unified thread contract while preserving the lightweight path. | blocked-by:T002 | no | `pnpm --dir shipyard test -- tests/graph-runtime.test.ts tests/turn-runtime.test.ts tests/task-runner.test.ts` |
| T004 | Expose thread status in CLI/UI/traces and add docs for migration, resume, and failure recovery. | blocked-by:T003 | yes | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [ ] `creates a durable thread for plan-backed work`
  - [ ] `reuses one thread across plan next and continue turns`
  - [ ] `migrates legacy plan and handoff artifacts safely`
- T002 tests:
  - [ ] `persists checkpoints and reloads the latest valid pointer`
- T003 tests:
  - [ ] `resumes graph execution after interruption from thread state`
  - [ ] `keeps trivial turns on the lightweight path when eligible`
- T004 tests:
  - [ ] `publishes thread status and checkpoint metadata to ui and traces`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
