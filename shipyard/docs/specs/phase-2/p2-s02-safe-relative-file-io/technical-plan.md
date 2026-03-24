# Technical Plan

## Metadata
- Story ID: P2-S02
- Story Title: Safe Relative File IO
- Author: Codex
- Date: 2026-03-24

## Proposed Design
- Components/modules affected: `shipyard/src/tools/read-file.ts`, `shipyard/src/tools/write-file.ts`, shared tool helpers under `shipyard/src/tools/`, and `shipyard/tests/tooling.test.ts`.
- Public interfaces/contracts:
  - `read_file({ path }, targetDirectory) -> ToolResult`
  - `write_file({ path, content, overwrite? }, targetDirectory) -> ToolResult`
  - shared helpers for target-relative path resolution and read-hash storage
- Data flow summary: the coordinator calls `read_file`, which resolves the path, reads the file, stores the hash, and formats a model-readable output string. `write_file` uses the same resolver, creates directories when needed, and formats a creation summary.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - shared tool contract
  - safe file operations
  - complete bounded read-only tools
- Story ordering rationale: this story follows the registry contract because both tools need the shared `ToolResult` and self-registration behavior.
- Gaps/overlap check: this story owns read/write safety; `edit_block` guardrails remain isolated in P2-S03.
- Whole-pack success signal: later stories can trust that file reads seed stale-read state and file creation does not silently overwrite.

## Architecture Decisions
- Decision: keep the stale-read map in a shared tool-layer module reachable by both `read_file` and `edit_block`.
- Alternatives considered:
  - pass caller-supplied hashes through every edit request
  - store stale-read state inside the registry
- Rationale: the prompt requires a module-level map shared by `read_file` and `edit_block`, and keeping it in the tool layer avoids polluting registry concerns.

## Data Model / API Contracts
- Request shape:
  - `read_file`: `{ path: string }`
  - `write_file`: `{ path: string; content: string; overwrite?: boolean }`
- Response shape:
  - `ToolResult.success`
  - `ToolResult.output` containing relative path, line count, and content or write summary
  - `ToolResult.error` when the operation fails
- Storage/index changes:
  - shared `Map<string, string>` keyed by canonical target-relative path to full hash value

## Dependency Plan
- Existing dependencies used: Node `fs/promises`, `path`, `crypto`.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: path normalization bugs could create duplicate hash-map keys.
  - Mitigation: normalize to one target-relative representation before storing or reading map entries.

## Test Strategy
- Unit tests:
  - `read_file` success path
  - access-denied path escape
  - file-not-found and directory-target errors
  - `write_file` creates parents and rejects overwrite by default
  - overwrite escape hatch works only when requested
- Integration tests:
  - successful `read_file` seeds the stale-read map for a later `edit_block` consumer
- E2E or smoke tests: deferred to P2-S04
- Edge-case coverage mapping:
  - blank path
  - nested directory creation
  - relative path normalization

## UI Implementation Plan (if applicable)
- Behavior logic modules: Not applicable.
- Component structure: Not applicable.
- Accessibility implementation plan: Not applicable.
- Visual regression capture plan: Not applicable.

## Rollout and Risk Mitigation
- Rollback strategy: temporarily restore the older object-returning tools while leaving the registry contract intact.
- Feature flags/toggles: none.
- Observability checks: ensure output strings stay readable and errors stay relative-path only.

## Validation Commands
```bash
pnpm --dir shipyard test -- tests/tooling.test.ts
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
