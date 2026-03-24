# UI Component Spec Template

## Metadata
- Story ID:
- Component Name:
- Author:
- Date:
- Related UI prompt brief:

## Design Philosophy Alignment
- Relevant beliefs from `.ai/docs/design/DESIGN_PHILOSOPHY_AND_LANGUAGE.md`:
- Relevant principles:
- Precedent rows referenced:
- Tradeoff chosen and why:
- Frontend-design skill constraints from `.ai/skills/frontend-design.md`:

## Purpose
One sentence describing what the component does and why it exists.

## Props Interface
| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
|  |  |  |  |  |

## Behavioral Requirements (TDD Scope)
1. ...
2. ...
3. ...

## State Model
| State | Trigger | UI Output | Exit Condition |
|---|---|---|---|
| Default |  |  |  |
| Loading |  |  |  |
| Error |  |  |  |
| Populated |  |  |  |

## Accessibility Requirements
- Roles:
- ARIA labels:
- Keyboard interactions:
- Screen-reader announcements:

## Design Token Contract
- Color tokens:
- Typography tokens:
- Spacing/sizing tokens:
- Motion tokens:

## Visual Direction Contract
- Primary aesthetic direction:
- Emotional goal / intended vibe:
- Explicit anti-patterns to avoid:

## Typography System
- Headline voice:
- Body voice:
- Data/code voice:
- Heading tracking:
- Body leading:
- Weight/contrast rules:

## Layout and Whitespace Strategy
- Layout pattern (editorial, asymmetric, bento, linear, etc.):
- Whitespace strategy:
- Density rules:
- Focal area / visual flow:

## Color, Depth, and Material
- Semantic palette roles:
- Surface treatment:
- Depth cues (gradient, border, shadow, blur, texture):
- Accessibility/contrast notes:

## Visual Regression Snapshot Matrix
- Default
- Focus
- Hover (if relevant)
- Loading
- Error
- Empty
- Populated
- Disabled (if relevant)

## Out of Scope
- ...

## Notes on Fiddling Boundary
- Behavior logic remains test-driven.
- Visual polish/layout tuning may require iterative fiddling.
- Keep fiddling isolated; do not mix with core behavior logic.

## Decision Log Update
- [ ] If this component introduced a non-obvious UI tradeoff, add an entry to the design decisions log table in `.ai/docs/design/DESIGN_PHILOSOPHY_AND_LANGUAGE.md`.
