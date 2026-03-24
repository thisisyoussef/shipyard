# Task Breakdown

## Story
- Story ID: SV-S01
- Story Title: MVP Stress and Smoke Matrix

## Execution Notes
- Keep the matrix requirement-driven, not file-driven.
- Prefer stable real-path integration tests over deep mocks.
- Split fast smoke checks from slower stress checks so contributors can choose the right confidence level.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Define the MVP requirement matrix and map each requirement to smoke and stress coverage. | must-have | no | docs review |
| T002 | Extend CLI/runtime tests for repeated instructions, restart, resume, and mixed command/instruction flows. | blocked-by:T001 | yes | `pnpm --dir shipyard test` |
| T003 | Extend tool guardrail coverage for repeated edits, stale reads, ambiguous anchors, missing anchors, and large rewrites. | blocked-by:T001 | yes | `pnpm --dir shipyard test` |
| T004 | Add context and rolling-summary multi-turn coverage. | blocked-by:T001 | yes | `pnpm --dir shipyard test` |
| T005 | Add browser UI smoke coverage for submit, stream, edit visibility, and one error case. | blocked-by:T001 | yes | `pnpm --dir shipyard test` |
| T006 | Add graph and fallback trace verification coverage, plus one success and one failure evidence path. | blocked-by:T001 | yes | `pnpm --dir shipyard test` |
| T007 | Add a simple matrix runner or documented command set for future reruns. | blocked-by:T002,T003,T004,T005,T006 | no | `pnpm --dir shipyard test` |
| T008 | Write a short manual stress checklist for one terminal run and one `--ui` run. | blocked-by:T007 | yes | handoff review |

## TDD Mapping

- T001 tests:
  - [ ] every MVP requirement is mapped to at least one smoke and one stress or failure-mode check
- T002 tests:
  - [ ] CLI stays alive across multiple turns and resumes after restart
- T003 tests:
  - [ ] surgical edit guardrails hold under repeated and failing edits
- T004 tests:
  - [ ] rolling summary and context envelope remain accurate across turns
- T005 tests:
  - [ ] UI shows streamed activity and error recovery for a local run
- T006 tests:
  - [ ] success and failure trace paths are both exercised
- T007 tests:
  - [ ] matrix runner documents or executes the full suite predictably

## Completion Criteria

- [ ] Acceptance criteria mapped to completed tasks
- [ ] Fast smoke path and deeper stress path are both documented
- [ ] Failures identify requirement categories clearly
- [ ] Future contributors can rerun the matrix without tribal knowledge
