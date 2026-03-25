# Technical Plan

## Metadata
- Story ID: P8-S01
- Story Title: Spec Loader and Named Context Sources
- Author: Codex
- Date: 2026-03-25

## Proposed Design
- Components/modules affected:
  - `shipyard/src/tools/specs/load-spec.ts`
  - `shipyard/src/tools/index.ts`
  - related tests such as `shipyard/tests/spec-loader.test.ts`
  - minimal runtime wiring where current-turn injected context is assembled or logged
- Public interfaces/contracts:
  - `load_spec`
  - `LoadedSpecDocument` / similar typed return shape with `name`, `path`, and `content`
- Data flow summary: the coordinator or later plan/task runner calls `load_spec`, the tool reads the spec document(s), returns named bounded text blocks, and the current planning/execution path attaches those blocks as scoped context without relying on manual paste.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - spec-driven planning without paste-only UX
  - persisted operator task queues
  - resumable next-task execution
  - lower-token greenfield bootstrap
- Story ordering rationale: this story lands first because the plan/task stories need a dedicated spec-loading path rather than ad hoc file reads and pasted notes.
- Gaps/overlap check: `read_file` remains valid for normal repo inspection, but `load_spec` adds named spec receipts and deterministic directory expansion instead of replacing generic file reading.
- Whole-pack success signal: later stories can reference loaded specs by name/path instead of expecting the user to re-paste context every time.

## Architecture Decisions
- Decision: keep `load_spec` read-only and separate from generic `read_file`.
- Alternatives considered:
  - rely on `read_file` alone
  - tell operators to keep pasting spec text manually
- Rationale: Shipyard already reads files well, but this story needs named spec receipts, deterministic directory expansion, and bounded context formatting tuned for operator workflow.

## Data Model / API Contracts
- Request shape:
  - `path`
  - optional `mode` or `kind` if file vs directory distinction needs to be explicit
- Response shape:
  - one or more loaded spec documents
  - each with stable display name/reference, source path, and bounded content
- Storage/index changes:
  - no persistent spec cache required in this story
  - traces/activity logs should include loaded spec names/paths

## Dependency Plan
- Existing dependencies used: tool registry, existing path safety helpers, context envelope wiring, local trace logging.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: raw spec bodies become too large for prompt context.
  - Mitigation: add explicit truncation and deterministic directory/file caps.

## Test Strategy
- Unit tests:
  - path validation
  - single-file load
  - deterministic directory expansion
  - truncation markers
  - duplicate-name disambiguation
- Integration tests:
  - tool registration and execution through the standard tool contract
  - trace/activity summary visibility
- E2E or smoke tests:
  - deferred to later stories where planning and next-task flows actually consume `load_spec`
- Edge-case coverage mapping:
  - invalid path
  - empty directory
  - non-text file
  - oversized file

## UI Implementation Plan (if applicable)
- Behavior logic modules:
  - no dedicated UI is required in this story
- Component structure:
  - any later workbench surface should reuse compact context-receipt patterns
- Accessibility implementation plan:
  - not applicable in this tool-focused story
- Visual regression capture plan:
  - not applicable in this tool-focused story

## Rollout and Risk Mitigation
- Rollback strategy: `load_spec` is additive and can be removed without affecting existing `read_file` or paste workflows.
- Feature flags/toggles: not required if the tool remains opt-in and read-only.
- Observability checks: traces/local logs should show which spec docs were loaded and whether truncation occurred.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
