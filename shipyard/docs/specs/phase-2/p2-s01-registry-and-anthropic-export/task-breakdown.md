# Task Breakdown

## Story
- Story ID: P2-S01
- Story Title: Registry and Anthropic Tool Export

## Execution Notes
- Keep runtime names in snake_case and file names in the repo's existing kebab-case style.
- Convert the current registry and barrel import before touching individual tool behavior.
- Add tests for the contract before rewiring the code phase.

## Story Pack Alignment (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - shared tool contract
  - safe file operations
  - complete bounded read-only tools
- Planned stories in this pack:
  - P2-S01 Registry and Anthropic Tool Export
  - P2-S02 Safe Relative File IO
  - P2-S03 Surgical `edit_block` Guardrails
  - P2-S04 Discovery, Execution, and Smoke Coverage
- Why this story set is cohesive: each story owns a distinct layer of the same tool surface without overlapping responsibility.
- Coverage check: P2-S01 advances the shared-contract objective and unlocks the rest of the pack.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Define `ToolResult`, `ToolDefinition`, and Anthropic export shapes in `src/tools/registry.ts`. | must-have | no | `pnpm --dir shipyard typecheck` |
| T002 | Replace the current hardwired registry with module-level register/get helpers and duplicate-name guards. | blocked-by:T001 | no | `pnpm --dir shipyard test -- tests/tooling.test.ts` |
| T003 | Convert `src/tools/index.ts` and `src/phases/code/index.ts` to the self-registration flow. | blocked-by:T002 | no | `pnpm --dir shipyard build` |
| T004 | Add or update focused tests for registration, lookup ordering, and Anthropic export. | blocked-by:T003 | yes | `pnpm --dir shipyard test -- tests/tooling.test.ts` |

## TDD Mapping

- T001 tests:
  - [ ] `registry exposes a shared ToolResult contract`
- T002 tests:
  - [ ] `registerTool rejects duplicate tool names`
  - [ ] `getTools preserves requested ordering while skipping unknown names`
- T003 tests:
  - [ ] `barrel import registers the full tool surface`
- T004 tests:
  - [ ] `getAnthropicTools returns input_schema payloads for requested tools`

## Completion Criteria
- [ ] All must-have tasks complete
- [ ] Acceptance criteria mapped to completed tasks
- [ ] Tests added and passing for each implemented task
- [ ] Deferred tasks documented with rationale
