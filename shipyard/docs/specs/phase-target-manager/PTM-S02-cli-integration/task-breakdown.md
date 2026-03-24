# Task Breakdown

## Story
- Story ID: PTM-S02
- Story Title: CLI Integration & Runtime Switching

## Execution Notes
- Start with CLI argument changes, then REPL command, then session switching.
- Test backward compatibility explicitly: existing `--target <path>` must still work.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Make `--target` optional and add `--targets-dir` in `parseArgs()`. | must-have | yes | unit test: parseArgs with/without --target |
| T002 | Update `main()` startup: if no target, enter target manager phase for first turn. | blocked-by:T001 | no | integration test |
| T003 | Implement `switchTarget()` in `src/engine/state.ts`: save old session, discover new target, load/create new session, load profile. | must-have | yes | unit test with mock FS |
| T004 | Add `target` REPL command to `src/engine/loop.ts` with subcommand dispatch. | must-have | yes | unit test: command parsing |
| T005 | Implement `target` (no args): print current target info and profile summary. | blocked-by:T004 | no | manual smoke test |
| T006 | Implement `target switch`: list targets, prompt selection, call `switchTarget()`. | blocked-by:T003,T004 | no | integration test |
| T007 | Implement `target create`: delegate to `create_target` tool function, then select. | blocked-by:T004 | no | integration test |
| T008 | Implement `target enrich`: call `enrich_target` tool function on current target. | blocked-by:T004 | no | integration test |
| T009 | Implement `target profile`: print full TargetProfile JSON. | blocked-by:T004 | yes | manual smoke test |
| T010 | Add backward compatibility test: `--target <path>` skips target manager entirely. | blocked-by:T002 | yes | `pnpm --dir shipyard test` |

## Completion Criteria

- Launching without `--target` enters target manager mode and guides the user.
- `target switch` mid-session saves state and transitions cleanly.
- All existing `--target <path>` tests pass without modification.
