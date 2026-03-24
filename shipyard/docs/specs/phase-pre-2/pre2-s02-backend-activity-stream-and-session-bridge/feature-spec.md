# Feature Spec

## Metadata
- Story ID: PRE2-S02
- Story Title: Backend Activity Stream and Session Bridge
- Author: Codex
- Date: 2026-03-24
- Related PRD/phase gate: Phase Pre-2 Developer UI, backend event streaming

## Problem Statement

The UI only becomes useful if it can watch Shipyard work in real time. The backend therefore needs a thin event bridge that exposes tool calls, tool results, file edits, status changes, and session snapshots over WebSockets without rewriting the engine around the browser.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Turn internal engine/tool activity into browser-safe structured events.
- Objective 2: Keep session state and discovery visible to the browser from the first load.
- Objective 3: Make future tool and runtime stories emit activity that naturally appears in the UI.
- How this story or pack contributes to the overall objective set: This story gives the browser a live view of the engine.

## User Stories
- As a Shipyard developer, I want real-time agent events in the browser so I can watch tools, errors, and edits without tailing terminal logs.

## Acceptance Criteria
- [ ] AC-1: The backend serves the frontend bundle and exposes a persistent WebSocket connection per UI session.
- [ ] AC-2: Before each tool call, the backend emits `agent:tool_call` with tool name, summarized input, and a unique call ID.
- [ ] AC-3: After each tool result, the backend emits `agent:tool_result` with call ID, success/failure, and summarized output.
- [ ] AC-4: Model thinking, final text, edit diffs, done states, errors, and session snapshots are emitted through the documented event types.
- [ ] AC-5: The event bridge exposes the current session state, including turn count, target directory, and discovery report, when the browser requests status or reconnects.

## Edge Cases
- Empty/null inputs: no-op status requests still return current session state.
- Boundary values: multiple tool events within one instruction must preserve order.
- Invalid/malformed data: engine failures become `agent:error` events rather than socket crashes.
- External-service failures: disconnected sockets degrade gracefully without killing the local engine.

## Non-Functional Requirements
- Security: truncate or summarize outputs before sending them to the browser.
- Performance: event streaming should not duplicate large payloads unless the UI explicitly needs them.
- Observability: browser logs and backend logs should share stable event names.
- Reliability: call IDs should make it easy to pair starts and finishes for a tool invocation.

## UI Requirements (if applicable)
- Required states: connecting, connected, working turn, done, and error.
- Accessibility contract: status updates should map to readable labels in the frontend.
- Design token contract: not the focus of this story.
- Visual-regression snapshot states: deferred to PRE2-S03 and PRE2-S04.

## Out of Scope
- Distributed multi-client collaboration.
- Historical transcript storage beyond current session persistence.
- Rich binary payloads such as screenshots.

## Done Definition
- The browser can receive live event streams from the engine.
- Event types are stable enough for frontend rendering.
- Session reconnects can restore core session info.
