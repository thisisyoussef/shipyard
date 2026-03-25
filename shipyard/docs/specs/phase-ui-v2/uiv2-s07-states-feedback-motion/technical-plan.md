# Technical Plan

## Metadata
- Story ID: UIV2-S07
- Story Title: States, Feedback, and Motion
- Author: Claude
- Date: 2026-03-24

## Proposed Design

- Components/modules affected:
  - `shipyard/ui/src/styles.css` — animation utility classes, skeleton styles, reduced-motion overrides
  - `shipyard/ui/src/tokens.css` — animation timing tokens (duration, easing)
  - `shipyard/ui/src/ShipyardWorkbench.tsx` — apply entrance classes, loading state logic
  - `shipyard/ui/src/SessionPanel.tsx` — skeleton loading state
  - `shipyard/ui/src/ContextPanel.tsx` — skeleton loading state
  - `shipyard/ui/src/primitives.tsx` — button press styles, input focus styles
  - All panel/card components from S02–S06 — apply entrance animation classes

- Public interfaces/contracts:
  - CSS utility classes (no React API changes):
    - `.motion-enter` — base entrance animation (opacity 0→1, translateY)
    - `.motion-enter-stagger-1` through `.motion-enter-stagger-6` — staggered delay variants
    - `.motion-status-pulse` — brief scale pulse for status transitions
    - `.skeleton` — shimmer loading placeholder
    - `.skeleton-line`, `.skeleton-block` — skeleton shape variants
  - Design tokens:
    - `--duration-instant`: 0ms (reduced motion fallback)
    - `--duration-micro`: 100ms (button press)
    - `--duration-fast`: 200ms (focus ring, status pulse)
    - `--duration-normal`: 300ms (entrance, status color)
    - `--duration-stagger`: 150ms (delay increment between panels)
    - `--easing-default`: `cubic-bezier(0.25, 0.1, 0.25, 1)` (ease-out variant)
    - `--easing-spring`: `cubic-bezier(0.34, 1.56, 0.64, 1)` (overshoot for pulse)

- Data flow summary:
  1. On first render, `ShipyardWorkbench` checks if WebSocket is connected.
  2. If not connected: render skeleton placeholders in session and activity areas.
  3. On connection: replace skeletons with real panels; panels have `.motion-enter` + stagger classes.
  4. Status changes apply CSS transitions (already on elements; just token-controlled durations).
  5. Button/input micro-interactions are pure CSS (`:active`, `:focus-visible` pseudo-classes).

## Implementation Notes

### Animation Utility Classes

```css
/* Entrance animation — compositor-only (opacity + transform) */
.motion-enter {
  animation: motionEnter var(--duration-normal) var(--easing-default) both;
}
@keyframes motionEnter {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.motion-enter-stagger-1 { animation-delay: calc(var(--duration-stagger) * 1); }
.motion-enter-stagger-2 { animation-delay: calc(var(--duration-stagger) * 2); }
/* ... up to stagger-6 */

/* Status pulse — compositor-only (transform) */
.motion-status-pulse {
  animation: statusPulse var(--duration-fast) var(--easing-spring);
}
@keyframes statusPulse {
  0%   { transform: scale(1); }
  50%  { transform: scale(1.05); }
  100% { transform: scale(1); }
}

/* Reduced motion override — everything becomes instant */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Button Press Feedback
- Applied via `:active` pseudo-class on all `<button>` elements in `primitives.tsx` styles.
- `transform: scale(0.97)` with `transition: transform var(--duration-micro) var(--easing-default)`.
- Compositor-only: uses `transform`, not `width`/`height`/`padding`.

### Input Focus Ring
- Applied via `:focus-visible` pseudo-class.
- `box-shadow` transition from `0 0 0 0px var(--color-accent)` to `0 0 0 2px var(--color-accent)`.
- Duration: `var(--duration-fast)`.
- Note: `box-shadow` is not strictly compositor-only, but is widely GPU-accelerated and the only viable approach for focus rings. Acceptable per performance guidelines.

### Skeleton Loading States
- Skeleton elements are simple `<div>` placeholders with `.skeleton` class.
- `.skeleton-line`: `height: 1em; border-radius: 4px; background: var(--color-surface-secondary)`.
- `.skeleton-block`: `height: 4em; border-radius: 8px; background: var(--color-surface-secondary)`.
- Shimmer: `background` gradient animation (linear-gradient sweep from left to right, 1.5s loop).
- Shimmer uses `background-position` animation which is GPU-friendly.

### Status Transition Animation
- Status dot already uses `background-color` (from S06 SessionPanel). Add `transition: background-color var(--duration-normal)`.
- Turn status badges: on status change, briefly apply `.motion-status-pulse` class via React `useEffect` + `setTimeout` to remove after animation completes.

## Test Strategy

- Unit: Verify skeleton components render when `isConnected` is false and disappear when true.
- Unit: Verify `.motion-enter` class is applied to panel containers on first render.
- Visual: Verify animations use only `transform` and `opacity` (audit via DevTools Layers panel).
- Accessibility: Verify `prefers-reduced-motion: reduce` media query eliminates all animation durations.
- Performance: Run `fixing-motion-performance` skill check under 4x CPU throttle — no frame drops.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
