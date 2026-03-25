# Technical Plan

## Metadata
- Story ID: UIV2-S01
- Story Title: Design System Foundation
- Author: Claude
- Date: 2026-03-24

## Proposed Design

- Components/modules affected:
  - `shipyard/ui/src/tokens.css` — replaced by `shipyard/ui/src/tokens/index.css`
  - `shipyard/ui/src/tokens/reset.css` — new
  - `shipyard/ui/src/tokens/primitives.css` — new
  - `shipyard/ui/src/tokens/components.css` — new
  - `shipyard/ui/src/tokens/motion.css` — new
  - `shipyard/ui/src/styles.css` — updated imports, verify all `var()` references
  - `shipyard/ui/src/main.tsx` or root CSS import — update to `tokens/index.css`
  - `shipyard/ui/index.html` — add `<link rel="preload">` for font files if self-hosting

- Public interfaces/contracts:
  - CSS custom property names are the public API. All existing token names must be preserved as aliases or replaced with find-and-replace migration.
  - No TypeScript interface changes.

- Data flow summary:
  - `index.css` imports reset → primitives → components → motion in cascade order.
  - `styles.css` imports `tokens/index.css` as its first `@import`.
  - Component `.tsx` files reference CSS class names which resolve to component-level tokens.

## Pack Cohesion and Sequencing

- Higher-level pack objectives: Establish a design system foundation that S02–S08 build on.
- Story ordering rationale: S01 must complete first because every subsequent story depends on token names, spacing scale, and motion values being stable.
- Whole-pack success signal: S01 is successful when subsequent stories can build components using only named tokens without inventing ad-hoc values.

## Architecture Decisions

- **Decision**: Use OKLCH for color definition, with sRGB fallbacks.
  - Rationale: OKLCH provides perceptual uniformity, making systematic lightness/chroma scales predictable. Fallback via `@supports` or preprocessor for browsers without OKLCH support.

- **Decision**: Structure tokens as layered CSS files rather than CSS-in-JS or a build-time token pipeline (Style Dictionary, etc.).
  - Rationale: The current stack is pure CSS custom properties consumed by plain CSS and inline class names. Adding a build-time token tool adds complexity without proportional benefit at this scale.

- **Decision**: Self-host font files or use `@font-face` with Google Fonts static URLs rather than the `@import url()` pattern.
  - Rationale: `@import url()` to Google Fonts is render-blocking and adds a DNS lookup + connection to `fonts.gstatic.com`. `@font-face` with `font-display: swap` gives control over loading behavior.

- **Decision**: Preserve all existing token names as aliases during migration.
  - Rationale: Prevents breakage in `styles.css` (1388 lines) and `ShipyardWorkbench.tsx` (1109 lines). Old names can be deprecated in a follow-up story.

## Token Architecture

### File Structure
```
shipyard/ui/src/tokens/
├── index.css          # Import orchestrator (cascade order)
├── reset.css          # CSS reset/normalize
├── primitives.css     # Color, type, spacing, radius, elevation
├── components.css     # Card, badge, input, button, status tokens
└── motion.css         # Duration, easing, spring, enter/exit
```

### Import Order (index.css)
```css
@import "./reset.css";
@import "./primitives.css";
@import "./components.css";
@import "./motion.css";
```

### Color System (OKLCH)
- Define hue anchors: amber (accent ~55°), teal (info ~185°), red (danger ~25°), green (success ~145°), yellow (warning ~85°).
- For each hue: generate 3 lightness stops (strong, soft, subtle) using consistent L/C curves.
- Dark theme: low-lightness backgrounds (L: 0.12–0.20), high-lightness text (L: 0.85–0.95).
- Light theme (`[data-theme="light"]`): invert lightness curves.
- sRGB fallback: keep current hex values as `--color-*-fallback` and use `@supports (color: oklch(0 0 0))` progressive enhancement.

### Type Scale
- Base: `1rem` (16px default)
- Ratio: `1.2` (minor third)
- Steps: `--text-3xs` through `--text-3xl` (9 steps)
- Semantic aliases: `--text-heading-hero`, `--text-heading-section`, `--text-heading-sub`, `--text-body`, `--text-body-small`, `--text-caption`, `--text-mono`, `--text-mono-small`
- Each step defines size, line-height, and letter-spacing as a group.

### Spacing Scale
- Base unit: `0.25rem` (4px)
- Named steps: `--space-0` (0) through `--space-16` (4rem / 64px), plus `--space-px` (1px)
- Additional contextual aliases: `--space-card-padding`, `--space-section-gap`, `--space-inline-gap`

### Motion Tokens
- Duration tiers: `--duration-instant` (0ms), `--duration-fast` (100ms), `--duration-normal` (200ms), `--duration-slow` (350ms), `--duration-deliberate` (500ms)
- Easing: `--ease-out` (cubic-bezier(0.16, 1, 0.3, 1)), `--ease-in-out` (cubic-bezier(0.65, 0, 0.35, 1)), `--ease-spring` (cubic-bezier(0.34, 1.56, 0.64, 1))
- Enter/exit: `--enter-duration`, `--enter-easing`, `--exit-duration`, `--exit-easing`
- Reduced motion: `@media (prefers-reduced-motion: reduce)` sets all durations to `0ms` and easing to `linear`.

## Dependency Plan

- Existing dependencies used: Vite CSS handling, browser CSS custom properties.
- New dependencies proposed: None.
- Risk and mitigation:
  - Risk: OKLCH not supported in older browsers (Safari <15.4, Chrome <111).
    Mitigation: sRGB fallback values using `@supports` or duplicate declarations.
  - Risk: Font loading changes cause FOUT/CLS.
    Mitigation: `font-display: swap` plus `size-adjust` on fallback to minimize layout shift.

## Test Strategy

- Unit tests: Not applicable (pure CSS).
- Integration tests: Existing UI tests must pass without modification.
- Visual regression: Manual verification that ShipyardWorkbench renders identically before and after token migration.
- Automated checks:
  - `pnpm --dir shipyard build` — ensures CSS imports resolve.
  - `pnpm --dir shipyard typecheck` — ensures no TS breakage from import changes.
  - `git diff --check` — no trailing whitespace.
- Skill-based validation:
  - Run `critique` skill on tokens directory for design system quality.
  - Run `audit` skill for accessibility compliance of color contrast ratios.

## Migration Strategy

1. Create `tokens/` directory with all four files.
2. Copy existing token values from `tokens.css` into `primitives.css`, reorganized by category.
3. Add new tokens (component-level, motion, OKLCH colors) alongside preserved originals.
4. Create `tokens/index.css` with correct import order.
5. Update `styles.css` to import `tokens/index.css` instead of `tokens.css`.
6. Search all `.css` and `.tsx` files for `var(--` references and verify every token resolves.
7. Delete old `tokens.css` file.
8. Run full build + typecheck + visual check.

## Rollout and Risk Mitigation

- Rollback strategy: Revert to old `tokens.css` by restoring the single file and import. The new tokens directory is purely additive until the old file is deleted.
- Observability checks: CSS custom property resolution failures show as the initial value (transparent/auto/0) which is visually obvious.
- Maintenance note: Future tokens should be added to the appropriate category file, not to a catch-all.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
