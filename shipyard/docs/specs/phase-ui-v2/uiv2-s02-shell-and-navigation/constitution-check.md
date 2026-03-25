# Constitution Check

- [x] New modules respect SRP and dependency direction. `ShipyardShell.tsx` is layout-only (no content rendering). `HeaderStrip.tsx` is presentation-only (receives data via props). Both depend on the token system (S01) and primitives, not on each other or on content components.
- [x] Testing strategy covers the change. Unit tests verify shell renders grid areas and sidebar toggling. Integration ensures App.tsx wires the shell correctly. Visual checks at four breakpoints verify responsive behavior. Skill-based validation covers spatial quality.
- [x] Backwards compatibility respected. ShipyardWorkbench continues to render all existing content — only layout extraction occurs. The refactor is additive: ShipyardShell wraps existing components without changing their behavior or props.
- [x] New dependency justified and risk-assessed. No new runtime dependencies. Keyboard shortcut handling uses native DOM APIs. Sidebar state persistence uses localStorage (already available in the browser context). CSS Grid named areas are supported in all target browsers.
