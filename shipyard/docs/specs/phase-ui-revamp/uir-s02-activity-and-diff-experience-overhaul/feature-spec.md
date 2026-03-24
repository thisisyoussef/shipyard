# Feature Spec

## Metadata
- Story ID: UIR-S02
- Story Title: Activity and Diff Experience Overhaul
- Author: Codex
- Date: 2026-03-24
- Related PRD/phase gate: Supplemental UI Revamp

## Problem Statement

The current activity feed and diff view do not make surgical edits obvious enough. When a run has many tool calls, the user must work too hard to understand what changed and why it matters.

## Story Objectives

- Objective 1: Make tool activity scannable with clear grouping and status emphasis.
- Objective 2: Make diffs readable at a glance, with strong change emphasis and context.
- Objective 3: Provide lightweight filtering or collapsing to reduce noise.

## User Stories

- As a Shipyard developer, I want to identify the precise file changes and the tool path that produced them without digging through raw logs.

## Acceptance Criteria

- [ ] AC-1: Tool calls render as distinct, status-coded blocks with consistent metadata.
- [ ] AC-2: Diff rendering shows added, removed, and unchanged context clearly.
- [ ] AC-3: Activity lists can be collapsed or filtered to focus on the last run.
- [ ] AC-4: Errors are surfaced in-line with the tool step that caused them.
- [ ] AC-5: The experience works with long runs without causing layout overflow or lag.

## Edge Cases

- Multiple tool calls in parallel: maintain ordering or grouping clarity.
- Large diffs: truncate with an explicit “show more” affordance.
- Unknown event types: degrade gracefully to a readable fallback.

## Non-Functional Requirements

- Accessibility: diff colors are supported by labels or symbols.
- Performance: virtualize or collapse large activity lists if needed.
- Trust: avoid hiding critical error information behind too many clicks.

## UI Requirements

- Activity list emphasizes the current tool in flight.
- Diff view shows the file path and a clear before/after preview.
- Errors and retries are visually distinct from successful tool steps.

## Out of Scope

- Changing the event stream schema.
- Adding a full file explorer or code editor.

## Done Definition

- Activity feed and diff view are noticeably easier to scan.
- Users can verify a surgical edit in under 10 seconds.
