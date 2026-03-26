# Task Breakdown

## Story
- Story ID: P10-S02
- Story Title: Risk-Tiered Approval Modes and Sandbox Policy Profiles

## Execution Notes
- Separate classification from enforcement so the runtime can ship visibility
  before strict blocking.
- Use durable approval checkpoints, not ad hoc prompt text, for pause and
  resume behavior.
- Keep a clearly labeled permissive local profile for developer ergonomics.

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
- Why this story set is cohesive: policy becomes the control plane that keeps
  the more capable runtime trustworthy.
- Coverage check: P10-S02 advances the pack's explicit approvals and sandbox
  objective.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing tests for risk-tier classification, approval checkpoints, sandbox-profile loading, and secret redaction. | must-have | no | `pnpm --dir shipyard test -- tests/tooling.test.ts tests/turn-runtime.test.ts tests/ui-runtime.test.ts` |
| T002 | Introduce typed policy, approval, and sandbox contracts plus registry-level classification helpers. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Enforce policy decisions in tool execution, thread pause/resume flow, and CLI/browser approval surfaces. | blocked-by:T002 | no | `pnpm --dir shipyard test -- tests/tooling.test.ts tests/ui-runtime.test.ts tests/graph-runtime.test.ts` |
| T004 | Document profile defaults, add trace evidence, and tune the permissive local fallback path. | blocked-by:T003 | yes | `pnpm --dir shipyard build` |

## TDD Mapping

- T001 tests:
  - [ ] `classifies read write and deploy actions into expected risk tiers`
  - [ ] `redacts provider secrets from approval artifacts`
- T002 tests:
  - [ ] `loads sandbox profiles and falls back safely on malformed config`
- T003 tests:
  - [ ] `pauses a durable thread for risky command approval`
  - [ ] `denies blocked actions without executing the tool`
- T004 tests:
  - [ ] `publishes approval and policy metadata to ui state and traces`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
