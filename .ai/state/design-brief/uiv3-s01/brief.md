# UIV3-S01: Design System Rebuild — Design Brief

Story: UIV3-S01
Phase: Design
Last updated: 2026-03-24

---

## 1. Visual Direction and Mood

Linear-style premium developer console. The product should feel like a precision instrument — confident, warm, focused, and reliable. Dark-field canvas with subtle grid texture providing spatial orientation. Warm amber accent (#d58c53) used sparingly for interactivity and status. Atmosphere is calm and professional: no decorative saturation spikes, no heavy visual effects competing with content.

Key mood words translated to implementation rules:
- **Premium** — thin borders, restrained palette, precise spacing, subtle depth via glassmorphic layering
- **Technical** — monospace accents for data, denser data framing in execution contexts, sharper contrast ratios
- **Warm** — amber accent over cold blue defaults, softer neutral midtones, humane spacing, approachable curvature (radius-md/lg default)

---

## 2. Component Inventory

### New Artifacts (this story creates files, not components)
| File | Purpose |
|---|---|
| `tokens/reset.css` | Minimal opinionated CSS reset |
| `tokens/primitives.css` | Raw scale values: color, type, spacing, radius, elevation |
| `tokens/semantic.css` | Contextual aliases: surfaces, borders, text tones, status colors |
| `tokens/components.css` | Component-level tokens referencing semantic layer |
| `tokens/motion.css` | Timing, easing, spring configs, enter/exit semantics |
| `tokens/index.css` | Barrel import ordering all layers |

### Modified Artifacts
| File | Change |
|---|---|
| `tokens.css` (current monolith) | Replaced entirely by the `tokens/` directory |
| `styles.css` | Update `@import` to point to `tokens/index.css` |

### No Component Changes
This story is token architecture only. Primitives.tsx and ShipyardWorkbench.tsx are untouched.

---

## 3. Token Architecture

### 3.1 Color Palette — OKLCH with Perceptual Uniformity

All colors are authored in OKLCH for perceptual uniformity, with hex fallbacks generated for older browsers via `@supports` or build-time conversion.

#### Neutral Scale (blue-gray undertone, hue ~230)

| Token | OKLCH | Hex Approx | Usage |
|---|---|---|---|
| `--gray-1` | `oklch(0.07 0.01 230)` | `#0a0f14` | Canvas / deepest background |
| `--gray-2` | `oklch(0.10 0.012 230)` | `#0e151c` | Card background base |
| `--gray-3` | `oklch(0.13 0.014 230)` | `#121d25` | Card strong / elevated surface |
| `--gray-4` | `oklch(0.17 0.012 230)` | `#1a2730` | Inset / recessed surface |
| `--gray-5` | `oklch(0.22 0.010 230)` | `#253440` | Subtle border base |
| `--gray-6` | `oklch(0.30 0.008 230)` | `#3a4d5c` | Medium border / divider |
| `--gray-7` | `oklch(0.42 0.006 230)` | `#5a707e` | Muted text / disabled |
| `--gray-8` | `oklch(0.55 0.005 230)` | `#7e929f` | Secondary body text |
| `--gray-9` | `oklch(0.70 0.004 230)` | `#a3b3be` | Primary body text |
| `--gray-10` | `oklch(0.82 0.003 230)` | `#c5d0d8` | Strong body text |
| `--gray-11` | `oklch(0.92 0.002 230)` | `#e4eaee` | Headings / emphasis |
| `--gray-12` | `oklch(0.97 0.001 230)` | `#f2f5f7` | Maximum contrast text |

#### Amber Accent Scale (hue ~60)

| Token | OKLCH | Hex Approx | Usage |
|---|---|---|---|
| `--amber-1` | `oklch(0.15 0.04 60)` | `#1f1508` | Soft background tint |
| `--amber-2` | `oklch(0.22 0.06 60)` | `#33220d` | Hover background |
| `--amber-3` | `oklch(0.30 0.08 60)` | `#4a3112` | Active/pressed background |
| `--amber-4` | `oklch(0.38 0.10 60)` | `#634118` | Subtle border |
| `--amber-5` | `oklch(0.50 0.12 60)` | `#8a5c24` | Medium border |
| `--amber-6` | `oklch(0.62 0.14 60)` | `#b07430` | Strong border / icon |
| `--amber-7` | `oklch(0.72 0.15 60)` | `#d58c53` | **Primary accent** (interactive elements) |
| `--amber-8` | `oklch(0.80 0.12 60)` | `#e0a876` | Hover accent |
| `--amber-9` | `oklch(0.88 0.08 60)` | `#ecc4a0` | Muted accent text |
| `--amber-10` | `oklch(0.94 0.04 60)` | `#f5dfc8` | Faint accent wash |

#### Status Scales (3-stop each: soft bg, strong fg, border)

**Success (hue ~155)**
| Token | OKLCH | Usage |
|---|---|---|
| `--green-soft` | `oklch(0.25 0.06 155)` | Background tint |
| `--green-strong` | `oklch(0.72 0.14 155)` | Text / icon |
| `--green-border` | `oklch(0.40 0.08 155)` | Border |

**Danger (hue ~25)**
| Token | OKLCH | Usage |
|---|---|---|
| `--red-soft` | `oklch(0.22 0.06 25)` | Background tint |
| `--red-strong` | `oklch(0.70 0.16 25)` | Text / icon |
| `--red-border` | `oklch(0.38 0.10 25)` | Border |

**Warning (hue ~85)**
| Token | OKLCH | Usage |
|---|---|---|
| `--yellow-soft` | `oklch(0.25 0.06 85)` | Background tint |
| `--yellow-strong` | `oklch(0.78 0.12 85)` | Text / icon |
| `--yellow-border` | `oklch(0.40 0.08 85)` | Border |

### 3.2 Semantic Color Layer

These reference primitive scale steps:

```
--surface-canvas:      var(--gray-1)
--surface-card:        var(--gray-2)
--surface-card-strong: var(--gray-3)
--surface-inset:       var(--gray-4) with alpha overlay
--surface-muted:       oklch(1 0 0 / 0.035)
--surface-highlight:   var(--amber-1)

--border-subtle:       var(--gray-5) with alpha
--border-medium:       var(--gray-6) with alpha
--border-strong:       var(--amber-5)
--border-focus:        var(--amber-7)

--text-strong:         var(--gray-12)
--text-body:           var(--gray-9)
--text-muted:          var(--gray-7)
--text-faint:          var(--gray-7) at 60% opacity
--text-inverse:        var(--gray-1)

--accent-strong:       var(--amber-7)
--accent-hover:        var(--amber-8)
--accent-soft:         var(--amber-1)
--accent-border:       var(--amber-5)
--accent-glow:         var(--amber-7) at 30% opacity

--success-strong:      var(--green-strong)
--success-soft:        var(--green-soft)
--danger-strong:       var(--red-strong)
--danger-soft:         var(--red-soft)
--warning-strong:      var(--yellow-strong)
--warning-soft:        var(--yellow-soft)
```

### 3.3 Type Scale — Minor Third (1.2) Ratio

Anchor: `1rem = 14.5px` (set on `html`). This gives a compact developer-tool density while remaining legible.

| Token | Value | rem | Use |
|---|---|---|---|
| `--text-2xs` | `0.579rem` | ~8.4px | Timestamp micro, line numbers |
| `--text-xs` | `0.694rem` | ~10px | Kickers, micro labels |
| `--text-sm` | `0.833rem` | ~12px | Captions, metadata, badges |
| `--text-base` | `1rem` | 14.5px | Body text, form inputs |
| `--text-md` | `1.2rem` | ~17.4px | Card titles, block headings |
| `--text-lg` | `1.44rem` | ~20.9px | Section headings |
| `--text-xl` | `1.728rem` | ~25px | Panel headings |
| `--text-2xl` | `2.074rem` | ~30px | Page-level headings |
| `--text-hero` | `clamp(2.488rem, 4vw, 3.583rem)` | 36-52px | Top-bar title (fluid) |

Semantic aliases:
```
--type-heading-xl:  var(--text-2xl)  font-display  weight-bold     leading-none   tracking-tighter
--type-heading-lg:  var(--text-xl)   font-display  weight-bold     leading-tight  tracking-tighter
--type-heading-md:  var(--text-lg)   font-display  weight-semibold leading-tight  tracking-tight
--type-heading-sm:  var(--text-md)   font-display  weight-semibold leading-snug   tracking-tight
--type-body:        var(--text-base) font-body     weight-normal   leading-normal tracking-normal
--type-body-sm:     var(--text-sm)   font-body     weight-normal   leading-normal tracking-normal
--type-caption:     var(--text-xs)   font-body     weight-medium   leading-normal tracking-wide
--type-kicker:      var(--text-xs)   font-body     weight-bold     leading-normal tracking-widest uppercase
--type-mono:        var(--text-base) font-mono     weight-normal   leading-normal tracking-normal
--type-mono-sm:     var(--text-sm)   font-mono     weight-normal   leading-normal tracking-normal
--type-mono-xs:     var(--text-2xs)  font-mono     weight-normal   leading-normal tracking-normal
```

### 3.4 Spacing Scale — 4px Base with Contextual Aliases

| Token | Value | px |
|---|---|---|
| `--space-0` | `0` | 0 |
| `--space-px` | `1px` | 1 |
| `--space-0.5` | `0.125rem` | 2 |
| `--space-1` | `0.25rem` | 4 |
| `--space-1.5` | `0.375rem` | 6 |
| `--space-2` | `0.5rem` | 8 |
| `--space-3` | `0.75rem` | 12 |
| `--space-4` | `1rem` | 16 |
| `--space-5` | `1.25rem` | 20 |
| `--space-6` | `1.5rem` | 24 |
| `--space-7` | `2rem` | 32 |
| `--space-8` | `2.5rem` | 40 |
| `--space-9` | `3rem` | 48 |
| `--space-10` | `4rem` | 64 |
| `--space-12` | `6rem` | 96 |

Contextual aliases:
```
--gap-inline:   var(--space-2)    /* 8px  — between inline elements in a row */
--gap-stack:    var(--space-3)    /* 12px — between stacked items in a list */
--gap-section:  var(--space-6)    /* 24px — between major sections */
--gap-panel:    var(--space-5)    /* 20px — between panels in the grid */
--pad-card:     var(--space-5)    /* 20px — internal card padding */
--pad-card-sm:  var(--space-4)    /* 16px — compact card padding */
--pad-inset:    var(--space-4)    /* 16px — inset/recessed area padding */
--pad-header:   var(--space-3) var(--space-4)  /* header vertical/horizontal */
```

### 3.5 Border Radius

| Token | Value |
|---|---|
| `--radius-xs` | `0.25rem` (4px) |
| `--radius-sm` | `0.375rem` (6px) |
| `--radius-md` | `0.5rem` (8px) |
| `--radius-lg` | `0.75rem` (12px) |
| `--radius-xl` | `1rem` (16px) |
| `--radius-2xl` | `1.25rem` (20px) |
| `--radius-pill` | `999px` |

### 3.6 Elevation

| Token | Value | Usage |
|---|---|---|
| `--elevation-0` | `none` | Flat elements |
| `--elevation-1` | `0 1px 3px oklch(0 0 0 / 0.12)` | Subtle lift (badges, buttons) |
| `--elevation-2` | `0 4px 12px oklch(0 0 0 / 0.18)` | Cards |
| `--elevation-3` | `0 12px 32px oklch(0 0 0 / 0.22)` | Elevated panels, popovers |
| `--elevation-4` | `0 24px 64px oklch(0 0 0 / 0.28)` | Modals, command palette |
| `--shadow-inner` | `inset 0 1px 0 oklch(1 0 0 / 0.05)` | Top-edge highlight on glass |
| `--shadow-glow` | `0 0 0 1px var(--accent-glow)` | Focus/active ring for accent items |

### 3.7 Blur / Glass

| Token | Value |
|---|---|
| `--blur-sm` | `blur(8px)` |
| `--blur-md` | `blur(16px)` |
| `--blur-lg` | `blur(24px)` |

---

## 4. Layout Decisions

Not in scope for S01. Tokens provide layout primitives (`--gap-*`, `--pad-*`, `--shell-max-width`, `--sidebar-*`) but the grid structure is defined in S02.

Layout tokens carried forward:
```
--grid-line:          var(--gray-5) at 6% opacity
--shell-max-width:    104rem
--sidebar-width:      220px
--sidebar-collapsed:  48px
--sidebar-right:      280px
--panel-gap:          var(--gap-panel)
```

---

## 5. Typography Decisions

### Font Stack Strategy

**Display (headings):** `"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif`
- OS serif stack, no web font download required.
- Used for all heading levels (h1-h4) and empty-state headings.

**Body:** `"IBM Plex Sans", system-ui, -apple-system, sans-serif`
- Loaded via `@font-face` with `font-display: swap`.
- Weights: 400 (normal), 500 (medium), 600 (semibold), 700 (bold).
- Subset: latin, latin-ext only.
- Files: WOFF2 format, self-hosted from `/fonts/` directory (no Google Fonts CDN dependency).

**Mono:** `"IBM Plex Mono", "SFMono-Regular", ui-monospace, monospace`
- Loaded via `@font-face` with `font-display: swap`.
- Weights: 400 (normal), 600 (semibold).
- Used for: code, paths, session IDs, timestamps, diffs, data values.

### @font-face Strategy

Self-host WOFF2 files to eliminate third-party CDN dependency and improve TTFB:
```
/fonts/
  ibm-plex-sans-400.woff2
  ibm-plex-sans-500.woff2
  ibm-plex-sans-600.woff2
  ibm-plex-sans-700.woff2
  ibm-plex-mono-400.woff2
  ibm-plex-mono-600.woff2
```

Each `@font-face` block uses `font-display: swap` and `unicode-range` for latin subset.

Remove the current `@import url("https://fonts.googleapis.com/css2?...")` from tokens.css.

---

## 6. Color Decisions

See section 3.1-3.2 above for the complete palette. Key semantic decisions:

- **Canvas** is near-black (`#0a0f14`) with a blue-gray undertone, not pure black (avoids OLED harshness).
- **Cards** layer at ~+3 lightness steps above canvas with alpha transparency for glass effect.
- **Amber accent** is the sole chromatic accent for interactive elements. Status colors (green, red, yellow) are reserved strictly for semantic meaning.
- **Text hierarchy** uses 4 stops: strong (headings), body (paragraphs), muted (secondary), faint (disabled/placeholder).
- **Borders** use alpha-blended neutrals at 3 intensity levels, plus semantic colored borders for status cards.
- **No new tones** beyond the existing amber/green/red/yellow quartet. The palette is intentionally constrained.

---

## 7. Motion Plan

### Timing Tiers

| Token | Value | Usage |
|---|---|---|
| `--duration-instant` | `80ms` | Micro-feedback: button press, toggle |
| `--duration-fast` | `120ms` | Hover states, small transitions |
| `--duration-normal` | `200ms` | Standard state changes |
| `--duration-slow` | `320ms` | Panel expand/collapse, card enter |
| `--duration-slower` | `500ms` | Page-level transitions, skeleton fade |

### Easing Curves

| Token | Value | Usage |
|---|---|---|
| `--ease-default` | `cubic-bezier(0.25, 0.1, 0.25, 1)` | General purpose |
| `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | Exit animations |
| `--ease-out` | `cubic-bezier(0, 0, 0.2, 1)` | Enter animations |
| `--ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | Symmetric transitions |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Bouncy micro-interactions (toggle, badge pop) |
| `--ease-smooth` | `cubic-bezier(0.16, 1, 0.3, 1)` | Smooth deceleration for slides |

### Enter/Exit Semantics

| Pattern | Enter | Exit |
|---|---|---|
| Card appear | `duration-slow` + `ease-out` + `translateY(8px)` fade-up | `duration-fast` + `ease-in` + opacity fade |
| Panel slide | `duration-slow` + `ease-smooth` + `translateX` | `duration-normal` + `ease-in` + `translateX` |
| Badge pop | `duration-fast` + `ease-spring` + `scale(0.9)` | `duration-instant` + `ease-in` + opacity |
| Skeleton shimmer | `duration-slower` + linear infinite | N/A |
| Focus ring | `duration-instant` + `ease-out` | `duration-instant` + `ease-in` |

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 8. Copy Direction

Not directly applicable to token-only story. However, token file headers should use clear section comments:
- `/* -- [Category] -- */` format for major sections
- Inline comments explaining non-obvious values (e.g., why `--text-base` is 14.5px)
- No emoji in code comments

---

## 9. Accessibility Requirements

### Contrast Ratios (WCAG 2.2 AA minimum)

| Combination | Ratio | Status |
|---|---|---|
| `--text-strong` on `--surface-canvas` | >=15:1 | Pass |
| `--text-body` on `--surface-canvas` | >=7:1 | Pass |
| `--text-body` on `--surface-card` | >=6.5:1 | Pass |
| `--text-muted` on `--surface-canvas` | >=4.5:1 | Must verify |
| `--accent-strong` on `--surface-canvas` | >=4.5:1 | Must verify |
| `--success-strong` on `--surface-canvas` | >=4.5:1 | Must verify |
| `--danger-strong` on `--surface-canvas` | >=4.5:1 | Must verify |

All status colors must pass 4.5:1 against their respective soft backgrounds for badge text.

### Focus Visible

Define a `--focus-ring` composite token:
```
--focus-ring: 0 0 0 2px var(--surface-canvas), 0 0 0 4px var(--amber-7);
```
Double-ring pattern: inner ring matches background for gap, outer ring is accent.

### Color Not Sole Indicator

Every status communicated via color must also use an icon or text label. This is enforced at the component level (S02+), but the token layer provides the semantic color + a corresponding icon slot convention.

---

## 10. Anti-Patterns to Avoid

1. **No hex-only colors.** Every color must trace back to an OKLCH primitive. Hex is only for fallback.
2. **No magic numbers.** Every spacing value must reference a `--space-*` token. No raw `12px` or `0.75rem` in component CSS.
3. **No Google Fonts CDN.** Self-host all web fonts for reliability and privacy.
4. **No `!important` in tokens.** Only the reduced-motion override uses `!important`.
5. **No component-specific values in primitives.** Component tokens live in `components.css`, not `primitives.css`.
6. **No more than 4 font weights.** IBM Plex Sans: 400/500/600/700. IBM Plex Mono: 400/600. Strict constraint.
7. **No decorative gradients in the token layer.** Gradients are surface-level styling, defined in component CSS using token colors.
8. **No `rgba()` for new colors.** Use OKLCH with alpha: `oklch(L C H / alpha)`.
9. **No unnamed z-index values.** Define a z-index scale if needed (not in current scope but reserve the pattern).
10. **No token that duplicates another at the same specificity.** Each token must have a single canonical definition.

---

## 11. Responsive Breakpoint Behavior

Token values themselves do not change at breakpoints (they are resolution-independent). However, the token layer defines breakpoint custom media queries for consistent usage downstream:

| Token | Value | Meaning |
|---|---|---|
| `--bp-desktop-lg` | `1440px` | Full layout, all panels visible |
| `--bp-desktop` | `1280px` | Standard desktop |
| `--bp-tablet-lg` | `1024px` | Right sidebar collapses |
| `--bp-tablet` | `768px` | Both sidebars collapse |
| `--bp-mobile` | `375px` | Single column, stacked panels |

Since CSS custom properties cannot be used in `@media` queries, define these as CSS comments documenting the canonical values. Components use raw pixel values in media queries referencing these documented breakpoints.

The only token that responds to viewport is `--text-hero` via its `clamp()`.

At `<768px`, the `html` font-size may step down from `14.5px` to `14px` to give slightly more breathing room on small screens. This is the only responsive type adjustment.
