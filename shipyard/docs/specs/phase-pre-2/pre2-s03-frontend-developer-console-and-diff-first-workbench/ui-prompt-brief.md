# UI Prompt Brief

## W: Who and What
- Role the agent should act as:
  - a product-minded frontend engineer designing a local developer tool
- UI deliverable to produce:
  - the Shipyard browser workbench for live agent execution
- Primary user/task:
  - a developer watching Shipyard read, edit, and create files in real time

## I: Input Context
- Product/context summary:
  - Shipyard is a coding agent with live tool calls, file diffs, context injection, and session persistence
- Existing design system or brand constraints:
  - follow `.ai/docs/design/DESIGN_PHILOSOPHY_AND_LANGUAGE.md`
- Screens, flows, or references provided:
  - five-panel local developer console
- Technical stack constraints:
  - React SPA served locally from the Shipyard process

## R: Rules and Constraints
- Must preserve:
  - session info visibility
  - streaming activity
  - diff-first file visibility
  - visible context injection
- Must avoid:
  - generic chatbot layout
  - marketing-page aesthetics
  - noisy decorative motion
- Primary user-facing language rules:
  - concise, operator-focused, and honest
- Feedback honesty and state rules:
  - show real runtime state, do not fake progress
- Diagnostic/debug disclosure policy:
  - show summarized errors by default, with expandable detail when useful
- Accessibility requirements:
  - keyboard submission, labeled controls, clear focus, readable contrast
- Responsiveness requirements:
  - desktop-first, mobile-functional
- Performance/runtime constraints:
  - incremental rendering of streamed events

## E: Expected Output
- Output format required:
  - one coherent app shell and panel set
- Required sections/components:
  - left session/context sidebar
  - center chat/activity area
  - right file-activity/diff sidebar
  - top bar
  - bottom status bar
- States that must be shown:
  - empty, active streaming, done, reconnecting, error
- Interaction details that must be specified:
  - collapsible activity logs
  - live diff updates
  - context submission and persistence cues

## F: Flow of Tasks
1. Build the stable five-panel shell.
2. Connect streamed events to chat and activity views.
3. Give file diffs equal emphasis with agent text.
4. Add reconnect, error, and idle states.

## R: Reference Voice and Style
- Desired visual direction:
  - calm, dark developer toolbench
- Reference inspirations:
  - VS Code side panels, Linear-style clarity, not consumer chat apps
- Tone/personality:
  - trustworthy, focused, technically confident

## A: Ask for Clarification
- Missing information that should block implementation:
  - none for the story pack; choose the simplest credible local stack
- Ambiguities the agent must ask about first:
  - none unless the repo adopts an existing frontend design system later

## M: Memory
- Reusable design decisions to keep across iterations:
  - diff-first sidebar
  - visible system state
  - context injection as a first-class left-panel affordance
- Existing precedent/components to preserve:
  - the repo design philosophy's emphasis on calm and honest interfaces

## E: Evaluate and Iterate
- How the result should be self-checked:
  - confirm that a user can understand current status, active tools, and changed files without opening devtools
- What should be revised first if the result feels generic:
  - panel hierarchy, typography contrast, and diff presentation
- Required variants or alternate directions:
  - none; choose one strong direction and execute it well

## Frontend Aesthetics Addendum

### Typography
- Heading voice:
  - restrained, confident sans
- Body voice:
  - readable sans
- Data/code voice:
  - monospace for tooling detail and diffs
- Heading tracking:
  - slightly tight
- Body leading:
  - moderately open

### Layout and Whitespace
- Layout pattern:
  - three-column workbench with anchored top and bottom bars
- Whitespace strategy:
  - generous panel padding with denser event rows
- Density target:
  - calm by default, denser during active execution
- Focal composition rule:
  - chat and file activity share the primary focus area

### Color and Depth
- Primary:
  - deep slate base
- Muted:
  - neutral gray-blue surfaces
- Accent:
  - restrained teal or cool blue
- Destructive:
  - accessible red-orange
- Surface/background:
  - layered dark surfaces with thin borders
- Depth/material cues:
  - subtle depth only, no flashy gloss

### Motion
- Page-load motion:
  - subtle fade/slide for shell introduction
- Interaction motion:
  - functional status and collapse transitions
- Libraries allowed or preferred:
  - minimal motion helpers only if needed

### Anti-Patterns to Avoid
- Generic font defaults:
  - no Inter-everywhere monoculture if a more intentional stack is available
- Generic color defaults:
  - no purple-on-dark or bright terminal neon by default
- Generic layout defaults:
  - no centered chatbot column with hidden side data
- Other context-specific traps:
  - do not bury diffs under tiny accordions
