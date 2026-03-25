# Feature Spec

## Metadata
- Story ID: UIV2-S01
- Story Title: Design System Foundation
- Author: Claude
- Date: 2026-03-24
- Estimated effort: 2–3 hours
- Related pack: Phase UI v2 — Complete UI Reimagination
- Skills: frontend-design, emil-design-eng, typeset, colorize, baseline-ui, critique, audit

## Problem Statement

The current token system in `shipyard/ui/src/tokens.css` (147 lines) was a solid first pass but lacks the rigor required for a premium developer console aesthetic. Specific gaps:

1. **No systematic color generation.** Colors are hand-picked hex/rgba values. There is no OKLCH-based perceptual uniformity, no derivation formula, and no automatic dark/light theme switching architecture.
2. **No modular type scale with named semantic steps.** The type scale uses approximate minor-third values but they are not derived from a single base+ratio formula, and there are no semantic aliases (e.g., `--text-heading-section`, `--text-body-prose`).
3. **No component-level tokens.** Primitives like SurfaceCard, Badge, and StatusDot reach directly into primitive tokens. There is no indirection layer where a card's background, border, and padding are named as card-specific tokens.
4. **No motion tokens.** Duration and easing exist (`--duration-fast`, `--ease-default`) but there are no spring configurations, no enter/exit curves, no per-interaction timing semantics.
5. **Font loading via Google Fonts `@import url()`.** This blocks rendering, has no fallback control, and does not use `@font-face` with `font-display: swap`.
6. **No CSS reset/normalize layer.** The app relies on Vite's default behavior with no explicit reset, leading to inconsistent margin/padding across browsers.

These gaps make the design system brittle: every new component must rediscover spacing, color, and motion values instead of composing from a predictable system.

## Story Objectives

- Objective 1: Replace the single `tokens.css` file with a structured `tokens/` directory containing `primitives.css`, `components.css`, `motion.css`, and `reset.css`.
- Objective 2: Build the color system on OKLCH with systematic lightness/chroma curves for dark and light themes.
- Objective 3: Define the type scale from a single base size and modular ratio, with both raw steps and semantic aliases.
- Objective 4: Create component-level tokens that reference primitive tokens, covering card, badge, input, button, and status patterns.
- Objective 5: Define motion tokens including duration tiers, easing curves, enter/exit semantics, and spring configurations.
- Objective 6: Replace the Google Fonts `@import` with self-hosted or CDN `@font-face` declarations using `font-display: swap`.
- Objective 7: Add a CSS reset/normalize layer as the first import in the cascade.

## User Stories

- As a UI engineer, I want a structured token directory so I can find and modify design values without scanning a single 147-line file.
- As a designer, I want OKLCH-based color tokens so dark and light variants maintain perceptual uniformity.
- As a developer adding a new component, I want component-level tokens so I don't have to decide which primitive colors, spacing, and radii to use.
- As a motion designer, I want named motion tokens so animations are consistent and easy to override for reduced-motion preferences.

## Acceptance Criteria

- [ ] AC-1: New design system tokens live in `shipyard/ui/src/tokens/` with files: `primitives.css`, `components.css`, `motion.css`, `reset.css`.
- [ ] AC-2: A root `tokens/index.css` imports all token files in cascade order (reset → primitives → components → motion).
- [ ] AC-3: Type scale is generated from a base size (1rem) and modular ratio (1.2 minor third) with at least 8 named steps plus semantic aliases for heading, body, caption, and mono contexts.
- [ ] AC-4: Color system uses OKLCH color space with documented lightness/chroma curves. Dark theme is the default; light theme tokens exist as a `[data-theme="light"]` override.
- [ ] AC-5: Spacing scale uses a 4px (0.25rem) base unit with at least 12 named steps from `--space-0` to `--space-16`.
- [ ] AC-6: Component tokens exist for: card (background, border, padding, radius, shadow), badge (background, text, border per tone), input (background, border, focus-ring, placeholder), button (background, text, hover, active per variant), status (color per state).
- [ ] AC-7: Motion tokens define at least 4 duration tiers (instant, fast, normal, slow), 3 easing curves (ease-out, ease-in-out, spring), and enter/exit semantics.
- [ ] AC-8: `@font-face` declarations load IBM Plex Sans, IBM Plex Mono, and a serif display face with `font-display: swap` and appropriate `unicode-range` subsetting.
- [ ] AC-9: CSS reset/normalize neutralizes margin, padding, box-sizing, and font inheritance across all elements.
- [ ] AC-10: The old `tokens.css` file is replaced by `tokens/index.css` and all existing imports are updated.
- [ ] AC-11: All existing component rendering is visually unchanged — no regressions in ShipyardWorkbench, SurfaceCard, Badge, StatusDot, or any other primitive.
- [ ] AC-12: `pnpm --dir shipyard build` and `pnpm --dir shipyard typecheck` pass.

## Edge Cases

- Font files fail to load: fallback stack must render acceptably without layout shift (FOUT over FOIT).
- Consumers reference old token names: migration must be complete — no orphaned `var(--old-name)` references.
- Light theme override must not break if applied before JS hydration (CSS-only fallback).
- Reduced motion media query must disable all spring/transition tokens gracefully.

## Non-Functional Requirements

- Performance: Token CSS must total under 5KB uncompressed. No runtime JS for token resolution.
- Maintainability: Each token file should have a header comment explaining its derivation formula.
- Accessibility: Color contrast ratios must meet WCAG 2.2 AA (4.5:1 for body text, 3:1 for large text) in both dark and light themes.

## UI Requirements

- No visible UI changes in this story. This is a foundation-only refactor.
- Visual regression safety is the primary UI concern.

## Out of Scope

- Component implementation changes (covered in S02–S04).
- Theming UI (theme switcher toggle).
- CSS-in-JS migration or runtime theming.
- Icon system definition.

## Done Definition

- Token directory exists with all four files and correct import order.
- Every `var()` reference in `styles.css` and `primitives.tsx` resolves to a token defined in the new system.
- `critique` and `audit` skills report no high-severity issues.
- Build, typecheck, and existing tests pass.
