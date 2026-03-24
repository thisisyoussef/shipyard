# Task Breakdown

## Story
- Story ID: P6-S02
- Story Title: Verifier Subagent

## Execution Notes
- Keep the verifier command-only.
- Summarize command output instead of forwarding huge logs everywhere.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Define the verifier system prompt and `run_command` allowlist. | must-have | no | docs review |
| T002 | Implement the isolated verifier invocation path. | blocked-by:T001 | no | integration test |
| T003 | Return results as structured `VerificationReport` JSON. | blocked-by:T002 | yes | integration test |
| T004 | Add passing/failing command smoke coverage. | blocked-by:T003 | yes | `pnpm --dir shipyard test` |

## Completion Criteria

- Verifier can execute commands and report results without raw-log dependency.
- Output is structured enough for coordinator decision-making.
