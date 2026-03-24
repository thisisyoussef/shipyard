# Feature Spec

## Metadata
- Story ID: PRE2-S01
- Story Title: UI Runtime Contract and `--ui` Mode
- Author: Codex
- Date: 2026-03-24
- Related PRD/phase gate: Phase Pre-2 Developer UI, architecture and startup contract

## Problem Statement

Shipyard currently presents progress through a terminal REPL, which makes the agent feel opaque unless someone watches console output carefully. Before later work deepens the engine, the repo needs a stable UI runtime contract that adds a browser-first mode without forking the application into a separate product.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Define a single runtime that can start in terminal or browser mode from the same CLI.
- Objective 2: Lock down the WebSocket message contract early so backend and frontend work can proceed in parallel.
- Objective 3: Make the UI a foundational surface that later stories build on rather than retrofit.
- How this story or pack contributes to the overall objective set: This story creates the platform and message contracts all later UI work depends on.

## User Stories
- As a Shipyard developer, I want a `--ui` startup mode and a clear backend/frontend contract so I can build a browser interface on top of the existing engine without creating a second app.

## Acceptance Criteria
- [ ] AC-1: Add a `--ui` CLI mode that starts a local HTTP server and WebSocket service instead of the terminal REPL.
- [ ] AC-2: Choose and document the concrete local web stack for MVP, including the backend server approach and the React SPA build path.
- [ ] AC-3: Define typed frontend-to-backend messages for `instruction`, `cancel`, and `status`.
- [ ] AC-4: Define typed backend-to-frontend messages for `agent:thinking`, `agent:tool_call`, `agent:tool_result`, `agent:text`, `agent:edit`, `agent:done`, `agent:error`, and `session:state`.
- [ ] AC-5: The runtime contract makes clear that the browser UI and terminal mode share the same engine/session model rather than diverging.

## Edge Cases
- Empty/null inputs: empty browser instructions reject before the engine starts a turn.
- Boundary values: multiple browser tabs should either share a session safely or document that one active control surface is supported.
- Invalid/malformed data: unknown WebSocket message types return structured errors.
- External-service failures: if the server fails to boot, the CLI should report it clearly and exit.

## Non-Functional Requirements
- Security: the UI stays local-only for MVP and does not expose secrets in the browser payloads.
- Performance: one persistent socket per session is preferred over request/response polling.
- Observability: message contracts are explicit enough to log and test.
- Reliability: the `--ui` mode must not replace or break the existing CLI-only mode.

## UI Requirements (if applicable)
- Required states: disconnected, connecting, ready, agent-busy, and error.
- Accessibility contract: keyboard submission, focus-visible controls, readable contrast, and semantic status messaging.
- Design token contract: dark developer-tool palette, monospace for file/activity detail, proportional type for prose.
- Visual-regression snapshot states: initial empty shell, connected idle shell, active turn with streaming events, and error state.

## Out of Scope
- Authentication or remote multi-user hosting.
- Multi-page routing.
- Server-side rendering.

## Done Definition
- The `--ui` contract is fixed.
- The message schema is explicit.
- Later backend/frontend stories can implement against this contract without guessing.
