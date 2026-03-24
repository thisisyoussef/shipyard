# Technical Plan

## Metadata
- Story ID: P2-S04
- Story Title: Discovery, Execution, and Smoke Coverage
- Author: Codex
- Date: 2026-03-24

## Proposed Design
- Components/modules affected:
  - `shipyard/src/tools/list-files.ts`
  - `shipyard/src/tools/search-files.ts`
  - `shipyard/src/tools/run-command.ts`
  - `shipyard/src/tools/git-diff.ts`
  - `shipyard/tests/tooling.test.ts`
  - one manual smoke entrypoint under `shipyard/tests/manual/`
- Public interfaces/contracts:
  - `list_files({ path, depth? }, targetDirectory) -> ToolResult`
  - `search_files({ pattern, file_pattern?, limit? }, targetDirectory) -> ToolResult`
  - `run_command({ command, timeout_seconds? }, targetDirectory) -> ToolResult`
  - `git_diff({ staged?, path? }, targetDirectory) -> ToolResult`
- Data flow summary: list/search tools traverse or shell out within the target directory and rewrite results into relative, token-bounded output strings. `run_command` centralizes command execution so `git_diff` can reuse timeout, color stripping, and output clipping. The manual smoke script creates a temp repo fixture and invokes every tool directly.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - shared tool contract
  - safe file operations
  - complete bounded read-only tools
- Story ordering rationale: this story depends on the shared contract from P2-S01 and closes the pack once file/edit guardrails are in place.
- Gaps/overlap check: this story owns read-only discovery, command execution, and the smoke harness; it does not redefine registry or file-mutation semantics.
- Whole-pack success signal: the full Phase 2 tool surface can be exercised directly without the LLM.

## Architecture Decisions
- Decision: route `git_diff` through the same command-execution helper used by `run_command`.
- Alternatives considered:
  - shell out independently inside `git_diff`
  - add a git library
- Rationale: reusing one bounded command path keeps timeouts, clipping, and environment stripping consistent.

## Data Model / API Contracts
- Request shape:
  - `list_files`: `{ path?: string; depth?: number }`
  - `search_files`: `{ pattern: string; file_pattern?: string; limit?: number }`
  - `run_command`: `{ command: string; timeout_seconds?: number }`
  - `git_diff`: `{ staged?: boolean; path?: string }`
- Response shape:
  - `ToolResult.success`
  - `ToolResult.output` containing the tree, match list, command output summary, or diff
  - `ToolResult.error` containing helpful failure diagnostics
- Storage/index changes: none beyond the shared file-hash state used by `edit_block` during smoke testing

## Dependency Plan
- Existing dependencies used: Node `child_process`, `fs/promises`, `path`, local git and grep binaries already assumed by the prompt.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: shell output could exceed useful model context.
  - Mitigation: central output clipping at 5000 characters with explicit truncation notes.

## Test Strategy
- Unit tests:
  - `list_files` depth filtering and noisy-entry exclusion
  - `search_files` success path, no-match success, and file-pattern filtering
  - `run_command` success, failure, timeout, and output clipping
  - `git_diff` unstaged/staged modes and non-git failure
- Integration tests:
  - smoke script temp-dir workflow covers write, read, edit, list, search, command, and diff tools together
- E2E or smoke tests:
  - `node --import tsx ./tests/manual/phase2-tools-smoke.ts`
- Edge-case coverage mapping:
  - max depth cap
  - max timeout cap
  - grep exit code `1`
  - diff on a non-repo directory

## UI Implementation Plan (if applicable)
- Behavior logic modules: Not applicable.
- Component structure: Not applicable.
- Accessibility implementation plan: Not applicable.
- Visual regression capture plan: Not applicable.

## Rollout and Risk Mitigation
- Rollback strategy: keep the registry and file-edit work, but temporarily restore the older read-only tool implementations if shell portability becomes a blocker.
- Feature flags/toggles: none.
- Observability checks: confirm command results clearly label exit code, timeout, and truncation status.

## Validation Commands
```bash
pnpm --dir shipyard test -- tests/tooling.test.ts
node --import tsx ./shipyard/tests/manual/phase2-tools-smoke.ts
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
