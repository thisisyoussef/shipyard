# Feature Spec

## Metadata
- Story ID: UII-S03
- Story Title: Editor Runtime Composition and Safe Code Explorer
- Author: Codex
- Date: 2026-03-28
- Related PRD/phase gate: Phase UI Integration

## Problem Statement

The new Editor view is visually ready but still uses mock chat, mock files, and
mock code. The real Shipyard panels already exist, but they are composed inside
the legacy workbench shell instead of the new editor layout. The Code tab also
has no safe way to browse target files. Shipyard needs a route-native editor
surface that reuses current runtime behavior and adds a read-only code explorer
without undermining edit safety.

## Story Pack Objectives
- Objective 1: move the editor from mock data to real runtime state.
- Objective 2: reuse existing workbench behavior instead of forking it.
- Objective 3: add a safe code-browsing surface that helps operators inspect
  actual files from the target directory.
- How this story contributes to the overall objective set: it makes the new
  editor route the real place where Shipyard work happens.

## User Stories
- As an operator, I want the redesigned editor to show the same live transcript,
  composer, preview, and diff information the current workbench already has.
- As an operator, I want a Code tab that lets me inspect real project files
  without dropping to the terminal.
- As a returning user, I want my editor layout and active workspace tab to come
  back after reload.

## Acceptance Criteria
- [ ] AC-1: The editor route renders live chat, composer, preview, files, and
  session context against the shared browser controller instead of mock data.
- [ ] AC-2: Legacy `ShipyardWorkbench` behavior remains available through
  extracted reusable surfaces or a supported fallback path during the refactor.
- [ ] AC-3: The Code tab can browse the active target directory through a
  read-only sandboxed API with path validation, size limits, and binary-file
  handling.
- [ ] AC-4: Editor split ratio and active tab persist per target or project and
  restore cleanly after reload.
- [ ] AC-5: Preview-unavailable, no-diff, no-session, large-file, binary-file,
  and denied-path states are explicit and user-readable.

## Edge Cases
- Empty/null inputs: no active session yet, empty target, no recent file diffs.
- Boundary values: very large repositories should not lock up the Code tab.
- Invalid/malformed data: path traversal, binary files, and oversized files are
  rejected safely with clear UI states.
- External-service failures: preview supervisor or file-read failures should not
  blank the whole editor.

## Non-Functional Requirements
- Security: code browsing is read-only and target-root restricted.
- Reliability: editor route must preserve current upload/submit/cancel behavior.
- Performance: tree loading and file reads must be bounded enough for live use.
- Maintainability: panel reuse should reduce, not increase, duplicated UI logic.

## UI Requirements
- Required states: live editor, preview unavailable, no file selected, large
  file truncated, binary file blocked, no diffs yet, reconnecting.
- Accessibility contract: tabs, splitter, file tree, and code viewer are
  keyboard reachable and readable.
- Design token contract: editor layout continues using the existing Art Deco
  tokens, badges, and motion constraints.
- Visual-regression snapshot states: transcript+preview, transcript+files,
  transcript+code, empty-code state, preview-unavailable state.

## Out of Scope
- Editing files from the Code tab.
- Full-text search, symbol navigation, or IDE-grade code intelligence.
- New syntax-highlighting dependencies.

## Done Definition
- The new editor route becomes a real Shipyard workspace with live runtime
  panels and a safe read-only code browser.
