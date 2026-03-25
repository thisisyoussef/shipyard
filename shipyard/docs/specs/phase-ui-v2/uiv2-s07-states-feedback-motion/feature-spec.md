# Feature Spec

## Metadata
- Story ID: UIV2-S07
- Story Title: States, Feedback, and Motion
- Author: Claude
- Date: 2026-03-24
- Related PRD/phase gate: Phase UI v2 — Complete UI Reimagination
- Estimated effort: 1–2h
- Depends on: UIV2-S03 (Composer and Instruction UX), UIV2-S04 (Activity Feed Reimagination)
- Skills: animate, overdrive, fixing-motion-performance

## Problem Statement

The current UI has almost no motion. State transitions are instant — panels appear without animation, status changes snap between colors, buttons have no press feedback, and there are no loading states for async content. The only motion in the entire app is a pulse animation on status dots. This makes the UI feel static and lifeless. More critically, it makes state changes hard to notice: a connection status flip from "connected" to "error" happens in a single frame with no visual signal beyond a color change.

The absence of entrance animations means the UI feels like it "pops" into existence rather than loading gracefully. The absence of micro-interactions makes buttons and inputs feel unresponsive. The absence of skeleton loading states makes the initial connection phase feel broken — the user sees empty containers with no indication that content is loading.

## Story Objectives

- Objective 1: Add entrance animations for panels and cards (staggered fade-in on first load).
- Objective 2: Add state transition animations for connection status and turn status changes.
- Objective 3: Add micro-interactions for buttons (press feedback) and inputs (focus ring transitions).
- Objective 4: Add skeleton/loading states for panels during initial connection.
- Objective 5: Respect `prefers-reduced-motion` throughout — all motion must degrade gracefully.

## User Stories

- As a developer opening the Shipyard UI, I want panels to animate in smoothly so the interface feels polished and intentional.
- As a developer monitoring a session, I want status changes to animate so I notice them without staring at the status indicator.
- As a developer clicking buttons, I want tactile press feedback so the interface feels responsive.
- As a developer waiting for the agent to connect, I want to see skeleton loading states so I know the UI is working, not broken.
- As a developer with motion sensitivity, I want all animations to be disabled when I set `prefers-reduced-motion: reduce`.

## Acceptance Criteria

- [ ] AC-1: Panels animate in on first load with staggered timing (150–300ms per panel, `ease-out` curve).
- [ ] AC-2: Status dot color changes animate smoothly (300ms CSS transition on `background-color`).
- [ ] AC-3: Turn status transitions (pending → running → complete/error) animate with a brief scale pulse (1.0 → 1.05 → 1.0, 200ms).
- [ ] AC-4: Buttons have press feedback: `transform: scale(0.97)` on `:active`, 100ms transition.
- [ ] AC-5: Inputs have focus ring transition: ring expands from center (box-shadow transition, 200ms).
- [ ] AC-6: Session and activity panels show skeleton loading placeholders during WebSocket connection phase (before first data arrives).
- [ ] AC-7: Skeleton placeholders use a shimmer animation (background gradient sweep, 1.5s loop).
- [ ] AC-8: All motion respects `prefers-reduced-motion: reduce` — animations are replaced with instant state changes (no duration, no delay).
- [ ] AC-9: All animations use compositor-only properties (`transform`, `opacity`) — no `width`, `height`, `top`, `left`, `margin`, or `padding` animations.
- [ ] AC-10: Passes `fixing-motion-performance` skill check (no layout-triggering animations, no jank on 4x CPU throttle).

## Notes / Evidence

- The pack README specifies: "Compositor-only animations. Sub-100ms interaction feedback."
- `prefers-reduced-motion` is a WCAG 2.2 AA requirement (SC 2.3.3 Animation from Interactions).
- Skeleton loading is a proven pattern for perceived performance — see Linear, Notion, GitHub.
- Staggered entrance animations create visual hierarchy and guide the eye (each panel arrives in reading order).

## Out of Scope

- Page transition animations (route-to-route). There is only one page.
- Parallax or scroll-linked animations.
- Lottie or SVG path animations.
- Sound effects or haptic feedback.
- Animation preferences UI (relying solely on OS-level `prefers-reduced-motion`).

## Done Definition

- The UI feels alive and responsive: panels fade in, status changes are noticeable, buttons respond to touch.
- Loading states communicate progress instead of showing empty containers.
- Motion-sensitive users see instant transitions with no animation.
- All animations are compositor-only and perform well under CPU throttle.
