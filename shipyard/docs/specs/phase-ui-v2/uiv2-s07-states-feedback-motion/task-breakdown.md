# Task Breakdown

## Story
- Story ID: UIV2-S07
- Story Title: States, Feedback, and Motion

## Execution Notes
- All animations MUST use compositor-only properties (`transform`, `opacity`). The one exception is `box-shadow` for focus rings and `background-color`/`background-position` for status dots and skeleton shimmer — these are acceptable because they are widely GPU-accelerated.
- The `prefers-reduced-motion` override must be implemented first (T001) and tested last (T006) to ensure it catches all animations added in between.
- Stagger class assignment order should match visual reading order (top-left panel first, bottom-right last).
- Status pulse animation is triggered via React class toggling (`useEffect` + `setTimeout`), not CSS-only, because it needs to fire on state change, not on mount.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Define animation tokens and utility classes in `tokens.css` and `styles.css`. Add duration tokens (`--duration-instant`, `--duration-micro`, `--duration-fast`, `--duration-normal`, `--duration-stagger`), easing tokens (`--easing-default`, `--easing-spring`), and the `prefers-reduced-motion` global override. | none | yes | `pnpm --dir shipyard build` |
| T002 | Add panel entrance animations with stagger. Define `.motion-enter` keyframe animation (opacity + translateY). Add `.motion-enter-stagger-1` through `.motion-enter-stagger-6` delay classes. Apply to all panel containers in `ShipyardWorkbench.tsx` in visual reading order. | blocked-by:T001 | no | `pnpm --dir shipyard build`, visual check |
| T003 | Add status transition animations. Add `transition: background-color var(--duration-normal)` to status dots. Implement `.motion-status-pulse` keyframe (scale 1→1.05→1). Add React `useEffect` in turn cards to apply pulse class on status change and remove after animation. | blocked-by:T001 | yes (parallel with T002) | `pnpm --dir shipyard test` |
| T004 | Add button/input micro-interactions. Add `transform: scale(0.97)` on `button:active` with `--duration-micro` transition. Add `box-shadow` focus ring transition on `input:focus-visible` and `textarea:focus-visible` with `--duration-fast`. Apply in `primitives.tsx` styles or `styles.css`. | blocked-by:T001 | yes (parallel with T002, T003) | `pnpm --dir shipyard build`, interaction check |
| T005 | Add skeleton loading states. Create `.skeleton`, `.skeleton-line`, `.skeleton-block` CSS classes with shimmer animation. Render skeleton placeholders in `SessionPanel`, `ContextPanel`, and activity feed area when `isConnected` is false. Replace with real content on connection. | blocked-by:T001 | yes (parallel with T002, T003, T004) | `pnpm --dir shipyard test` |
| T006 | Add `prefers-reduced-motion` verification. Test that the global override in T001 catches all animations from T002–T005. Verify no animation plays when reduced motion is enabled. Fix any animations that bypass the override. | blocked-by:T002,T003,T004,T005 | no | manual test with `prefers-reduced-motion: reduce` emulation |
| T007 | Run `animate` + `overdrive` + `fixing-motion-performance` skills. Verify all animations are compositor-only (no layout triggers). Test under 4x CPU throttle for jank. Fix any findings. | blocked-by:T006 | no | `pnpm --dir shipyard test`, `pnpm --dir shipyard typecheck`, `pnpm --dir shipyard build`, `git diff --check` |

## Completion Criteria

- UI has entrance animations, status transitions, button/input micro-interactions, and skeleton loading states.
- All animations are compositor-only (verified by performance skill check).
- `prefers-reduced-motion: reduce` disables all animations.
- No jank under 4x CPU throttle.
- All skill evaluations pass.
