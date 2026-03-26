# Task Breakdown

## Story
- Story ID: RTH-S04
- Story Title: Bootstrap Safe-File Allowlist Alignment

## Execution Notes
- Keep the allowlist explicit and intentionally small.
- Preserve the current safety bar against bootstrapping on top of real project content.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing tests for allowlisted seed-doc targets and rejected true-content targets. | must-have | no | `pnpm --dir shipyard test -- tests/scaffold-bootstrap.test.ts` |
| T002 | Extend the bootstrap allowlist to include `AGENTS.md` and `README.md` and keep the check centralized. | blocked-by:T001 | no | focused scaffold bootstrap test |
| T003 | Improve bootstrap rejection messaging so it distinguishes safe seed docs from disallowed existing content. | blocked-by:T001 | yes | focused scaffold bootstrap test |
| T004 | Update bootstrap guidance or docs if they currently describe the stricter rule. | blocked-by:T002,T003 | yes | `pnpm --dir shipyard build` |

## Completion Criteria

- Near-empty targets with only `AGENTS.md` and `README.md` bootstrap cleanly.
- Real project content still blocks bootstrap.
- The guard rail remains narrow, explicit, and test-backed.
