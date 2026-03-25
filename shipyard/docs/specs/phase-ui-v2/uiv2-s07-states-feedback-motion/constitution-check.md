# Constitution Check

- [x] New modules respect SRP and dependency direction. No new modules — this story adds CSS utility classes and applies them to existing components. Animation concerns are isolated in CSS classes, not embedded in component logic.
- [x] Backwards compatibility respected. Animations are additive — they enhance existing rendering without changing component structure, props, or data flow. Removing the CSS classes would revert to the current instant-transition behavior.
- [x] Testing strategy covers the change. Unit tests for skeleton rendering logic. Visual/manual testing for animation smoothness. Performance testing via skill check under CPU throttle. Reduced-motion verification via media query emulation.
- [x] New dependency justified and risk-assessed. No new runtime dependencies. All animations are pure CSS with minimal React class toggling. No animation library (framer-motion, react-spring, etc.) is introduced.
- [x] Accessibility baseline maintained. `prefers-reduced-motion: reduce` is implemented as a global override that catches all animations. Focus rings are preserved (only the transition is affected, not the ring itself). Skeleton states communicate loading visually and could be augmented with `aria-busy` attributes.
- [x] Performance discipline maintained. All primary animations use compositor-only properties (`transform`, `opacity`). Skeleton shimmer uses `background-position` (GPU-friendly). No layout-triggering properties are animated. Performance verified under 4x CPU throttle via skill check.
