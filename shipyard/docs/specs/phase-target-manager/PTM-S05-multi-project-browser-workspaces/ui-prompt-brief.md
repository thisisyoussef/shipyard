# UI Prompt Brief

## W: Who and What
- Role the agent should act as:
  Shipyard design engineer refining a developer-tool workbench
- UI deliverable to produce:
  compact multi-project board plus keyed active-project shell updates
- Primary user/task:
  monitor several targets, activate the right one quickly, and open/create the
  next target without interrupting background work

## I: Input Context
- Product/context summary:
  Shipyard is a local-first coding agent with a split-pane browser workbench
  and an existing target header/switcher/create flow
- Existing design system or brand constraints:
  preserve the current shell and calm operator-tool aesthetic
- Screens, flows, or references provided:
  existing target header and switcher, plus multi-project dashboard and
  workspace-creation modal references gathered during lookup
- Technical stack constraints:
  React 19, current typed view-model layer, existing primitives and shell

## R: Rules and Constraints
- Must preserve:
  the split-pane shell, honest status messaging, and the target-manager create
  flow
- Must avoid:
  generic dashboard cards, loud status colors, and any UI that feels like a
  second standalone product
- Primary user-facing language rules:
  use project/target labels that are direct and operational
- Feedback honesty and state rules:
  busy means the owning project is truly running, not just selected
- Diagnostic/debug disclosure policy:
  keep advanced details in the main active shell, not the project strip
- Accessibility requirements:
  keyboard activation, active-state semantics, readable status text
- Responsiveness requirements:
  degrade to a horizontally scrollable project strip on smaller widths
- Performance/runtime constraints:
  activation should feel instant; no heavy animation or global rerender churn

## E: Expected Output
- Output format required:
  updated workbench components and shell styles
- Required sections/components:
  project board, active-project highlight, open/create action, keyed shell
- States that must be shown:
  empty, active, ready, busy background, target-manager entry
- Interaction details that must be specified:
  activation semantics, how open/create is triggered, background status display

## F: Flow of Tasks
1. Preserve the current shell and introduce the project board as contextual
   navigation.
2. Make activation state and background status legible in one glance.
3. Keep creation/open actions obvious without visually overwhelming the active
   project shell.

## R: Reference Voice and Style
- Desired visual direction:
  calm operator strip with compact project chips and honest status cues
- Reference inspirations:
  project dashboards with searchable project lists and restrained workspace
  creation modals
- Tone/personality:
  focused, reliable, low-drama

## A: Ask for Clarification
- Missing information that should block implementation:
  none for the first slice
- Ambiguities the agent must ask about first:
  none; prefer the calmer, simpler option if multiple valid layouts exist

## M: Memory
- Reusable design decisions to keep across iterations:
  active project should dominate through hierarchy, not through loud color
- Existing precedent/components to preserve:
  current shell header, target badges, enrichment indicator, and split-pane
  workbench proportions

## E: Evaluate and Iterate
- How the result should be self-checked:
  verify that background work is visible without stealing focus from the active
  shell
- What should be revised first if the result feels generic:
  tighten hierarchy and reduce card-like chrome before adding ornament
- Required variants or alternate directions:
  none for this story
