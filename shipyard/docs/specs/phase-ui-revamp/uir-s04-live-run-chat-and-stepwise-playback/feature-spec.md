# Feature Spec

## Metadata
- Story ID: UIR-S04
- Story Title: Live Run Chat and Stepwise Playback
- Author: Codex
- Date: 2026-03-25
- Related PRD/phase gate: Supplemental UI Revamp

## Problem Statement

The browser workbench already had saved runs and grouped activity, but it still
felt too retrospective. Operators could see that a run finished, yet they could
not reliably watch the execution unfold step by step while it was happening, or
flip to a simpler chat-first view for conversational iteration.

## Story Objectives

- Objective 1: Add a chat-first workspace that reads like a modern AI product
  while preserving Shipyard session detail.
- Objective 2: Add a live playback workspace that shows tool progress,
  sequential edits, and before/after evidence before the turn is fully done.
- Objective 3: Expose trace metadata and repeated file edits without collapsing
  critical evidence.

## User Stories

- As a Shipyard developer, I want to read the current run as a conversation so
  I can iterate quickly without parsing a dense activity console first.
- As a Shipyard developer, I want to watch edit steps arrive during the run so
  I can understand exactly what changed and when.
- As a Shipyard developer, I want direct trace access and per-edit evidence so
  I can verify the agent did the right thing without opening raw logs.

## Acceptance Criteria

- [x] AC-1: The workbench center area offers both `Chat` and `Live view`
  surfaces without requiring a page reload or a new session.
- [x] AC-2: `Chat` renders the latest conversation with user instructions,
  injected-context receipts, assistant summaries, and per-turn trace access.
- [x] AC-3: `Live view` shows streamed steps for the current run before the run
  completes.
- [x] AC-4: Edit steps include path, before preview, after preview, and diff
  evidence when the underlying tool returns enough data.
- [x] AC-5: Repeated edits to the same file remain separate visible events in
  the file-evidence panel.
- [x] AC-6: Completed turns preserve LangSmith trace metadata so the browser can
  expose an `Open trace` link when tracing is configured.
- [x] AC-7: Saved-run history keeps working with the new workbench surfaces.

## Edge Cases

- Tool completes without preview data: keep the step visible and fall back to
  the existing end-of-turn diff preview.
- Multiple edits to one file: preserve ordering and render each event
  independently.
- LangSmith not configured: show the local trace path without presenting a dead
  external link.

## Non-Functional Requirements

- Accessibility: tab buttons, step lists, and detail panes remain keyboard
  reachable.
- Performance: step playback should update incrementally without re-rendering
  the full run history excessively.
- Trust: the UI should prefer explicit evidence over polished but vague
  summaries.

## UI Requirements

- The main workspace surface uses clearly labeled `Chat` and `Live view` tabs.
- `Live view` presents a left-to-right progression from timeline to detail
  pane.
- Edit evidence uses distinct `Before`, `After`, and `Diff` headings.
- Trace information is visible from both the transcript and live playback
  surfaces when available.

## Out of Scope

- Keystroke-level streaming.
- Remote trace browsing inside the workbench.
- Replacing the existing saved-run history model.

## Done Definition

- Operators can follow a run as it unfolds instead of waiting for a final
  retrospective diff.
- The browser UI supports both conversation-first usage and evidence-first
  usage in the same session.
