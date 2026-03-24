# Feature Spec

## Metadata
- Story ID: P2-S03
- Story Title: Surgical `edit_block` Guardrails
- Author: Codex
- Date: 2026-03-24
- Related PRD/phase gate: Phase 2 Tools, step 2.4

## Problem Statement

`edit_block` is the core safeguard that keeps Shipyard acting like a coding agent instead of a whole-file generator. The current implementation only checks a caller-supplied hash and anchor uniqueness. Phase 2 needs the stricter behavior from the prompt: shared stale-read detection, actionable zero-match and multi-match errors, a no-op path for unchanged edits, and a rewrite-size guard that pushes large changes back into smaller anchored edits.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Turn the stale-read map from P2-S02 into an actual concurrency guard.
- Objective 2: Make anchored editing descriptive enough for the model to recover from failure without human help.
- Objective 3: Prevent large rewrites from sneaking through the edit tool.
- How this story or pack contributes to the overall objective set: This story delivers the pack's central safety mechanism.

## User Stories
- As the Shipyard coordinator, I want `edit_block` to reject stale, ambiguous, or oversized edits so the model is forced into small, auditable changes.

## Acceptance Criteria
- [ ] AC-1: `edit_block` resolves the path relative to the target directory, rejects escapes, and tells the caller to use `write_file` if the file does not exist.
- [ ] AC-2: `edit_block` computes the current file hash and rejects the edit when the shared hash map shows the file changed since the last successful `read_file`, telling the agent to re-read first.
- [ ] AC-3: Zero anchor matches return an error that includes the first 30 lines of the current file and guidance to check whitespace and indentation.
- [ ] AC-4: More than one anchor match returns an error naming the exact count and telling the caller to include more surrounding context.
- [ ] AC-5: When `old_string` equals `new_string`, the tool returns success with a no-change note instead of rewriting the file.
- [ ] AC-6: When the change would affect more than 60% of a file larger than 500 characters, the tool rejects the edit and tells the caller to break it into smaller changes.
- [ ] AC-7: Successful edits update the shared hash map and return a summary with removed/added line counts, new total line count, and truncated before/after previews.

## Edge Cases
- Empty/null inputs: blank `old_string` rejects immediately.
- Boundary values: the diff-size guard only applies when the file is larger than 500 characters.
- Invalid/malformed data: stale reads, missing files, and ambiguous anchors are all recoverable errors.
- External-service failures: write failures return the OS error message in `error`.

## Non-Functional Requirements
- Security: never operate outside the target directory.
- Performance: one extra read and hash per edit is acceptable for correctness.
- Observability: failure messages must guide the next recovery step.
- Reliability: a successful edit must update the stored hash so the next edit can detect further drift.

## UI Requirements (if applicable)
- Required states: Not applicable.
- Accessibility contract: Not applicable.
- Design token contract: Not applicable.
- Visual-regression snapshot states: Not applicable.

## Out of Scope
- AST-aware or line-number-based editing.
- Multi-anchor batch edits.
- Automatic retry logic after a stale read.

## Done Definition
- Guardrail failures are covered by focused tests.
- Success output is concise but specific enough for the coordinator to reason about.
- Large rewrites are rejected before write time.
