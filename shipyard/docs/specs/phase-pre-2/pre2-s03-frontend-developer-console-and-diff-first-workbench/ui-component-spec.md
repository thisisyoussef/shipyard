# UI Component Spec

## Metadata
- Story ID: PRE2-S03
- Component Name: ShipyardWorkbench
- Author: Codex
- Date: 2026-03-24
- Related UI prompt brief: `ui-prompt-brief.md`

## Design Philosophy Alignment
- Relevant beliefs from `.ai/docs/design/DESIGN_PHILOSOPHY_AND_LANGUAGE.md`:
  - Calm Over Clever
  - Honest Interfaces
  - Structure Is Freedom
- Relevant principles:
  - Content First
  - Predictable Motion
  - Typography as Architecture
  - Accessible by Default
- Precedent rows referenced:
  - 2026-03-24 helper-harness guidance visually secondary to product implementation guidance
- Tradeoff chosen and why:
  - Give the file activity panel equal emphasis with chat so surgical edits stay visible instead of hidden in a log drawer.
- Frontend-design skill constraints from `.ai/skills/frontend-design.md`:
  - one strong visual direction
  - explicit anti-patterns to avoid
  - whitespace and typography as primary hierarchy tools

## Purpose
Provide a browser-based operator console that makes Shipyard's session context, live activity, and file diffs visible in one focused workspace.

## Props Interface
| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| sessionState | `SessionStateViewModel` | yes |  | Current target/session/discovery info |
| turns | `TurnViewModel[]` | yes |  | Chat and per-turn activity history |
| fileEvents | `FileEventViewModel[]` | yes |  | Current-turn and recent file activity |
| connectionState | `"connecting" \| "connected" \| "disconnected" \| "error"` | yes |  | WebSocket status |
| agentStatus | `string` | yes |  | Human-readable runtime status |
| draftContext | `string` | yes |  | Pending injected context text |
| onContextChange | `(value: string) => void` | yes |  | Updates context draft |
| onSubmitInstruction | `(instruction: string) => void` | yes |  | Sends a new instruction |

## Behavioral Requirements (TDD Scope)
1. The shell renders all five major zones with stable landmarks.
2. New events append to the active turn without collapsing prior turns unexpectedly.
3. Edit events surface compact diffs in the right sidebar as soon as they arrive.
4. Connection loss and agent errors are visibly reflected in the shell state.

## State Model
| State | Trigger | UI Output | Exit Condition |
|---|---|---|---|
| Empty | First load before turns exist | Intro shell with session info and input affordance | First instruction sent |
| Streaming | Agent is working | Active turn shows spinners and incoming tool events | `agent:done` or `agent:error` |
| Error | Socket or agent failure | Visible error styling in activity and status bar | Reconnect or next successful turn |
| Rehydrated | Page reload with existing session | Prior turns and session info restored | Next live event |

## Accessibility Requirements
- Roles:
  - landmark roles for sidebars, main, header, and status
- ARIA labels:
  - labeled instruction input, context textarea, collapse buttons, and connection status
- Keyboard interactions:
  - submit instruction via keyboard
  - tab through collapsible activity items
  - accessible expand/collapse of activity details
- Screen-reader announcements:
  - live region for status changes and critical errors

## Design Token Contract
- Color tokens:
  - dark neutral surfaces, teal/green success, amber/orange warning, red error, muted gray tool activity
- Typography tokens:
  - readable UI sans for prose, monospace for paths/diffs/status details
- Spacing/sizing tokens:
  - 8px base scale with denser execution-mode spacing in event rows
- Motion tokens:
  - restrained 100-250ms status and panel transitions

## Visual Direction Contract
- Primary aesthetic direction:
  - calm research-console / developer toolbench
- Emotional goal / intended vibe:
  - focused, trustworthy, quietly capable
- Explicit anti-patterns to avoid:
  - consumer chat bubbles as the dominant visual language
  - giant hero-style empty states
  - flat undifferentiated card grids
  - decorative neon or purple gradients

## Typography System
- Headline voice:
  - restrained sans with weight contrast, not ornamental
- Body voice:
  - highly legible sans for conversation and instructions
- Data/code voice:
  - monospace for file paths, tool names, diffs, and statuses
- Heading tracking:
  - slightly tightened on major labels
- Body leading:
  - relaxed enough for logs and prose
- Weight/contrast rules:
  - headings and status labels create hierarchy, not oversized boxes

## Layout and Whitespace Strategy
- Layout pattern (editorial, asymmetric, bento, linear, etc.):
  - three-column workbench with light top and bottom framing
- Whitespace strategy:
  - generous panel padding with denser inner rows for active events
- Density rules:
  - browse mode calm, active execution slightly denser
- Focal area / visual flow:
  - chat and file activity share center of gravity; session info remains stable on the left

## Color, Depth, and Material
- Semantic palette roles:
  - dark surface base, muted secondary surfaces, restrained accent, explicit success/error colors
- Surface treatment:
  - layered dark panels with thin borders
- Depth cues (gradient, border, shadow, blur, texture):
  - subtle depth and border hierarchy only
- Accessibility/contrast notes:
  - text and diff colors must remain readable on dark surfaces

## Visual Regression Snapshot Matrix
- Default
- Focus
- Loading
- Error
- Empty
- Populated

## Out of Scope
- Mobile-first layout beyond basic functional responsiveness
- Rich file browsing
- External collaboration presence

## Notes on Fiddling Boundary
- Behavior logic remains test-driven.
- Visual polish/layout tuning may require iterative fiddling.
- Keep fiddling isolated; do not mix with core behavior logic.

## Decision Log Update
- [ ] If this component introduced a non-obvious UI tradeoff, add an entry to the design decisions log table in `.ai/docs/design/DESIGN_PHILOSOPHY_AND_LANGUAGE.md`.
