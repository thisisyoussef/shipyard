# Technical Plan

## Metadata
- Story ID: P2-S03
- Story Title: Surgical `edit_block` Guardrails
- Author: Codex
- Date: 2026-03-24

## Proposed Design
- Components/modules affected: `shipyard/src/tools/edit-block.ts`, shared file/hash helpers from P2-S02, and `shipyard/tests/tooling.test.ts`.
- Public interfaces/contracts:
  - `edit_block({ path, old_string, new_string }, targetDirectory) -> ToolResult`
  - helper utilities for occurrence counting, preview formatting, diff-size estimation, and line-count summaries
- Data flow summary: resolve path, confirm the file exists, compute current hash, compare against the stored read hash, validate the anchor count and edit size, write the replacement once, then refresh the stored hash and return a summary string.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - shared tool contract
  - safe file operations
  - complete bounded read-only tools
- Story ordering rationale: this story follows P2-S02 because it depends on the shared read-hash map.
- Gaps/overlap check: this story owns mutation guardrails only; creation and read-only tools stay in their own stories.
- Whole-pack success signal: the coordinator can recover from edit failures with tool feedback alone.

## Architecture Decisions
- Decision: use the read-hash map populated by `read_file` instead of passing hashes through the edit request.
- Alternatives considered:
  - keep the caller-supplied `expectedHash`
  - require the model to send the hash back every time
- Rationale: the prompt explicitly wants stale-read detection tied to the last successful read, and centralizing the state reduces repeated model bookkeeping.

## Data Model / API Contracts
- Request shape:
  - `{ path: string; old_string: string; new_string: string }`
- Response shape:
  - `ToolResult.success`
  - `ToolResult.output` containing edit summary or no-op note
  - `ToolResult.error` containing recovery guidance
- Storage/index changes:
  - consumes and updates the shared path-to-hash map from P2-S02

## Dependency Plan
- Existing dependencies used: Node `fs/promises`, `crypto`, and the shared tool helpers from P2-S02.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: preview text could get too large and waste tokens.
  - Mitigation: truncate before/after previews and the zero-match file preview to bounded lengths.

## Test Strategy
- Unit tests:
  - unique-anchor success path
  - zero-match failure with file preview
  - multi-match failure with exact count
  - stale-read failure
  - no-op success when strings match
  - diff-size guard on large rewrites
- Integration tests:
  - `read_file` followed by `edit_block` updates the stored hash for a second edit pass
- E2E or smoke tests: direct smoke coverage in P2-S04
- Edge-case coverage mapping:
  - blank anchor
  - missing file
  - file smaller than the diff-size threshold exemption

## UI Implementation Plan (if applicable)
- Behavior logic modules: Not applicable.
- Component structure: Not applicable.
- Accessibility implementation plan: Not applicable.
- Visual regression capture plan: Not applicable.

## Rollout and Risk Mitigation
- Rollback strategy: temporarily restore the simpler anchor replacement while keeping file-IO safety from P2-S02.
- Feature flags/toggles: none.
- Observability checks: error messages should always tell the coordinator the next safe tool or action.

## Validation Commands
```bash
pnpm --dir shipyard test -- tests/tooling.test.ts
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
