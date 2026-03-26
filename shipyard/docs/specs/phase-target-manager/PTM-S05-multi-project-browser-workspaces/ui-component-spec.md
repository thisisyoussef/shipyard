# UI Component Spec

## Metadata
- Story ID: PTM-S05
- Component Name: Browser Project Board
- Author: Codex
- Date: 2026-03-26
- Related UI prompt brief: `ui-prompt-brief.md`

## Design Philosophy Alignment
- Relevant beliefs from `.ai/docs/design/DESIGN_PHILOSOPHY_AND_LANGUAGE.md`:
  Calm Over Clever, Earned Complexity, Honest Interfaces
- Relevant principles:
  Content First, Progressive Disclosure, Predictable Motion, Accessible by
  Default, Contextual Density
- Precedent rows referenced:
  2026-03-04 evidence-first cards over decorative containers
- Tradeoff chosen and why:
  keep the project board compact and status-led instead of expanding into a
  full dashboard, because the split-pane workbench remains the primary surface
- Frontend-design skill constraints:
  preserve the existing split-pane shell, avoid generic SaaS card grids, and
  make the board feel like calm operator navigation rather than a second app

## Purpose

Give the operator a fast, low-noise way to see open projects, recognize which
one is active or busy, and jump between them without losing context.

## Props Interface

| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| `projects` | `ProjectBoardProjectViewModel[]` | yes | none | Open project summaries |
| `activeProjectId` | `string | null` | yes | none | Currently active project |
| `onActivateProject` | `(projectId: string) => void` | yes | none | Activate an existing project |
| `onOpenTargets` | `() => void` | yes | none | Open the existing target picker / create flow |

## Behavioral Requirements (TDD Scope)
1. The active project is visually and semantically distinguished.
2. Busy projects show status without stealing the main shell.
3. Activating a project updates the main shell to that project's snapshot.
4. The open/create action remains available even while another project is busy.

## State Model

| State | Trigger | UI Output | Exit Condition |
|---|---|---|---|
| Empty | No code projects open yet | Intro copy plus open/create action | First project opened |
| Ready | One or more idle projects | Compact project buttons with ready labels | Status changes |
| Busy | At least one project running or deploying | Busy badge on owning project | Project settles |
| Active | Current project selected | Highlighted button/tab and keyed shell content | Another project activated |

## Accessibility Requirements
- Roles:
  `tablist` / `tab` / `tabpanel` if the board is implemented as tabs
- ARIA labels:
  active-state announcement and open/create control label
- Keyboard interactions:
  left/right arrow navigation, Home/End, Enter/Space activation
- Screen-reader announcements:
  concise active-project change messaging

## Design Token Contract
- Color tokens:
  existing neutral, accent, success, warning, and danger badge tones only
- Typography tokens:
  reuse current micro-label, body, and strong text styles
- Spacing/sizing tokens:
  maintain the repo's 8px rhythm with compact horizontal spacing
- Motion tokens:
  short opacity/transform transitions only for activation and status polish

## Visual Direction Contract
- Primary aesthetic direction:
  compact operator rail with status-forward chips
- Emotional goal / intended vibe:
  calm control, active awareness, no panic
- Explicit anti-patterns to avoid:
  full dashboard takeovers, heavy glassmorphism, loud color blocks, generic
  card walls

## Typography System
- Headline voice:
  existing shell/title styling
- Body voice:
  restrained sans-serif labels
- Data/code voice:
  existing mono only for paths or URLs
- Heading tracking:
  neutral
- Body leading:
  compact but breathable
- Weight/contrast rules:
  active item uses weight and border, not only color

## Layout and Whitespace Strategy
- Layout pattern:
  compact horizontal strip above the conversation shell
- Whitespace strategy:
  tight grouping inside each project item, generous separation from the main
  content below
- Density rules:
  summaries stay one-line where possible; overflow is handled with truncation
- Focal area / visual flow:
  active project first, open/create action second, detailed shell below

## Color, Depth, and Material
- Semantic palette roles:
  neutrals for structure, accent for active/open actions, status tones for
  runtime state
- Surface treatment:
  low-contrast shell surface with thin borders
- Depth cues:
  subtle inset/outline changes only
- Accessibility/contrast notes:
  active and busy states must remain readable without color alone

## Visual Regression Snapshot Matrix
- Default
- One active and one idle project
- One active and one busy background project
- Empty target-manager state
- Narrow viewport

## Out of Scope
- Drag reordering
- Close/archive controls
- Multi-row dashboard summaries

## Notes on Fiddling Boundary
- Behavior logic remains test-driven.
- Visual polish stays isolated to the project board components and shell
  composition.
- Do not mix runtime routing decisions into styling-only patches.

## Decision Log Update
- [ ] If the project board introduces a non-obvious interaction tradeoff, add a
  row to `.ai/docs/design/DESIGN_PHILOSOPHY_AND_LANGUAGE.md`.
