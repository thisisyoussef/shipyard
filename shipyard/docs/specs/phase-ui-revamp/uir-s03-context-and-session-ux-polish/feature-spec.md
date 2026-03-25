# Feature Spec

## Metadata
- Story ID: UIR-S03
- Story Title: Context and Session UX Polish
- Author: Codex
- Date: 2026-03-24
- Related PRD/phase gate: Supplemental UI Revamp

## Problem Statement

Context injection, session rehydration, and error handling currently feel utilitarian. The UI needs stronger guidance and feedback so developers can work through multiple runs without losing state or confidence.

## Story Objectives

- Objective 1: Make context injection clearer, with visible confirmation and history.
- Objective 2: Make session rehydration and saved-run switching reliable and obvious after reload.
- Objective 3: Improve error and empty-state messaging.

## User Stories

- As a Shipyard developer, I want confidence that my context was applied and my session is stable across refreshes.
- As a Shipyard developer, I want to reopen a previous run from the browser UI without restarting Shipyard.

## Acceptance Criteria

- [ ] AC-1: Context injection history shows when and what was injected.
- [ ] AC-2: Reloading the page restores session state and last activity clearly.
- [ ] AC-3: Error states explain what happened and how to recover.
- [ ] AC-4: Empty states guide the user to start a run or add context.
- [ ] AC-5: Keyboard flow supports quick multi-turn usage.
- [ ] AC-6: Saved runs for the current target are visible in the UI and can be resumed in-place.

## Edge Cases

- Lost socket connection: UI surfaces reconnect attempt and the last known state.
- Invalid context payload: user sees a clear validation error.
- Very large injected context: UI truncates with an explicit expand option.

## Non-Functional Requirements

- Accessibility: focus states and keyboard navigation remain intact.
- Performance: rehydration does not lock the UI on load.

## UI Requirements

- Context panel shows last injected payload and timestamp.
- Session banner shows connected state plus active session id.
- Error and empty states have actionable copy.

## Out of Scope

- Engine retry logic changes.
- Remote session storage.

## Done Definition

- Context injection and rehydration are obvious without reading logs.
- Errors guide the user toward a next step instead of dead ends.
