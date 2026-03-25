# Feature Spec

## Metadata
- Story ID: UIV2-S08
- Story Title: Accessibility and Performance Audit
- Author: Claude
- Date: 2026-03-24
- Related PRD/phase gate: Phase UI v2 — Complete UI Reimagination
- Estimated effort: 1h
- Depends on: UIV2-S07 (States, Feedback, and Motion)
- Skills: audit, fixing-accessibility, fixing-motion-performance, critique

## Problem Statement

After rebuilding 7 stories of UI (design system, shell, composer, activity feed, diff viewer, session/context panels, and motion), the pack needs a comprehensive audit before shipping. Individual stories ran their own skill checks, but no story had visibility into cross-component regressions. Potential issues include:

- Accessibility regressions introduced by component interactions (e.g., focus trapping in one panel breaking tab order to the next).
- Animation performance issues that only surface when all panels animate simultaneously on load.
- Design inconsistencies between components built in different stories (spacing, typography, color usage).
- Bundle size growth from 7 stories of new CSS and component code.
- Layout shift caused by skeleton-to-content transitions or lazy-loaded content.

This story is a pure audit-and-fix pass — no new features, only compliance, performance, and consistency remediation.

## Story Objectives

- Objective 1: Run a full accessibility audit across all components and fix all high and medium severity issues.
- Objective 2: Run a full performance audit and fix any render bottlenecks, layout shifts, or animation jank.
- Objective 3: Run a final design critique and address visual inconsistencies across the rebuilt UI.
- Objective 4: Create the pack-level `user-audit-checklist.md` documenting what was verified and what remains.

## User Stories

- As a developer using Shipyard, I want the UI to be accessible so I can use it with a screen reader or keyboard-only navigation.
- As a developer on a lower-powered machine, I want the UI to perform well so animations don't cause jank.
- As the pack author, I want a documented audit checklist so I can verify quality before shipping.

## Acceptance Criteria

- [ ] AC-1: All interactive elements (buttons, links, inputs, tree items, collapsible sections) have accessible names (either visible text, `aria-label`, or `aria-labelledby`).
- [ ] AC-2: Focus order matches visual order throughout the entire UI (sidebar → main content → panels, top to bottom within each).
- [ ] AC-3: All color-coded indicators (status dots, diff ADD/DEL/CTX, turn status) have a non-color signal (text label, icon, or pattern).
- [ ] AC-4: Color contrast meets WCAG 2.2 AA minimum (4.5:1 for normal text, 3:1 for large text and UI components).
- [ ] AC-5: All images, icons, and decorative SVGs have appropriate `alt` text or `aria-hidden="true"`.
- [ ] AC-6: All animations use compositor-only properties (`transform`, `opacity`). No layout-triggering animations remain.
- [ ] AC-7: No Cumulative Layout Shift (CLS) on initial load or state transitions (skeleton → content transitions must reserve space).
- [ ] AC-8: Bundle size is within budget: CSS < 50KB gzipped, JS < 350KB gzipped.
- [ ] AC-9: `critique` skill evaluation scores 7+ on all dimensions (hierarchy, consistency, density, typography, color).
- [ ] AC-10: Pack-level `user-audit-checklist.md` is created in the phase directory documenting all checks performed, results, and known limitations.

## Notes / Evidence

- The pack README defines success criteria that this story must verify:
  - WCAG 2.2 AA compliance via `fixing-accessibility` skill.
  - Animation performance via `fixing-motion-performance` skill.
  - `critique` skill evaluation scoring 7+ on all dimensions.
  - Build size within 50KB CSS + 350KB JS gzipped.
  - All existing tests pass without modification.
- The `user-audit-checklist.md` serves as a release gate document — it should be checkable by a human reviewer.

## Out of Scope

- New features or UI changes beyond what is needed to fix audit findings.
- Browser compatibility testing beyond the primary target (modern Chromium).
- Automated accessibility testing infrastructure (e.g., axe-core CI integration) — that is a future story.
- Mobile responsive layout fixes (the pack targets 1440px, 1024px, and 375px viewports, but layout redesign is not in scope here — only verifying existing responsive behavior).

## Done Definition

- All high and medium accessibility issues are fixed.
- All animations are compositor-only with no jank under CPU throttle.
- No layout shift on load or state change.
- Bundle size is within budget.
- Design critique scores 7+ on all dimensions.
- `user-audit-checklist.md` is complete and checked in.
- All existing tests pass.
