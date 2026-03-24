# Phase UI Revamp: Supplemental Story Pack

- Pack: UI Revamp (Supplemental)
- Estimate: 4-6 hours
- Date: 2026-03-24
- Status: Backlog

## Pack Objectives

1. Raise the visual and interaction quality of the Shipyard browser UI so it feels like a professional developer tool, not a demo shell.
2. Make tool activity, file diffs, and status feedback easier to scan and trust at a glance.
3. Improve the context and session workflows so the UI supports day-to-day development without friction.

## Shared Constraints

- This pack is supplemental and should not block core engine phases.
- Phase Pre-2 must be implemented first; this pack assumes the UI runtime, event stream, and base workbench already exist.
- Keep the WebSocket contract stable unless a breaking change is explicitly agreed.
- Preserve local-first behavior; no auth, hosting, or multi-user work is required here.
- Follow the repo design philosophy and keep the UI diff-forward.
- UI changes should not change engine behavior or tool execution.

## Planned Stories

| Story ID | Title | Purpose | Depends On |
|---|---|---|---|
| UIR-S01 | Visual System and Layout Refresh | Establish a cohesive visual system, layout grid, and base components for a more professional console. | Phase Pre-2 implementation |
| UIR-S02 | Activity and Diff Experience Overhaul | Rework tool activity and diff presentation so surgical edits are unmistakable and fast to read. | UIR-S01 |
| UIR-S03 | Context and Session UX Polish | Improve context injection, session rehydration, error states, and keyboard flow. | UIR-S01, UIR-S02 |

## Sequencing Rationale

- `UIR-S01` defines the design system and layout structure so later stories are consistent and not patchy.
- `UIR-S02` focuses on the core trust surfaces (activity + diffs) once the base visual language is in place.
- `UIR-S03` polishes the remaining workflows and error handling for day-to-day use.

## Whole-Pack Success Signal

- The browser UI looks and feels like a polished developer tool.
- Activity, diffs, and status are scannable in seconds, even under high tool traffic.
- Context injection and session rehydration are obvious and reliable for local workflows.
- No changes are required to engine logic or tool contracts to benefit from the UI improvements.
