# Task Breakdown

## Story
- Story ID: PTM-S01
- Story Title: Target Manager Tools & Data Model

## Execution Notes
- Build the data model first, then tools bottom-up (list → select → create → enrich).
- Scaffold templates are static strings, not file copies.
- Mock the Anthropic client for enrichment tests.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Define `TargetProfile` interface in `src/artifacts/types.ts`. | must-have | yes | `pnpm --dir shipyard typecheck` |
| T002 | Implement `profile-io.ts` with `loadTargetProfile` and `saveTargetProfile`. | blocked-by:T001 | yes | unit test round-trip |
| T003 | Implement `list_targets` tool: scan directory, run lightweight discovery per subdirectory. | must-have | yes | unit test with mock dirs |
| T004 | Implement `select_target` tool: resolve path, ensure dirs, load profile. | blocked-by:T002 | yes | unit test |
| T005 | Implement scaffold templates for all five types (`react-ts`, `express-ts`, `python`, `go`, `empty`). | must-have | yes | unit test file generation |
| T006 | Implement `create_target` tool: mkdir, git init, apply scaffold, generate README/AGENTS.md. | blocked-by:T005 | no | integration test |
| T007 | Implement `enrich_target` tool: file reading heuristic, enrichment prompt, profile parsing. | blocked-by:T002 | no | unit test with mocked Claude |
| T008 | Define `targetManagerPhase` and system prompt. | blocked-by:T003,T004,T006,T007 | no | docs review |
| T009 | Register all four tools in the tool registry barrel export. | blocked-by:T003,T004,T006,T007 | no | `pnpm --dir shipyard typecheck` |
| T010 | Add `targetProfile` optional field to `SessionState`. | blocked-by:T001 | yes | `pnpm --dir shipyard typecheck` |

## Completion Criteria

- All four tools are registered and return correct shapes.
- `TargetProfile` round-trips through `profile.json` without data loss.
- Enrichment produces structured output for both existing repos and greenfield descriptions.
