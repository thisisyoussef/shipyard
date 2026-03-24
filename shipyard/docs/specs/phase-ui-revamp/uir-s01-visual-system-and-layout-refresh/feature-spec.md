# Feature Spec

## Metadata
- Story ID: UIR-S01
- Story Title: Visual System and Layout Refresh
- Author: Codex
- Date: 2026-03-24
- Related PRD/phase gate: Supplemental UI Revamp

## Problem Statement

The current browser UI is functional but visually weak. It lacks a cohesive typographic hierarchy, deliberate spacing, and a visual system that signals this is a serious developer tool. Without a stronger shell, later UI improvements will feel inconsistent and patchy.

## Story Objectives

- Objective 1: Define a cohesive visual system (type, color, spacing, elevation).
- Objective 2: Refresh the layout grid and panel proportions so scanning feels intentional.
- Objective 3: Build base UI primitives that future stories can reuse.

## User Stories

- As a Shipyard developer, I want the UI to look professional and be easy to scan so I trust what the agent is doing.

## Acceptance Criteria

- [ ] AC-1: A new visual system is defined (type scale, color tokens, spacing, elevation).
- [ ] AC-2: The layout grid and panel proportions are refreshed for readability on wide and narrow screens.
- [ ] AC-3: Base UI primitives exist for cards, badges, status dots, and section headers.
- [ ] AC-4: The refreshed shell uses the same data as before; only presentation changes.
- [ ] AC-5: The UI passes the repo UI QA critic workflow with no high-severity issues.

## Edge Cases

- Small screens: panels collapse or stack without overlapping.
- Long tool logs: layout still preserves scanability.
- Theme contrast: critical status states remain readable.

## Non-Functional Requirements

- Accessibility: minimum contrast for text and status colors.
- Performance: no heavy animation or layout thrash.
- Consistency: tokens are centralized instead of inline ad hoc styles.

## UI Requirements

- A clear top bar and sidebars with aligned margins.
- A consistent typography system that differentiates headings, body, and metadata.
- Status indicators that are readable in both idle and active states.

## Out of Scope

- Changing engine behavior or tool contracts.
- Adding new routes or multi-page navigation.

## Done Definition

- Visual system documented in code.
- Layout shell refreshed and stable.
- Base primitives are reused by at least two panels.
