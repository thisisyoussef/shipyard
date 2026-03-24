# Phase Pre-2: Developer UI Story Pack

- Pack: Phase Pre-2 Developer UI
- Estimate: 2-3 hours
- Date: 2026-03-24
- Status: Drafted for implementation

## Pack Objectives

1. Give Shipyard a browser-based developer surface immediately after `P2-S02`, so progress is visible before the remaining tool/runtime phases continue.
2. Make context injection, tool activity, file diffs, session state, and trace access first-class UI concepts instead of late-stage add-ons.
3. Establish the HTTP, WebSocket, frontend, and event contracts that later tool, Claude, and LangGraph stories will build on.

## Shared Constraints

- Product code and product docs stay under `shipyard/`; `.ai/` remains helper-only.
- `P2-S01` and `P2-S02` are assumed to exist first so the UI can sit on top of the real tool registry and safe file-IO primitives.
- The UI is not a separate product. It is an alternate interface to the same Shipyard engine started with `--ui`.
- The backend serves one single-page React app and one persistent WebSocket channel for real-time updates.
- The frontend is a developer tool, not a consumer chat clone. It should follow the repo design philosophy: calm, honest, focused, and diff-forward.
- The most important visual proof is surgical editing, so file activity and diff rendering carry as much visual weight as the chat transcript.
- Later phases should assume this UI exists and should emit structured activity that can stream naturally into it.

## Planned Stories

| Story ID | Title | Purpose | Depends On |
|---|---|---|---|
| PRE2-S01 | UI Runtime Contract and `--ui` Mode | Define the local web-server architecture, dependency additions, runtime selector, and WebSocket message contracts. | P2-S02 implementation |
| PRE2-S02 | Backend Activity Stream and Session Bridge | Add the HTTP/WebSocket layer and stream engine activity into browser-safe event messages. | PRE2-S01 |
| PRE2-S03 | Frontend Developer Console and Diff-First Workbench | Build the React SPA shell, five-panel layout, and the visual language for activity, diffs, and session state. | PRE2-S01, PRE2-S02 |
| PRE2-S04 | Context Injection, Rehydration, and Browser Verification | Finish left-panel context injection, session reconnect behavior, `--ui` startup flow, and the browser-based verification pass. | PRE2-S02, PRE2-S03 |

## Sequencing Rationale

- `P2-S01` and `P2-S02` land first so the UI can target the real registry and safe file-system contract instead of guessing at placeholder behavior.
- `PRE2-S01` decides the runtime contract first so later work can target a stable server/frontend split and event schema.
- `PRE2-S02` wires real engine events into the transport before the frontend tries to render them.
- `PRE2-S03` then builds the visible workbench on top of that event stream, with the design system anchored to the repo's UI philosophy.
- `PRE2-S04` closes the loop with context injection, reload-safe session state, and a browser-based acceptance pass that `P2-S03` onward can use in demos.

## Whole-Pack Success Signal

- `pnpm start -- --target <path> --ui` boots Shipyard into a browser-facing mode without replacing the core engine.
- Instructions submitted in the browser stream live activity, tool calls, tool results, and file diffs in real time.
- Users can paste context on the left, see it injected into the next run, and reload the page back into the same session state.
- Later phases can treat the UI as the primary human-facing progress surface instead of bolting it on after the agent core is already set.
