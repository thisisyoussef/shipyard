# Task Breakdown

## Story
- Story ID: RTH-S06
- Story Title: Direct-Edit Fast Path and Deterministic Verification

## Execution Notes
- Keep the fast path narrow and reversible; ambiguity should fall back to the
  existing raw-loop behavior instead of widening the fast lane.
- Preserve checkpoint and recovery semantics even though the happy path no
  longer uses the verifier subagent.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing tests for direct-edit fast-path routing, deterministic verification, and reduced LangSmith trace lookup on the tiny-edit lane. | must-have | no | `pnpm --dir shipyard test -- tests/graph-runtime.test.ts tests/live-verification.test.ts tests/langsmith-tracing.test.ts` |
| T002 | Add the bounded direct-edit acting path with candidate-file gathering, one structured model turn, and preserved checkpoint-before-edit semantics. | blocked-by:T001 | no | focused graph-runtime test |
| T003 | Wire deterministic surgical verification and one cheap direct command into the verify node, with safe fallback to the existing verifier path when needed. | blocked-by:T001 | no | focused graph-runtime test |
| T004 | Add acting-mode and verification-mode observability plus the reduced LangSmith trace lookup policy for the direct-edit lane. | blocked-by:T002,T003 | yes | `pnpm --dir shipyard test -- tests/graph-runtime.test.ts tests/langsmith-tracing.test.ts` |
| T005 | Sync runtime-hardening docs and story evidence to describe the shipped fast path, fallback rules, and validation results. | blocked-by:T002,T003,T004 | yes | `pnpm --dir shipyard build` |

## Completion Criteria

- Tiny targeted UI or copy edits can complete without the generic raw-loop and
  verifier-subagent overhead.
- Ambiguous or broader edits still fall back safely to the existing runtime.
- Traces and docs make the new fast path and its fallback behavior explicit.
