# Task Breakdown

## Story
- Story ID: P6-S03
- Story Title: Coordinator Integration

## Execution Notes
- Keep the coordinator narrow and decision-oriented.
- Treat subagent reports as structured evidence, not free-form notes.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Define routing heuristics for explorer and verifier spawning. | must-have | no | docs review |
| T002 | Wire coordinator to consume `ContextReport` and `VerificationReport` objects. | blocked-by:T001 | no | integration test |
| T003 | Prioritize verification evidence over exploration guesses in conflicts. | blocked-by:T002 | yes | integration test |
| T004 | Add coordinator routing smoke tests for broad, exact-path, and post-edit scenarios. | blocked-by:T003 | yes | `pnpm --dir shipyard test` |

## Completion Criteria

- Coordinator uses subagents intentionally and predictably.
- Structured reports influence edit planning and recovery decisions.
