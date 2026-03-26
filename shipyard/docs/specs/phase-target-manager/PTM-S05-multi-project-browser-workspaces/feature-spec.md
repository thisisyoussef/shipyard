# Feature Spec

## Metadata
- Story ID: PTM-S05
- Story Title: Multi-Project Browser Workspaces
- Author: Codex
- Date: 2026-03-26
- Related PRD/phase gate: Phase Target Manager

## Problem Statement

The browser workbench currently owns one mutable `SessionState`, one preview
supervisor, and one active browser action. That makes the entire workbench
single-project: if one target is mid-turn or mid-deploy, opening or creating a
different target is blocked with "Finish the current browser action before
creating a target." Users can switch targets only when the current project is
idle, which breaks the promise of using Shipyard as a multi-project operator
surface.

## Story Pack Objectives

- Objective 1: Allow the browser workbench to keep multiple target-bound
  project runtimes open at the same time.
- Objective 2: Let users activate an already-open target instantly and open a
  new target without interrupting another target's active run.
- Objective 3: Keep detailed chat, file, preview, deploy, and enrichment state
  isolated per project runtime so switching does not leak or overwrite state.
- Objective 4: Preserve the single-writer-per-target rule by deduping one open
  browser runtime per target path.
- How this story contributes to the overall objective set: it extends the
  target-manager pack from target selection into true multi-project browser
  operation without jumping all the way to the broader phase-10 task board.

## User Stories

- As a browser user, I want one Shipyard window to hold multiple active
  projects so I can bounce between targets without stopping active work.
- As a browser user, I want selecting a target that's already open to focus it
  immediately instead of reopening or blocking on another target.
- As a browser user, I want creating a new target to open its own project
  workspace even if another target is currently busy.

## Acceptance Criteria

- [x] AC-1: The browser runtime can keep more than one target-bound project
  workspace open concurrently, with each workspace owning its own session
  snapshot, preview supervisor, deploy state, and turn controller.
- [x] AC-2: If a target is already open, opening or selecting that target
  activates the existing project workspace instead of creating a duplicate.
- [x] AC-3: Creating a new target from the browser opens a new project
  workspace without requiring the currently active project to be idle first.
- [x] AC-4: The workbench exposes a project board or tab strip that shows all
  open projects, the active project, and a concise status for each one.
- [x] AC-5: Activating another project restores that project's correct chat,
  file event, session history, preview, deploy, and target metadata instead of
  showing the previously active project's state.
- [x] AC-6: Background updates from a non-active project do not clobber the
  active project's transcript, preview, or reducer state; they update only the
  owning project summary until that project is activated.
- [x] AC-7: The browser target picker remains the way to open existing targets
  or create new ones, but its actions become "activate or open" rather than
  "replace the one global target."
- [x] AC-8: Existing CLI target-manager behavior and browser single-target
  startup remain backward compatible.
- [x] AC-9: Tests cover project-runtime deduping, active-project switching,
  non-active update isolation, and create/open flows while another project is
  busy.

## Edge Cases

- Opening the same target twice should focus the existing project workspace
  instead of creating a second writer on the same target.
- A project can stay busy in the background while another project is active in
  the foreground.
- A background project's enrichment or deploy updates must not overwrite the
  active project's visible preview or transcript.
- Reloading the browser should recover the active project snapshot and still
  surface any additional open-project summaries retained by the runtime.
- Starting from target-manager mode with no selected target should still allow
  the first open/create action to bootstrap the project board.

## Non-Functional Requirements

- Reliability: per-project runtime state must remain isolated and recoverable.
- Performance: activating an already-open project should feel immediate.
- Accessibility: the project board must be keyboard navigable and expose clear
  active-state semantics.
- Observability: traces and session events should preserve which target/project
  runtime produced a change.

## UI Requirements

- Add a compact project board in the workbench shell that lists open projects,
  highlights the active project, and shows busy/ready/background status.
- Preserve the existing calm split-pane workbench; the project board should
  feel like contextual navigation, not a second dashboard.
- The target switcher should offer two clear actions: open existing target and
  create new target.
- Project activation should feel instant, and background project activity
  should remain visible through concise status badges rather than noisy live
  transcript swapping.

## Out of Scope

- Running two browser runtimes against the same target concurrently.
- Cross-browser multi-user coordination for project activation.
- A generalized background task board for arbitrary plan tasks.
- Project deletion, archival, or reordering.

## Done Definition

- Shipyard browser mode can keep multiple targets open concurrently.
- Users can create or open another target while a different target is busy.
- Switching between open projects restores the correct per-project state.
- The target-manager pack and story docs are updated with implementation
  evidence.
