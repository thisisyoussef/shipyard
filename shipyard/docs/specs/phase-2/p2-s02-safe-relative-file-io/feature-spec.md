# Feature Spec

## Metadata
- Story ID: P2-S02
- Story Title: Safe Relative File IO
- Author: Codex
- Date: 2026-03-24
- Related PRD/phase gate: Phase 2 Tools, steps 2.2 and 2.3

## Problem Statement

The current file tools return rich internal objects, expose absolute paths, and allow overwriting via the same interface used for creation. Phase 2 needs a safer contract: all file access must stay relative to the target directory, `read_file` must seed stale-read tracking, and `write_file` must default to creation-only so targeted edits go through `edit_block`.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Keep all model-facing file access target-relative and safe.
- Objective 2: Seed the shared hash-tracking mechanism that later powers stale-read detection.
- Objective 3: Prevent accidental whole-file rewrites by making `write_file` creation-first.
- How this story or pack contributes to the overall objective set: This story establishes the safe read/write primitives the pack builds on.

## User Stories
- As the Shipyard coordinator, I want `read_file` and `write_file` to behave predictably and safely so the model can inspect or create files without escaping the target repo or overwriting existing work by accident.

## Acceptance Criteria
- [ ] AC-1: `read_file` accepts a relative path, resolves it against the target directory, rejects escapes, and returns a `ToolResult` whose `output` includes the full file contents, a 16-character SHA-256 display hash, and a line count.
- [ ] AC-2: `read_file` records the file's canonical target-relative path and full current hash in a shared module-level map for later stale-read checks.
- [ ] AC-3: `read_file` returns helpful errors for file-not-found, directory-target, and generic read failures without exposing absolute paths.
- [ ] AC-4: `write_file` creates missing parent directories, rejects overwriting existing files by default, and suggests `edit_block` when the caller tries to replace an existing file.
- [ ] AC-5: `write_file` allows full replacement only when `overwrite: true` is explicitly set, and successful writes report the relative path and line count through `ToolResult.output`.

## Edge Cases
- Empty/null inputs: blank path rejects before any filesystem access.
- Boundary values: nested paths with multiple missing parent directories are created successfully.
- Invalid/malformed data: absolute paths and `../` escapes return access-denied style errors.
- External-service failures: OS read/write errors are surfaced in the error string.

## Non-Functional Requirements
- Security: never read or write outside the target directory.
- Performance: hash generation is linear and reused by later stale-read checks.
- Observability: error messages name the relative path and failure mode.
- Reliability: repeated reads of an unchanged file must keep the stored hash in sync.

## UI Requirements (if applicable)
- Required states: Not applicable.
- Accessibility contract: Not applicable.
- Design token contract: Not applicable.
- Visual-regression snapshot states: Not applicable.

## Out of Scope
- Anchor-based edits.
- Search, list, command, or git tooling.
- LLM tool-call wiring.

## Done Definition
- Shared path and hash helpers exist.
- `read_file` and `write_file` both return `ToolResult`.
- Tests cover creation, rejection, relative-path safety, and hash tracking.
