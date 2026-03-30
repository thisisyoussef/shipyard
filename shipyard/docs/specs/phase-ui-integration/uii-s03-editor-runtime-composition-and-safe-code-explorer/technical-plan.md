# Technical Plan

## Metadata
- Story ID: UII-S03
- Story Title: Editor Runtime Composition and Safe Code Explorer
- Author: Codex
- Date: 2026-03-28

## Proposed Design
- Components/modules affected:
  - `shipyard/ui/src/views/EditorView.tsx`
  - `shipyard/ui/src/ShipyardWorkbench.tsx`
  - reusable panel modules under `shipyard/ui/src/panels/`
  - new editor route adapter under `shipyard/ui/src/`
  - `shipyard/src/ui/server.ts`
  - optional shared file-browser schema module under `shipyard/src/ui/`
- Public interfaces/contracts:
  - `EditorRouteModel`
  - `FileTreeNode`
  - `FileTreeResponse`
  - `FileReadResponse`
  - read-only HTTP endpoints for file tree + file contents
- Data flow summary: the editor route adapter consumes shared controller state
  and passes live props into reused transcript/composer/preview/file surfaces;
  the Code tab fetches a sandboxed file tree and read-only file contents from
  the active target.

## Pack Cohesion and Sequencing
- Higher-level pack objectives:
  - real editor route
  - reusable workbench surfaces
  - safe code exploration
  - reload-safe UX
- Story ordering rationale: this story depends on the shared controller from
  `UII-S01` and must land before ultimate/board stories can use the new editor.
- Gaps/overlap check: code browsing belongs here; typed ultimate controls remain
  `UII-S04`.
- Whole-pack success signal: the redesigned editor becomes a first-class runtime
  workspace without sacrificing current workbench behavior.

## Architecture Decisions
- Decision: extract reusable workbench surfaces from `ShipyardWorkbench`
  instead of nesting the old shell inside the new editor layout forever.
  - Alternatives considered:
    - render `ShipyardWorkbench` wholesale inside `EditorView`
    - duplicate chat/preview/files logic in the editor route
  - Rationale: extraction keeps behavior shared while still letting the new
    layout own composition.
- Decision: use read-only HTTP endpoints for code browsing rather than routing
  file contents through the websocket stream.
  - Rationale: tree/file fetches are request-response data, not live event
    stream traffic, and should not complicate websocket reducers.
- Decision: persist layout and tab preferences per target/project.
  - Rationale: one global editor layout key produces jarring cross-project
    carryover.

## Data Model / API Contracts
- Request shape:
  - `GET /api/files/tree?projectId=<id>`
  - `GET /api/files/read?projectId=<id>&path=<relative-path>`
- Response shape:
  - tree response with root metadata and nested nodes
  - file read response with contents plus `truncated`, `binary`, and `sizeBytes`
    metadata
- Storage/index changes:
  - browser-local editor prefs keyed by target or project id

## Dependency Plan
- Existing dependencies used: current panels, shared controller, target/project
  identity, backend HTTP server.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: code browser endpoints expose unsafe filesystem paths.
  - Mitigation: require active project context, resolve against the target root,
    reject traversal, bound file size, and block binary payloads.
  - Risk: panel extraction regresses legacy workbench behavior.
  - Mitigation: keep a supported fallback composition path until equivalence is
    proven by tests.

## Test Strategy
- Unit tests:
  - file-tree shaping and path validation
  - editor preference persistence
- Integration tests:
  - editor route renders live controller state
  - legacy workbench continues to function
  - code-browser endpoints reject traversal and large/binary files correctly
- E2E or smoke tests:
  - open product from dashboard, inspect preview/files/code, reload, repeat
- Edge-case coverage mapping:
  - no preview available
  - no file selected
  - binary file
  - oversized file
  - disconnected runtime

## UI Implementation Plan
- Behavior logic modules:
  - editor route adapter
  - code browser client
  - per-target layout prefs
- Component structure:
  - `EditorView`
  - reused chat/composer/preview/file panels
  - new code tab tree/viewer
- Accessibility implementation plan:
  - keyboard-operable tabs, tree items, and splitter
- Visual regression capture plan:
  - preview tab, code tab, files tab, empty states

## Rollout and Risk Mitigation
- Rollback strategy: keep the current legacy workbench composition available
  while the new editor route proves out the extracted surfaces.
- Feature flags/toggles: none required.
- Observability checks: log or surface denied/truncated/binary file responses so
  the operator can tell why a file is not shown.

## Validation Commands
```bash
pnpm --dir shipyard test -- tests/ui-runtime.test.ts tests/ui-view-models.test.ts tests/ui-workbench.test.ts
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
