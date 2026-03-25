# Task Breakdown

## Story
- Story ID: UIV2-S01
- Story Title: Design System Foundation

## Execution Notes
- Work inside `shipyard/ui/src/tokens/` directory.
- Preserve all existing token names as aliases to avoid breaking `styles.css` (1388 lines) and `ShipyardWorkbench.tsx` (1109 lines).
- Test each migration step with `pnpm --dir shipyard build` before proceeding.
- Use the `frontend-design` and `baseline-ui` skills to validate the token architecture before writing CSS.
- Use the `typeset` skill to validate the type scale and font loading.
- Use the `colorize` skill to validate the OKLCH color system.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Create `tokens/` directory structure with `index.css`, `reset.css`, `primitives.css`, `components.css`, `motion.css` and establish import order in `index.css`. | none | no | `pnpm --dir shipyard build` |
| T002 | Define primitive tokens: OKLCH color palette with hue anchors (amber, teal, red, green, yellow), lightness/chroma curves for dark theme default, sRGB fallbacks, surface/border/text color tokens, and `[data-theme="light"]` overrides. Preserve all existing color token names as aliases. | blocked-by:T001 | yes | `pnpm --dir shipyard build`, `colorize` skill |
| T003 | Define primitive tokens: type scale from 1rem base + 1.2 ratio (9 raw steps + semantic aliases), line-height pairings, letter-spacing values, font-weight tokens, and font-family stacks. | blocked-by:T001 | yes | `pnpm --dir shipyard build`, `typeset` skill |
| T004 | Define primitive tokens: spacing scale (4px base, 13+ named steps), border-radius scale, elevation/shadow scale. Preserve existing spacing/radius/elevation names as aliases. | blocked-by:T001 | yes | `pnpm --dir shipyard build` |
| T005 | Define component tokens in `components.css`: card (background, border, padding, radius, shadow), badge (bg/text/border per tone: neutral, accent, success, danger, warning), input (bg, border, focus-ring, placeholder, text), button (bg, text, hover, active per variant: primary, ghost, danger), status (color per state: idle, running, success, error, warning). | blocked-by:T002,T003,T004 | no | `pnpm --dir shipyard build` |
| T006 | Define motion tokens in `motion.css`: 5 duration tiers, 3 easing curves, spring config, enter/exit semantics, and `@media (prefers-reduced-motion: reduce)` override that zeros all durations. | blocked-by:T001 | yes | `pnpm --dir shipyard build` |
| T007 | Create CSS reset/normalize in `reset.css`: box-sizing border-box, margin/padding reset, font inheritance, line-height normalization, image block display, form element font inheritance, reduced-motion defaults. | blocked-by:T001 | yes | `pnpm --dir shipyard build` |
| T008 | Replace Google Fonts `@import url()` in old `tokens.css` with `@font-face` declarations for IBM Plex Sans (400, 500, 600, 700), IBM Plex Mono (400, 600, 700), and serif display face. Use `font-display: swap` and `size-adjust` on fallback. | blocked-by:T001 | yes | `pnpm --dir shipyard build`, font loading check |
| T009 | Migrate `styles.css` to import `tokens/index.css` instead of `tokens.css`. Verify every `var(--*)` reference in `styles.css` resolves to a defined token. | blocked-by:T002,T003,T004,T005,T006,T007,T008 | no | `pnpm --dir shipyard build` |
| T010 | Delete old `tokens.css`. Update any other files that import it directly (check `main.tsx`, `index.html`). | blocked-by:T009 | no | `pnpm --dir shipyard build`, `pnpm --dir shipyard typecheck` |
| T011 | Run `critique` and `audit` skills on the complete token system. Fix any high-severity findings. | blocked-by:T010 | no | skill output review |

## TDD Mapping

- T001 tests:
  - [ ] `tokens/index.css` exists and imports four files in correct cascade order
  - [ ] Build succeeds with the new import structure
- T002 tests:
  - [ ] All existing color token names resolve (no broken `var()` references)
  - [ ] OKLCH values have sRGB fallbacks
  - [ ] `[data-theme="light"]` override block exists
- T003 tests:
  - [ ] Type scale has 9+ named steps derived from 1rem * 1.2^n
  - [ ] Semantic aliases exist for heading, body, caption, mono
- T004 tests:
  - [ ] Spacing scale covers 0 through 64px in 4px increments
  - [ ] Existing spacing names preserved
- T005 tests:
  - [ ] Component tokens reference primitive tokens (no hardcoded values)
  - [ ] Badge tokens cover all 5 tones
- T006 tests:
  - [ ] Duration tiers exist from instant to deliberate
  - [ ] `prefers-reduced-motion` media query present
- T007 tests:
  - [ ] `box-sizing: border-box` applied globally
  - [ ] Margin/padding reset applied to block elements
- T008 tests:
  - [ ] No `@import url("https://fonts.googleapis.com/...")` remains
  - [ ] `@font-face` declarations include `font-display: swap`
- T009 tests:
  - [ ] `styles.css` no longer imports `tokens.css`
  - [ ] Zero unresolved `var()` references
- T010 tests:
  - [ ] `tokens.css` file no longer exists
  - [ ] Build + typecheck pass
- T011 tests:
  - [ ] `critique` skill reports no high-severity issues
  - [ ] `audit` skill reports WCAG AA compliance for text contrast

## Completion Criteria

- [ ] All acceptance criteria from feature-spec.md verified
- [ ] Token directory contains all four files with correct import order
- [ ] Build, typecheck, and tests pass
- [ ] No visual regressions in existing components
- [ ] Skills `critique` and `audit` pass with no high-severity findings
