# Feature Spec

## Metadata
- Story ID: PRE2-S03
- Story Title: Frontend Developer Console and Diff-First Workbench
- Author: Codex
- Date: 2026-03-24
- Related PRD/phase gate: Phase Pre-2 Developer UI, frontend shell and streaming layout

## Problem Statement

Even with a backend event stream, the browser will feel like a thin log viewer unless the UI is intentionally designed around developer trust: session visibility, chat flow, live tool activity, and surgical diff display all need meaningful visual weight. The frontend therefore needs a purpose-built console layout rather than a generic chatbot screen.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Build a developer-first layout that makes progress, file changes, and system state visible at a glance.
- Objective 2: Render streamed events and diffs in a way that proves surgical editing visually.
- Objective 3: Make the UI feel like a focused toolbench, not a consumer chat clone.
- How this story or pack contributes to the overall objective set: This story turns the backend stream into a compelling and legible interface.

## User Stories
- As a Shipyard developer, I want a browser workbench with chat, file activity, and session state visible at once so I can follow agent progress naturally.

## Acceptance Criteria
- [ ] AC-1: Build a single-page React app with five major areas: left session/context sidebar, center chat/activity feed, right file-activity sidebar, top bar, and bottom status bar.
- [ ] AC-2: The center panel renders user instructions, agent responses, and collapsible per-turn activity logs from streamed events.
- [ ] AC-3: The right sidebar shows live file operations and compact diffs with clear add/remove context so surgical editing is visually obvious.
- [ ] AC-4: The top bar shows Shipyard branding, target directory, connection status, and a trace-link affordance.
- [ ] AC-5: The bottom bar shows the current agent status with subtle working-state animation.
- [ ] AC-6: Styling follows a calm, honest, dark developer-tool direction rather than a generic chat-app aesthetic.

## Edge Cases
- Empty/null inputs: the initial empty-state view still shows target/session info and the input affordance clearly.
- Boundary values: long activity logs should collapse cleanly without hiding the latest turn.
- Invalid/malformed data: unknown event types degrade into a readable fallback line item rather than crashing the UI.
- External-service failures: disconnected or errored sockets render obvious but non-destructive error states.

## Non-Functional Requirements
- Security: browser-visible content stays local and summary-based.
- Performance: streamed updates should append incrementally and avoid full-page rerenders.
- Observability: the UI should make it obvious which tool is running and what changed.
- Reliability: reconnecting should restore the visible shell state from session data.

## UI Requirements (if applicable)
- Required states: empty, connected idle, active streaming turn, reconnecting, and error.
- Accessibility contract: keyboard-accessible input, collapsibles, visible focus states, semantic status labels, and sufficient contrast.
- Design token contract: dark neutral surfaces, restrained accent color, monospace for code/file detail, readable sans or similar for prose.
- Visual-regression snapshot states: initial shell, active streaming turn, diff-heavy edit event, and error/reconnect state.

## Out of Scope
- Multi-page navigation.
- Rich document editing inside the browser.
- Remote collaboration.

## Done Definition
- The main developer console layout exists.
- Streaming events and diffs render clearly.
- The UI establishes the visual bar that later runtime phases should preserve.
