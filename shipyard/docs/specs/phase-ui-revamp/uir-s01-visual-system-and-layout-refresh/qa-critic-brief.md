# QA Critic Brief — UIR-S01: Visual System and Layout Refresh

**Date**: 2026-03-24
**Evidence method**: Code-level review (no deployed surface; local build verified)

---

## Strengths

1. **Token coverage**: All font sizes, spacing, border colors, and shadow depths now reference named CSS custom properties. No raw pixel values remain in `styles.css` for these categories.
2. **Elevation hierarchy**: Four elevation levels (`--elevation-0` through `--elevation-4`) replace the previous two ad-hoc shadow variables, giving cards, top bar, and status bar clear depth ordering.
3. **Type scale**: Named steps (`--text-xs` through `--text-hero`) replace 12+ magic `rem` values, making the hierarchy scannable in a single glance at `tokens.css`.
4. **Layout tokens**: Sidebar widths and panel gap are now single-source tokens, making future responsive tuning a one-line change.
5. **New primitives**: `Divider` and `MicroLabel` components join the existing four, closing the gap for the two most commonly repeated inline patterns.

## Findings

| # | Finding | Severity | Scope |
|---|---------|----------|-------|
| 1 | `--radius-sm` changed from `0.75rem` to `0.5rem` — diff lines and inline code pills will appear slightly less rounded. Verify this is acceptable visually. | Low | Cosmetic |
| 2 | Panel padding increased from `--space-5` to `--space-6` — narrower viewports (1180–1300px) may feel tighter before the responsive breakpoint collapses columns. | Low | Layout |
| 3 | `Divider` and `MicroLabel` are exported but not yet consumed by `ShipyardWorkbench.tsx`. The inline `<span className="micro-label">` and `<hr>` equivalents still exist in the workbench JSX. | Low | Consistency |
| 4 | The `--text-faint` token is defined but not yet used in any CSS rule. It should be wired to a visible element or removed to avoid orphan tokens. | Info | Hygiene |
| 5 | No font `@import` or `@font-face` declarations exist — the type system relies on system-installed fonts. If IBM Plex is missing, the fallback stack differs across OS. | Info | Cross-platform |

## Recommended Improvements

- **Finding 3**: A follow-on story should migrate inline micro-label and divider usage in `ShipyardWorkbench.tsx` to the new primitives for consistency (non-blocking).
- **Finding 5**: Consider adding a web-font loader or documenting the expected font stack in project setup notes (non-blocking).

## Suggested Follow-On Stories

1. **UIR-S01-F1: Migrate inline micro-labels and dividers to primitives**
   - Problem: `ShipyardWorkbench.tsx` still uses raw `<span className="micro-label">` instead of the new `MicroLabel` component.
   - Outcome: All micro-label and divider usage goes through primitives for consistent behavior.
   - Non-blocking because the rendered output is visually identical today.

2. **UIR-S01-F2: Wire `--text-faint` to appropriate elements**
   - Problem: Token is defined but unused; orphan tokens erode trust in the system.
   - Outcome: Either used for a real element (e.g., disabled states) or removed.
   - Non-blocking because no visible regression exists.

3. **UIR-S01-F3: Add web font fallback strategy**
   - Problem: IBM Plex Sans/Mono rely on local install; absent on many systems.
   - Outcome: Either bundle via `@font-face` or document install requirement.
   - Non-blocking because the fallback stack renders acceptably.
