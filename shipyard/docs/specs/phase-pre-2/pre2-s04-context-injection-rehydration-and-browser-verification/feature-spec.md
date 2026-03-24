# Feature Spec

## Metadata
- Story ID: PRE2-S04
- Story Title: Context Injection, Rehydration, and Browser Verification
- Author: Codex
- Date: 2026-03-24
- Related PRD/phase gate: Phase Pre-2 Developer UI, behaviors and manual browser test

## Problem Statement

The UI is only convincingly useful if it demonstrates two things visually: context injection is real, and the session persists naturally across reloads. The final pre-2 story therefore needs to finish the left-panel context workflow, page-reload rehydration, `--ui` startup ergonomics, and the browser acceptance pass that later phases can reuse in demos.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Make context injection visible and trustworthy in the browser.
- Objective 2: Make session continuity resilient enough that refreshes do not erase the narrative of the run.
- Objective 3: Establish the browser test flow that later phases will use as their natural progress demo.
- How this story or pack contributes to the overall objective set: This story turns the UI from a shell into a durable operator experience.

## User Stories
- As a Shipyard developer, I want to paste context, submit instructions, reload the page, and keep following the same session so the UI feels like the natural place to run the agent.

## Acceptance Criteria
- [ ] AC-1: The left sidebar includes a context textarea whose contents are injected with the next instruction and then recorded visibly with a timestamp.
- [ ] AC-2: Reloading the browser reconnects to the same session and restores chat history, session info, and recent activity state.
- [ ] AC-3: The `--ui` startup flow prints or opens the browser URL clearly while leaving terminal logs available for debugging.
- [ ] AC-4: Errors display visibly in the browser, including tool failures and retries, without hiding subsequent recovery steps.
- [ ] AC-5: Run the browser UI through the five-instruction MVP test flow and verify instructions, streaming tool activity, diffs, context injection, session info, and error states all work visually.

## Edge Cases
- Empty/null inputs: blank context should not pollute later turns.
- Boundary values: large pasted context should be bounded or summarized safely.
- Invalid/malformed data: failed reconnects should display a recoverable disconnected state.
- External-service failures: browser verification should distinguish socket failures from agent/runtime failures.

## Non-Functional Requirements
- Security: context text remains local and session-scoped.
- Performance: reload should rehydrate quickly from saved session state.
- Observability: the browser test flow should make retries and errors visually obvious.
- Reliability: session reconnect should not silently fork a second session.

## UI Requirements (if applicable)
- Required states: idle, working, recovered after reload, error, and disconnected.
- Accessibility contract: context textarea, send button, and reconnect/error messaging remain keyboard and screen-reader accessible.
- Design token contract: retain the dark developer-tool visual language from PRE2-S03.
- Visual-regression snapshot states: context pending, context injected, rehydrated session, and error/retry state.

## Out of Scope
- Drag-and-drop file upload beyond text-based context injection.
- Multi-session tab management.
- Remote collaboration.

## Done Definition
- Context injection is visible and trusted.
- Session reload is stable.
- The browser test flow is documented and ready for later demo-heavy phases.
