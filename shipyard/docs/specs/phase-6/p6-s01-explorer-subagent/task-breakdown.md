# Task Breakdown

## Story
- Story ID: P6-S01
- Story Title: Explorer Subagent

## Execution Notes
- Keep the explorer read-only.
- Favor structured outputs over narrative summaries.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Define the explorer system prompt and tool allowlist. | must-have | no | docs review |
| T002 | Implement the isolated explorer invocation path. | blocked-by:T001 | no | integration test |
| T003 | Return findings as structured `ContextReport` JSON. | blocked-by:T002 | yes | integration test |
| T004 | Add a focused discovery smoke test. | blocked-by:T003 | yes | `pnpm --dir shipyard test` |

## Completion Criteria

- Explorer can answer codebase questions with read-only tools only.
- Output is structured enough for the coordinator to consume directly.
