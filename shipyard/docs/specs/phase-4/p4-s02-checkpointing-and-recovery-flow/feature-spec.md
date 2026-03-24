# Feature Spec

## Metadata
- Story ID: P4-S02
- Story Title: Checkpointing and Recovery Flow
- Author: Codex
- Date: 2026-03-24
- Related PRD/phase gate: Phase 4 LangGraph State Machine, step 4.2

## Problem Statement

Phase 4 introduces automatic verification and retries, which means Shipyard needs a safe way to undo failed edits. The current checkpoint helper can copy a file once, but it does not yet implement the session-scoped naming, latest-checkpoint restore behavior, or retry/blocking integration described in the Phase 4 brief.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Make every file edit reversible without manual cleanup.
- Objective 2: Encode retry limits and blocked-file escalation into the recovery path.
- Objective 3: Keep checkpoint behavior deterministic and easy to inspect on disk.
- How this story or pack contributes to the overall objective set: This story supplies the safety and recovery primitives that make the state machine trustworthy.

## User Stories
- As the Shipyard engine, I want to checkpoint files before edits and restore the newest checkpoint on failed verification so retries stay safe and bounded.

## Acceptance Criteria
- [ ] AC-1: `CheckpointManager` exposes `checkpoint(relativePath)` that reads a target-relative file, copies it into `.shipyard/checkpoints/{sessionId}/` with a timestamp-prefixed filename, and returns the checkpoint path.
- [ ] AC-2: `CheckpointManager` exposes `revert(relativePath)` that finds the newest checkpoint for that relative path, restores it into the target directory, and returns `true` when a restore occurred or `false` when none existed.
- [ ] AC-3: The act path calls `checkpoint` before every `edit_block` execution.
- [ ] AC-4: The recover path calls `revert`, re-reads the modified file, increments the retry count for that file, and marks the file blocked when retries exceed 2.
- [ ] AC-5: When a file becomes blocked, the runtime sets status `done` and surfaces that escalation in the final response instead of retrying forever.

## Edge Cases
- Empty/null inputs: blank relative paths reject immediately.
- Boundary values: restoring when no checkpoint exists returns `false` rather than throwing.
- Invalid/malformed data: checkpoint filenames should still sort reliably by timestamp even across rapid repeated edits.
- External-service failures: filesystem copy/read/write failures bubble up as recovery errors.

## Non-Functional Requirements
- Security: checkpoints must stay under `.shipyard/checkpoints/<sessionId>/`.
- Performance: checkpoint lookup should rely on filename sorting, not full file hashing on every restore.
- Observability: recovery logs should say whether a checkpoint was restored or missing.
- Reliability: the most recent checkpoint for the same file always wins.

## UI Requirements (if applicable)
- Required states: Not applicable.
- Accessibility contract: Not applicable.
- Design token contract: Not applicable.
- Visual-regression snapshot states: Not applicable.

## Out of Scope
- Checkpoint deduplication across sessions.
- Database-backed or LangGraph-native checkpoint persistence.
- Restoring multiple files in a batch.

## Done Definition
- Checkpoints are session-scoped and timestamped.
- Recover can restore the latest checkpoint automatically.
- Retry and blocked-file behavior is covered by tests and runtime status updates.
