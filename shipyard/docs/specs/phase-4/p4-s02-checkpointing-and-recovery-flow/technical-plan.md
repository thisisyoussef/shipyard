# Technical Plan

## Metadata
- Story ID: P4-S02
- Story Title: Checkpointing and Recovery Flow
- Author: Codex
- Date: 2026-03-24

## Proposed Design
- Components/modules affected:
  - `shipyard/src/checkpoints/manager.ts`
  - `shipyard/src/engine/` recover-node helpers
  - shared file-reading/edit helpers from the tool layer
  - `shipyard/tests/` for checkpoint behavior coverage
- Public interfaces/contracts:
  - `checkpoint(relativePath): Promise<string | CheckpointRecord>`
  - `revert(relativePath): Promise<boolean>`
  - recover-node state updates for retry counts, blocked files, and `lastEditedFile`
- Data flow summary: the act path checkpoints before `edit_block`, the verify path sets pass/fail status, and the recover path restores the newest checkpoint, re-reads the file, increments retries, and either loops back or blocks the file.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - stateful execution engine
  - reversible editing and bounded recovery
  - real CLI wiring and trace capture
- Story ordering rationale: checkpointing depends on the graph runtime contract from P4-S01 and in turn unblocks safe verification retries.
- Gaps/overlap check: this story owns file rollback and retry escalation only; context serialization and CLI wiring stay separate.
- Whole-pack success signal: failed edits can be rolled back automatically and blocked files become explicit state, not hidden side effects.

## Architecture Decisions
- Decision: use a Shipyard-local checkpoint store under `.shipyard/checkpoints/<sessionId>/` even though LangGraph has its own checkpointing abstractions.
- Alternatives considered:
  - rely on LangGraph checkpointers only
  - defer checkpointing and attempt manual reverse edits
- Rationale: the product requirement is file restoration, not just graph-state persistence, and the local filesystem copy is the simplest reliable primitive.

## Data Model / API Contracts
- Request shape:
  - target-relative file path
  - session ID from the current session state
- Response shape:
  - checkpoint path or record
  - boolean restore result
  - recover-node updates to retry counts and blocked files
- Storage/index changes:
  - `.shipyard/checkpoints/<sessionId>/<timestamp>-<basename>`

## Dependency Plan
- Existing dependencies used: Node `fs/promises`, path helpers, Phase 2 file tools.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: basename-only checkpoint names can collide for files with the same name in different directories.
  - Mitigation: encode a sanitized relative path or maintain enough path context in the checkpoint filename and lookup strategy.

## Test Strategy
- Unit tests:
  - checkpoint creates a session-scoped copy
  - revert picks the latest matching checkpoint
  - revert returns `false` when no checkpoint exists
  - retry count increments and blocks after the third failure
- Integration tests:
  - act -> verify fail -> recover restores the prior file contents
- E2E or smoke tests: deferred to P4-S04
- Edge-case coverage mapping:
  - repeated edits to the same file
  - files with duplicate basenames in different directories
  - failed restore path

## UI Implementation Plan (if applicable)
- Behavior logic modules: Not applicable.
- Component structure: Not applicable.
- Accessibility implementation plan: Not applicable.
- Visual regression capture plan: Not applicable.

## Rollout and Risk Mitigation
- Rollback strategy: if the automatic restore path is unstable, keep checkpoint creation and require the runtime to stop instead of retrying.
- Feature flags/toggles: none.
- Observability checks: log checkpoint creation and restore outcomes with relative paths and session ID.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
