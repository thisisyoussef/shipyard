# Task Breakdown

## Story
- Story ID: P10-S06
- Story Title: Verification Planner, Assertion Library, and Eval Ops

## Execution Notes
- Preserve command verification as the compatibility baseline while richer
  assertion types roll in.
- Keep verification planning target-aware and bounded; this should not become
  "run every check every time."
- Treat eval export as a trace-linked artifact, not a side effect hidden in
  logs.

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
- Why this story set is cohesive: the pack only becomes trustworthy if richer
  routing is matched by richer, inspectable verification.
- Coverage check: P10-S06 advances the pack's verification and eval objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing coverage for verification planning, mixed assertion execution, skip reasons, and eval fixture export. | must-have | no | `pnpm --dir shipyard test -- tests/verifier-subagent.test.ts tests/browser-evaluator.test.ts tests/evaluator-calibration.test.ts` |
| T002 | Introduce typed verification-planner and assertion-evidence contracts plus shared assertion executors. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Integrate target-aware verification planning into coordinator and verifier flows while preserving command-only fallback. | blocked-by:T002 | no | `pnpm --dir shipyard test -- tests/graph-runtime.test.ts tests/verifier-subagent.test.ts` |
| T004 | Export failing verification traces into eval-linked artifacts and surface per-check evidence in operator views. | blocked-by:T003 | yes | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [ ] `builds a lightweight verification plan for docs only changes`
  - [ ] `executes mixed command and browser assertions in order`
- T002 tests:
  - [ ] `captures structured evidence and skip reasons for unavailable surfaces`
- T003 tests:
  - [ ] `keeps command only verification as a fallback path`
  - [ ] `fails on diff or file invariant violations when requested`
- T004 tests:
  - [ ] `exports failing verification traces as eval fixtures`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
