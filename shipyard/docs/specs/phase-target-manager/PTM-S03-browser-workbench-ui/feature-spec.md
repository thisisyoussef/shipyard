# Feature Spec

## Metadata
- Story ID: PTM-S03
- Story Title: Browser Workbench Target UI
- Author: Codex
- Date: 2026-03-24
- Related PRD/phase gate: Phase Target Manager

## Problem Statement

The terminal experience for target management (PTM-S02) works but the browser workbench has no awareness of targets. Users in `--ui` mode cannot see which target is active, switch targets, create new ones, or see enrichment progress.

## Story Objectives

- Objective 1: Add WebSocket message contracts for target manager events so the browser can participate in target selection and switching.
- Objective 2: Build a target header bar in the workbench that shows the active target name, description, and enrichment status.
- Objective 3: Add a target switcher UI (dropdown or panel) that lists available targets and allows selection.
- Objective 4: Show enrichment progress with a streaming indicator when `enrich_target` is running.

## User Stories

- As a user in browser mode, I want to see which project I am working on at all times.
- As a user in browser mode, I want to switch targets without leaving the workbench.
- As a user in browser mode, I want to create a new target through a guided dialog.
- As a user in browser mode, I want to see enrichment progress so I know the system is working.

## Acceptance Criteria

- [ ] AC-1: `TargetManagerState` WebSocket message is defined in `contracts.ts` with fields: currentTarget (path, name, profileSummary), availableTargets list, enrichmentStatus.
- [ ] AC-2: `TargetSwitchRequest` and `TargetSwitchComplete` WebSocket messages are defined.
- [ ] AC-3: `EnrichmentProgress` WebSocket message streams enrichment status (started, in-progress, complete, error).
- [ ] AC-4: The workbench UI displays a target header bar showing the active target name and one-line description.
- [ ] AC-5: Clicking the target header opens a target switcher panel listing available targets with name, language, framework, and profile status.
- [ ] AC-6: Selecting a target from the panel triggers a switch and the UI updates to reflect the new target.
- [ ] AC-7: A "New Target" action in the panel opens a creation dialog (name, description, scaffold type selection).
- [ ] AC-8: During enrichment, the header shows a spinner/progress indicator that resolves to the enriched description.
- [ ] AC-9: The server (`src/ui/server.ts`) emits target manager events and handles switch requests from the browser.
- [ ] AC-10: `WorkbenchViewState` gains target manager fields so the browser can recover state on reload.

## Edge Cases

- Browser connects after target was already selected in terminal: server sends current `TargetManagerState` on connect.
- Target switch fails (invalid path): error message displayed in the UI, no state change.
- Enrichment fails mid-stream: progress indicator shows error state with retry option.
- No targets available in targets directory: switcher panel shows empty state with prominent "Create New" action.

## Non-Functional Requirements

- Performance: target list should render within 500ms of opening the switcher.
- Accessibility: target switcher is keyboard-navigable.
- Responsiveness: header bar adapts to narrow viewports without breaking layout.

## UI Requirements (if applicable)

- Target header bar: fixed position below the main toolbar, shows target name (bold) + description (muted). Click to expand switcher.
- Target switcher panel: overlay or sidebar listing targets as cards. Each card shows name, language badge, framework badge, profile status (enriched/not enriched).
- Creation dialog: form with name input, description textarea, scaffold type select dropdown, create button.
- Enrichment indicator: inline spinner in header bar during enrichment, resolves to enriched description text.

## Out of Scope

- Custom themes or branding for the target switcher.
- Drag-and-drop target reordering.
- Target deletion (too dangerous for v1).
- Multi-target sessions (working on two targets simultaneously).

## Done Definition

- The browser workbench shows the active target and allows switching, creating, and enriching targets through the UI.
- All WebSocket contracts are typed with Zod schemas.
- State recovery on browser reload correctly restores the target context.
