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
- [x] AC-1: The editor route renders live chat, composer, preview, files, and
  session context against the shared browser controller instead of mock data.
- [x] AC-2: Legacy `ShipyardWorkbench` behavior remains available through
  extracted reusable surfaces or a supported fallback path during the refactor.
- [x] AC-3: The Code tab can browse the active target directory through a
  read-only sandboxed API with path validation, size limits, and binary-file
  handling.
- [x] AC-4: Editor split ratio and active tab persist per target or project and
  restore cleanly after reload.
- [x] AC-5: Preview-unavailable, no-diff, no-session, large-file, binary-file,
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

## Implementation Evidence

- Shared live editor/runtime composition landed in `shipyard/ui/src/App.tsx`,
  `shipyard/ui/src/views/EditorView.tsx`,
  `shipyard/ui/src/workbench-surfaces.tsx`, and
  `shipyard/ui/src/ShipyardWorkbench.tsx`.
  Representative snippet:
  ```tsx
  <EditorView
    productId={editorRouteState.productId}
    sessionState={controller.viewState.sessionState}
    turns={controller.deferredTurns}
    fileEvents={controller.deferredFileEvents}
    previewState={controller.viewState.previewState}
  />
  ```
- The safe code browser contract landed in `shipyard/src/ui/contracts.ts`,
  `shipyard/src/ui/code-browser.ts`, `shipyard/src/ui/server.ts`,
  `shipyard/ui/src/code-browser-client.ts`, and
  `shipyard/ui/src/panels/CodeExplorerPanel.tsx`.
  Representative snippet:
  ```ts
  if (requestPath === "/api/files/tree") {
    await handleCodeBrowserTreeRequest(request, response, requestLocation);
    return;
  }
  ```
- Post-ship hosted access hardening aligned the code-browser HTTP gate with the
  same shared access-cookie contract used by `/api/access`, keeping direct
  token fallback additive for older callers.
  Representative snippet:
  ```ts
  function requestIsAuthorized(request: IncomingMessage): boolean {
    if (isRequestAuthorized(request)) {
      return true;
    }

    return readLegacyAccessToken(request) === expectedToken;
  }
  ```
- Per-target layout persistence landed in
  `shipyard/ui/src/editor-preferences.ts` and
  `shipyard/ui/src/views/EditorView.tsx`.
  Representative snippet:
  ```ts
  nextPreferences = setEditorActiveTab(nextPreferences, editorScopeKey, layout.activeTab);
  nextPreferences = setEditorSplitRatio(nextPreferences, editorScopeKey, layout.splitRatio);
  writeEditorPreferences(nextPreferences);
  ```
- Preview harness compatibility landed in
  `shipyard/ui/src/preview-harness.tsx` with a mock `CodeBrowserClient`
  injection so `/preview.html` stays standalone.
- Coverage landed in `shipyard/tests/ui-editor-preferences.test.ts`,
  `shipyard/tests/ui-code-browser.test.ts`,
  `shipyard/tests/ui-editor-view.test.ts`, and
  `shipyard/tests/ui-runtime.test.ts`.
