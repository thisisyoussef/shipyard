# Task Breakdown

## Story
- Story ID: P10-S08
- Story Title: Evented Job Runtime and Agent Readiness Dashboard

## Execution Notes
- Unify job lifecycle first, then layer readiness scoring on top of real
  signals.
- Reuse the existing event stream and trace wiring rather than adding a second
  transport.
- Keep retention and redaction part of the core contract, not a cleanup
  afterthought.

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
- Why this story set is cohesive: this is the pack's operator-facing capstone
  that reflects whether the deeper runtime work is actually trustworthy.
- Coverage check: P10-S08 advances the pack's evented-ops and readiness
  objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing coverage for shared job lifecycle, retained artifact handling, readiness aggregation, and dashboard rebuild after restart. | must-have | no | `pnpm --dir shipyard test -- tests/ui-runtime.test.ts tests/ui-workbench.test.ts tests/langsmith-tracing.test.ts` |
| T002 | Introduce shared runtime-job and readiness-report contracts plus target-local job retention. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Project preview, deploy, verification, indexing, enrichment, and task runs into the job model and compute readiness from durable signals. | blocked-by:T002 | no | `pnpm --dir shipyard test -- tests/ui-runtime.test.ts tests/evaluator-calibration.test.ts tests/task-runner.test.ts` |
| T004 | Build the workbench and CLI job-status surfaces, retention controls, and readiness drill-down views. | blocked-by:T003 | yes | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [ ] `projects preview deploy and task activity into one job lifecycle`
  - [ ] `rebuilds job dashboard state after process restart`
- T002 tests:
  - [ ] `retains and redacts job artifacts according to policy`
- T003 tests:
  - [ ] `computes readiness from policy index verification and task signals`
  - [ ] `keeps warning only readiness from blocking benign local iteration`
- T004 tests:
  - [ ] `renders readiness warnings and job history in the workbench`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
