# Task Breakdown

## Story
- Story ID: P8-S01
- Story Title: Spec Loader and Named Context Sources

## Execution Notes
- Keep the tool read-only and bounded.
- Prefer deterministic naming/path rules so later plan artifacts can reference loaded specs safely.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Add failing tests for file load, directory expansion, invalid-path rejection, and truncation behavior. | must-have | no | `pnpm --dir shipyard test -- tests/spec-loader.test.ts` |
| T002 | Implement the `load_spec` tool plus any minimal helper types for named spec documents. | blocked-by:T001 | no | `pnpm --dir shipyard typecheck` |
| T003 | Register the tool and add trace/activity summaries so later plan creation can show which specs were loaded. | blocked-by:T002 | yes | `pnpm --dir shipyard test` |
| T004 | Sync nearby docs/prompts if the code phase should explicitly mention `load_spec` for spec-driven work. | blocked-by:T003 | yes | `pnpm --dir shipyard build` |

## Completion Criteria

- Operators can load spec files or small spec directories without pasting them manually.
- Loaded specs have stable references and bounded content.
- Tool activity is visible enough for later planning stories to rely on it.
