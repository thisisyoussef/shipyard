# Feature Spec

## Metadata
- Story ID: UIV2-S06
- Story Title: Session and Context Panels
- Author: Claude
- Date: 2026-03-24
- Related PRD/phase gate: Phase UI v2 — Complete UI Reimagination
- Estimated effort: 2h
- Depends on: UIV2-S02 (Shell and Navigation Chrome)
- Skills: arrange, polish, critique

## Problem Statement

The session panel is a dense fact grid that dumps all session metadata at once — connection state, project signals, file paths, turn counts, timestamps — all at the same visual weight. There is no hierarchy or progressive disclosure. A developer glancing at it cannot instantly tell whether the session is healthy, errored, or disconnected without reading multiple fields.

The context panel mixes the injection input area with queued context and injection history. The history shows full-size cards for every past context injection, consuming vertical space and pushing the input area out of view during long sessions. There is no condensed timeline view, and no clear visual separation between "what I'm about to inject," "what's queued for next turn," and "what was injected in the past."

Neither panel respects the progressive disclosure principle established in the pack goals.

## Story Objectives

- Objective 1: Rebuild the session panel with progressive disclosure — a glanceable summary at the top, expandable detail sections below.
- Objective 2: Rebuild the context panel with three clear zones: input area (always visible), queued preview, and history timeline.
- Objective 3: Make session health visible at a glance via a status dot + one-line summary without reading metadata.
- Objective 4: Condense context history into a timeline with timestamp, turn ID, and content preview — not full cards.

## User Stories

- As a developer monitoring an agent session, I want to see connection status and session health at a glance so I know if something needs attention.
- As a developer, I want to expand session details on demand so the panel stays calm by default.
- As a developer injecting context, I want a clear, always-visible input area so I can add context without scrolling.
- As a developer reviewing past injections, I want a condensed timeline so I can scan history quickly without full cards taking up the viewport.

## Acceptance Criteria

- [ ] AC-1: Session panel shows a status dot (connected/disconnected/error) + one-line summary (e.g., "Connected — Turn 7 of 12") at the top, always visible.
- [ ] AC-2: Session metadata (project path, signals, timestamps, agent model) is collapsed by default in expandable sections.
- [ ] AC-3: Project signals and file paths are each in their own collapsible group with item counts in the header.
- [ ] AC-4: Context panel has 3 visually distinct zones: (1) input area at top, always visible; (2) queued context preview below input; (3) history timeline at bottom.
- [ ] AC-5: Context history shows condensed entries: timestamp + turn ID + first-line preview of injected content. Full content expandable on click.
- [ ] AC-6: History timeline entries use alternating subtle background tints for scanability.
- [ ] AC-7: Session panel logic extracted to `SessionPanel.tsx`; context panel logic extracted to `ContextPanel.tsx`.
- [ ] AC-8: Both panels use the collapsible sidebar structure established in S02.
- [ ] AC-9: Panels are keyboard-navigable; collapsible sections respond to Enter/Space.
- [ ] AC-10: Passes `arrange`, `polish`, and `critique` skill evaluations.

## Notes / Evidence

- Current session rendering lives inline in `ShipyardWorkbench.tsx`.
- Context injection logic lives in `context-ui.ts` — this module provides the data; the new component handles presentation.
- The collapsible sidebar pattern from S02 (`<details>`/`<summary>` or custom accordion) should be reused, not reinvented.
- Status dot pattern: 8px circle, color from `--color-status-*` tokens, with `aria-label` for screen readers.

## Out of Scope

- Editing or deleting past context injections from the history timeline.
- Real-time streaming of context injection (context is submitted discretely, not streamed).
- Session comparison (comparing two sessions side by side).
- Changing the WebSocket session protocol or `workbench-state.ts` data shape.

## Done Definition

- Session health is visible at a glance without reading metadata fields.
- Session detail is available on demand via collapsible sections.
- Context injection has a clear, always-visible input area separate from history.
- Context history is a condensed, scannable timeline.
- Both panels are extracted to dedicated components and are keyboard-accessible.
