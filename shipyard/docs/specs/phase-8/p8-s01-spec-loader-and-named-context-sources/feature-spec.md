# Feature Spec

## Metadata
- Story ID: P8-S01
- Story Title: Spec Loader and Named Context Sources
- Author: Codex
- Date: 2026-03-25
- Related PRD/phase gate: Phase 8 spec-driven operator workflow

## Problem Statement

Shipyard already supports pasted injected context and can read files with `read_file`, but neither path is a good operator workflow for spec-driven builds. Paste-only context is manual and one-turn scoped. Raw `read_file` calls can inspect a spec, but there is no dedicated workflow for loading one or more on-disk spec documents as named context sources the coordinator can intentionally use during planning or task execution.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Add a first-class way to load spec documents from disk without relying on manual paste.
- Objective 2: Keep the mechanism read-only, bounded, and compatible with the current context envelope.
- Objective 3: Produce stable names or references so later planning/task stories can point back to the loaded specs.
- How this story or pack contributes to the overall objective set: This story provides the spec-loading substrate for operator planning and task execution.

## User Stories
- As an operator, I want to load a spec file or a small directory of specs from disk so I do not have to paste large briefs into the UI.
- As a coordinator, I want spec documents to come through as named context sources so I can cite or reload them intentionally during planning.

## Acceptance Criteria
- [ ] AC-1: A read-only `load_spec` tool exists and accepts either a file path or a directory path.
- [ ] AC-2: `load_spec` resolves only allowed paths under the target or configured spec-adjacent locations and fails clearly on invalid or unreadable paths.
- [ ] AC-3: File loads return a stable name/reference, source path, and bounded text content suitable for use as injected context in the current turn.
- [ ] AC-4: Directory loads expand deterministically into an ordered list of spec documents and skip unreadable or obviously non-text files with clear reporting.
- [ ] AC-5: Large spec bodies are truncated with explicit markers rather than silently overflowing prompt context.
- [ ] AC-6: Tool output is visible in traces or activity logs so later plan creation can show which specs were loaded.
- [ ] AC-7: The story does not require the operator to paste the loaded content manually into the next turn.

## Edge Cases
- Empty directory or no matching text files: returns a clear “no spec documents found” result.
- Duplicate filenames in different directories: stable references include enough path detail to disambiguate them.
- Binary files or extremely large files: rejected or truncated safely with an explanatory message.
- Relative paths outside the target/spec roots: rejected instead of escaping the workspace boundary.

## Non-Functional Requirements
- Security: `load_spec` is read-only and obeys the same path-safety expectations as file-read tooling.
- Performance: small spec loads should complete quickly enough to be used interactively during planning.
- Reliability: deterministic file ordering and stable reference names prevent plan drift across repeated loads.
- Observability: spec-load actions are distinguishable from ordinary file reads.

## UI Requirements (if applicable)
- If surfaced in the workbench later, loaded specs should appear as compact receipts or references, not full-screen raw document dumps.

## Out of Scope
- Semantic search or embeddings.
- Automatic retrieval of relevant specs without an explicit load step.
- Long-term cross-project spec cataloging outside the current target/workspace.

## Done Definition
- Shipyard can load spec documents from disk through a dedicated read-only workflow and make them available as named context sources for later planning and execution.
