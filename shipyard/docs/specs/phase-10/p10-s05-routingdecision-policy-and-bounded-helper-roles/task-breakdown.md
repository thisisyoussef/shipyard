# Task Breakdown

## Story
- Story ID: P10-S05
- Story Title: RoutingDecision Policy and Bounded Helper Roles

## Execution Notes
- Keep helper-role expansion bounded and explicit; this is not a swarm-coding
  story.
- Land route visibility and fallback behavior before tuning route quality.
- Reuse the existing helper surfaces rather than replacing them all at once.

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
- Why this story set is cohesive: explicit routing is the bridge between richer
  memory and richer verification without turning the runtime into an opaque
  heuristic blob.
- Coverage check: P10-S05 advances the pack's policy-driven routing objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing coverage for route selection, route fallback, helper-capability enforcement, and route evidence projection. | must-have | no | `pnpm --dir shipyard test -- tests/graph-runtime.test.ts tests/planner-subagent.test.ts tests/browser-evaluator.test.ts` |
| T002 | Introduce typed routing artifacts and helper capability profiles. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Replace coordinator-side helper heuristics with routing-policy evaluation while preserving safe fallback paths. | blocked-by:T002 | no | `pnpm --dir shipyard test -- tests/graph-runtime.test.ts tests/turn-runtime.test.ts` |
| T004 | Surface routing rationale, expected evidence, and fallback reasons in traces and browser/CLI activity views. | blocked-by:T003 | yes | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [ ] `routes broad work through planner with explicit rationale`
  - [ ] `keeps exact path requests on the lightweight route`
- T002 tests:
  - [ ] `rejects helper invocations outside declared capability profiles`
- T003 tests:
  - [ ] `falls back safely when routing artifact generation fails`
  - [ ] `records expected evidence for browser evaluator or verifier routes`
- T004 tests:
  - [ ] `publishes routing rationale and fallback metadata to ui state`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
