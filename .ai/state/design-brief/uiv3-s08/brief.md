# UIV3-S08: Motion/A11y/Polish — Design Brief

Story: UIV3-S08
Phase: Design
Last updated: 2026-03-24

---

## 1. Visual Direction and Mood

This story is the polish pass that elevates the workbench from functional to premium. Motion adds life and spatial understanding. Accessibility ensures the tool works for everyone. Polish addresses the micro-details that separate "good enough" from "thoughtfully crafted."

The motion philosophy is functional over decorative: every animation communicates state change, spatial relationship, or acknowledgment of user action. The accessibility philosophy is inclusive by default: WCAG 2.2 AA compliance is the floor, not the ceiling. The polish philosophy is restraint: fix the rough edges, but don't over-engineer delight.

Key mood words translated to implementation rules:
- **Responsive** — immediate feedback to user actions (sub-100ms acknowledgment)
- **Spatial** — motion reveals where elements come from and go to
- **Inclusive** — full keyboard navigation, screen reader support, reduced motion respect
- **Refined** — consistent timing, smooth curves, no jank, no surprises

---

## 2. Component Inventory

### New Components

| Component | File | Purpose |
|---|---|---|
| `SkeletonLoader` | `src/primitives/SkeletonLoader.tsx` | Placeholder shimmer for loading states |
| `SkeletonText` | `src/primitives/SkeletonText.tsx` | Text-shaped skeleton with line variants |
| `SkeletonCard` | `src/primitives/SkeletonCard.tsx` | Card-shaped skeleton with header/body zones |
| `FocusTrap` | `src/primitives/FocusTrap.tsx` | Traps focus within modal/drawer contexts |
| `SkipLink` | `src/primitives/SkipLink.tsx` | Visually hidden skip-to-main-content link |
| `VisuallyHidden` | `src/primitives/VisuallyHidden.tsx` | Screen reader only text wrapper |
| `LiveRegion` | `src/primitives/LiveRegion.tsx` | Announces dynamic content changes |
| `ReducedMotionProvider` | `src/primitives/ReducedMotionProvider.tsx` | React context for motion preference |

### Modified Components (Motion/Polish Pass)

| Component | Enhancement |
|---|---|
| `ShipyardShell` | Add entrance animation, stagger children |
| `ShipyardWorkbench` | Add panel entrance orchestration |
| `SurfaceCard` | Add entrance animation, hover micro-lift |
| `HeaderStrip` | Ensure instant mount (no animation) |
| `ShellSidebar` | Add collapse/expand animation refinement |
| `ShellFooter` | Add slide-up entrance |
| `TurnCard` | Add staggered entrance, status transition polish |
| `Badge` | Add scale-in micro-animation |
| `SessionPanel` | Add section expand/collapse animation |
| `ContextPanel` | Add textarea focus animation, history item entrance |
| `FileTree` | Add folder expand/collapse animation |
| `DiffViewer` | Add line highlight hover, load-more entrance |

### CSS Files

| File | Purpose |
|---|---|
| `src/primitives/skeleton.css` | Skeleton shimmer animation |
| `src/primitives/motion.css` | Reusable animation classes |
| `src/primitives/a11y.css` | Focus styles, skip links, visually hidden |

---

## 3. Token Selections

### Motion Tokens (from S01)

All motion uses existing tokens from `motion.css`:

| Token | Value | Usage |
|---|---|---|
| `--duration-instant` | `0ms` | Micro-feedback (button press) |
| `--duration-fast` | `100ms` | Hover states, quick transitions |
| `--duration-normal` | `200ms` | Standard state changes |
| `--duration-slow` | `350ms` | Panel expand/collapse, card entrance |
| `--duration-deliberate` | `500ms` | Page-level transitions, skeleton fade |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Entrance animations |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Symmetric transitions |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Playful micro-interactions |
| `--stagger-delay` | `75ms` | Sequential panel entrance |

### Focus Tokens (from S01)

| Token | Value | Usage |
|---|---|---|
| `--focus-ring-color` | `rgba(213, 140, 83, 0.7)` | Focus outline color |
| `--focus-ring-width` | `2px` | Focus outline thickness |
| `--focus-ring-offset` | `2px` | Gap between element and focus ring |

### New Tokens (added to `components.css`)

| Token | Value | Purpose |
|---|---|---|
| `--skeleton-base` | `var(--surface-muted)` | Skeleton background |
| `--skeleton-highlight` | `rgba(255, 255, 255, 0.06)` | Shimmer highlight |
| `--skeleton-duration` | `1.5s` | Shimmer cycle duration |
| `--entrance-translate` | `12px` | Default entrance translate distance |
| `--entrance-scale` | `0.96` | Default entrance scale start |
| `--hover-lift` | `-2px` | Card hover translateY |
| `--press-scale` | `0.97` | Button press scale |

---

## 4. Layout Decisions

### Skeleton Components

```css
.skeleton {
  position: relative;
  overflow: hidden;
  background: var(--skeleton-base);
  border-radius: var(--radius-md);
}

.skeleton::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent,
    var(--skeleton-highlight),
    transparent
  );
  transform: translateX(-100%);
  animation: skeleton-shimmer var(--skeleton-duration) ease-in-out infinite;
}

@keyframes skeleton-shimmer {
  100% {
    transform: translateX(100%);
  }
}
```

### Skeleton Variants

| Variant | Dimensions | Usage |
|---|---|---|
| `skeleton-text` | `height: 1em; width: var(--w)` | Text placeholders |
| `skeleton-text-sm` | `height: 0.75em` | Small text |
| `skeleton-card` | Matches card dimensions | Card placeholders |
| `skeleton-avatar` | `32px x 32px; border-radius: full` | Avatar placeholders |

### Skip Link

```css
.skip-link {
  position: absolute;
  top: var(--space-2);
  left: var(--space-2);
  z-index: 100;
  padding: var(--space-2) var(--space-3);
  background: var(--surface-card);
  border: 1px solid var(--border-medium);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--text-strong);
  text-decoration: none;
  transform: translateY(-150%);
  transition: transform var(--duration-fast) var(--ease-out);
}

.skip-link:focus {
  transform: translateY(0);
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}
```

### Focus Trap

FocusTrap component wraps modal/drawer content and:
1. Captures focus on mount (focuses first focusable element or container)
2. Prevents Tab from leaving the trapped region
3. Handles Shift+Tab wrap-around
4. Restores focus to trigger element on unmount

Implementation using `focus-trap-react` or custom hook.

### Live Region

```css
.live-region {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  clip: rect(0, 0, 0, 0);
  overflow: hidden;
  white-space: nowrap;
}
```

Used to announce:
- Status changes ("Connection established")
- Action confirmations ("Context sent")
- Error states ("Operation failed")

---

## 5. Typography Decisions

No new typography for this story. Motion and accessibility work with existing type tokens.

### Skip Link Typography

| Element | Font | Size | Weight | Color |
|---|---|---|---|---|
| Skip link | `--font-body` | `--text-sm` | `--weight-medium` | `--text-strong` |

### Live Region Typography

Live region content is visually hidden; any text style is acceptable since it's read-only by screen readers.

---

## 6. Color Decisions

### Skeleton Colors

- Base: `var(--skeleton-base)` = `var(--surface-muted)` — subtle gray
- Highlight: `var(--skeleton-highlight)` = `rgba(255, 255, 255, 0.06)` — faint white shimmer

### Focus Ring Colors

- Ring: `var(--focus-ring-color)` = `rgba(213, 140, 83, 0.7)` — amber, semi-transparent
- The double-ring pattern (from S01): inner ring matches background, outer ring is accent

### Error Focus

For error states, focus ring may use danger color:
```css
[aria-invalid="true"]:focus {
  --focus-ring-color: rgba(236, 129, 112, 0.7);
}
```

### High Contrast Mode

```css
@media (prefers-contrast: more) {
  :root {
    --focus-ring-color: var(--accent-strong);
    --focus-ring-width: 3px;
  }

  .skeleton::after {
    display: none; /* Disable shimmer in high contrast */
  }
}
```

---

## 7. Motion Plan

### Global Entrance Orchestration

When the workbench mounts:

```
T+0ms    Header (instant, no animation — stability anchor)
T+0ms    Shell background appears
T+50ms   Left sidebar slides in from left
T+100ms  Main content area fades up
T+150ms  Right sidebar slides in from right
T+200ms  Footer slides up
```

Each panel uses:
- Duration: `--duration-slow` (350ms)
- Easing: `--ease-out`
- Transform: `translateY(var(--entrance-translate))` + `opacity: 0` to `translateY(0)` + `opacity: 1`

### Panel Entrance Animation

```css
.panel-enter {
  opacity: 0;
  transform: translateY(var(--entrance-translate));
}

.panel-enter-active {
  opacity: 1;
  transform: translateY(0);
  transition:
    opacity var(--duration-slow) var(--ease-out),
    transform var(--duration-slow) var(--ease-out);
}
```

For horizontal panels (sidebars):
```css
.sidebar-enter {
  opacity: 0;
  transform: translateX(calc(var(--entrance-translate) * -1)); /* left sidebar */
}

.sidebar-right-enter {
  transform: translateX(var(--entrance-translate)); /* right sidebar */
}
```

### Card Stagger

When multiple cards appear (e.g., turn cards):

```css
.card-stagger {
  animation: card-entrance var(--duration-slow) var(--ease-out) backwards;
  animation-delay: calc(var(--stagger-index) * var(--stagger-delay));
}

@keyframes card-entrance {
  from {
    opacity: 0;
    transform: translateY(8px) scale(var(--entrance-scale));
  }
}
```

Set `--stagger-index` via inline style: `style="--stagger-index: 0"`, `--stagger-index: 1`, etc.

### Skeleton States

Loading states use skeleton components:

1. **Initial load**: Full skeleton layout (header, sidebar, main area)
2. **Panel load**: Individual panel skeletons
3. **Content load**: Skeleton text lines within panels

Skeleton-to-content transition:
```css
.skeleton-exit {
  animation: skeleton-fade var(--duration-normal) var(--ease-out) forwards;
}

@keyframes skeleton-fade {
  to {
    opacity: 0;
    transform: scale(0.98);
  }
}
```

Content appears with panel entrance animation as skeleton fades.

### Micro-Interactions

| Interaction | Animation |
|---|---|
| Button hover | Background color transition (`--duration-fast`) |
| Button press | `transform: scale(var(--press-scale))` (`--duration-instant`) |
| Card hover | `transform: translateY(var(--hover-lift))` + subtle shadow increase |
| Badge appear | `transform: scale(0.8)` to `scale(1)` with `--ease-spring` |
| Status dot pulse | `opacity` keyframe for running state |
| Chevron rotate | `transform: rotate(90deg)` on expand |
| Focus ring | `box-shadow` transition (`--duration-fast`) |
| Toast enter | Slide up + fade in (`--duration-normal`) |
| Toast exit | Fade out (`--duration-fast`) |

### Sidebar Collapse/Expand (Refined)

```css
.sidebar-collapse {
  transition:
    width var(--collapse-duration) var(--collapse-easing),
    opacity var(--duration-fast) var(--ease-in-out);
}

/* Content fade out before width shrinks */
.sidebar-content-exit {
  transition: opacity var(--duration-fast) var(--ease-in-out);
}

/* Icon rail fade in after width settles */
.icon-rail-enter {
  transition: opacity var(--duration-fast) var(--ease-out);
  transition-delay: calc(var(--collapse-duration) - 100ms);
}
```

### Compositor-Only Constraint

All animations MUST use only:
- `transform` (translate, scale, rotate)
- `opacity`

NO animations on:
- `width`, `height` (use `transform: scaleX/Y` or `max-height` trick)
- `top`, `left`, `right`, `bottom`
- `margin`, `padding`
- `border-width`, `border-color` (use pseudo-elements)
- `color`, `background-color` (fade opacity of colored overlay instead)

Exception: `max-height` is acceptable for collapse/expand when content dimensions are unknown, but prefer transforms where possible.

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    transition-delay: 0ms !important;
  }

  /* Skeleton shimmer disabled */
  .skeleton::after {
    animation: none;
  }

  /* Entrance animations disabled */
  .panel-enter,
  .panel-enter-active,
  .card-stagger,
  .sidebar-enter {
    opacity: 1;
    transform: none;
    animation: none;
  }
}
```

Users with `prefers-reduced-motion: reduce` see:
- Instant state changes (no transitions)
- No entrance animations (elements appear immediately)
- No skeleton shimmer (static gray placeholder)
- No hover lifts or press scales
- Focus ring still visible but without transition

---

## 8. Copy Direction

### Accessibility Announcements

| Event | Announcement (aria-live) |
|---|---|
| Page load complete | "Shipyard workbench loaded" |
| Session connected | "Session connected" |
| Session disconnected | "Session disconnected" |
| Turn started | "Agent working" |
| Turn completed | "Agent completed turn" |
| Error occurred | "Error: {message}" |
| Context sent | "Context sent to agent" |
| File saved | "File saved: {filename}" |
| Copy action | "Copied to clipboard" |

### Skip Link Text

| Link | Text |
|---|---|
| Main content | "Skip to main content" |
| Navigation | "Skip to navigation" |

### Error Messages (Accessible)

All error messages should:
- Be associated with the relevant input via `aria-describedby`
- Use plain language
- Suggest a fix when possible

Example:
- Bad: "Error 500"
- Good: "Connection failed. Check your network and try again."

---

## 9. Accessibility Requirements

### WCAG 2.2 AA Compliance Checklist

#### Perceivable

| Criterion | Requirement | Implementation |
|---|---|---|
| 1.1.1 Non-text Content | Alt text for images/icons | All icons have `aria-label` or decorative `aria-hidden` |
| 1.3.1 Info and Relationships | Programmatic structure | Semantic HTML, ARIA roles, heading hierarchy |
| 1.3.2 Meaningful Sequence | Reading order | DOM order matches visual order |
| 1.4.1 Use of Color | Color not sole indicator | Status uses color + icon + text |
| 1.4.3 Contrast (Minimum) | 4.5:1 for text | All text tokens verified against backgrounds |
| 1.4.4 Resize Text | 200% zoom | Layout remains functional at 200% |
| 1.4.10 Reflow | 320px width | Single column reflow at mobile |
| 1.4.11 Non-text Contrast | 3:1 for UI components | Focus rings, borders verified |
| 1.4.12 Text Spacing | Custom spacing | Layout tolerates 1.5x line-height, 2x letter-spacing |
| 1.4.13 Content on Hover | Dismissible, hoverable | Tooltips remain visible on hover, dismiss on Escape |

#### Operable

| Criterion | Requirement | Implementation |
|---|---|---|
| 2.1.1 Keyboard | All functionality via keyboard | Tab, Enter, Space, Arrow keys |
| 2.1.2 No Keyboard Trap | Focus escapable | FocusTrap releases on Escape, close button |
| 2.1.4 Character Key Shortcuts | Remappable or require modifier | Shortcuts use Cmd/Ctrl |
| 2.4.1 Bypass Blocks | Skip links | SkipLink component |
| 2.4.3 Focus Order | Logical sequence | DOM order matches visual flow |
| 2.4.4 Link Purpose | Clear link text | No "click here" |
| 2.4.6 Headings and Labels | Descriptive | Headings describe content |
| 2.4.7 Focus Visible | Visible focus indicator | Focus ring token |
| 2.4.11 Focus Not Obscured | Focus target visible | No sticky elements covering focus |
| 2.5.3 Label in Name | Visible label in accessible name | Button text matches `aria-label` |

#### Understandable

| Criterion | Requirement | Implementation |
|---|---|---|
| 3.1.1 Language of Page | `lang` attribute | `<html lang="en">` |
| 3.2.1 On Focus | No context change | Focus doesn't trigger navigation |
| 3.2.2 On Input | Predictable behavior | Form changes don't auto-submit |
| 3.3.1 Error Identification | Errors described | Inline error messages |
| 3.3.2 Labels or Instructions | Form inputs labeled | `<label>` or `aria-label` |

#### Robust

| Criterion | Requirement | Implementation |
|---|---|---|
| 4.1.2 Name, Role, Value | ARIA correct | Semantic HTML + ARIA attributes |
| 4.1.3 Status Messages | Announced | `aria-live` regions |

### Focus Management Rules

1. **Initial focus**: On page load, focus moves to main content area (after skip link).
2. **Modal focus**: When modal opens, focus moves to first focusable element inside.
3. **Modal close**: Focus returns to trigger element.
4. **Delete action**: After deleting item, focus moves to next item (or previous if last).
5. **Error focus**: After form error, focus moves to first invalid field.
6. **Sidebar toggle**: Focus remains on toggle button after collapse/expand.

### Keyboard Navigation Summary

| Context | Key | Action |
|---|---|---|
| Global | `Tab` | Move to next focusable element |
| Global | `Shift+Tab` | Move to previous focusable element |
| Global | `Escape` | Close modal/drawer, clear input |
| Global | `Cmd+B` | Toggle left sidebar |
| Global | `Cmd+Shift+B` | Toggle right sidebar |
| Button | `Enter` / `Space` | Activate |
| Link | `Enter` | Navigate |
| Tree | `Arrow` keys | Navigate items |
| Tree | `Enter` | Select file / toggle folder |
| Textarea | `Cmd+Enter` | Submit |
| Modal | `Escape` | Close |

### Screen Reader Testing Targets

Test with:
- VoiceOver (macOS Safari)
- NVDA (Windows Chrome)
- JAWS (Windows Chrome)

Each should correctly announce:
- Page structure (landmarks, headings)
- Dynamic content changes (status updates)
- Form labels and errors
- Interactive element states

---

## 10. Anti-Patterns to Avoid

1. **No motion on color.** Don't animate `background-color` or `color`. Use overlays with opacity.
2. **No layout thrashing.** Don't animate `width`, `height`, `margin`, `padding` directly.
3. **No infinite animations** except status pulse and skeleton shimmer. All other motion is triggered.
4. **No auto-playing video or audio.** User must initiate media.
5. **No focus traps without escape.** Every trapped region must have Escape or close button exit.
6. **No keyboard-only features.** Everything accessible via keyboard must also work with mouse.
7. **No time limits without extension.** If showing timed content, allow user control.
8. **No ARIA overuse.** Use semantic HTML first. ARIA is for filling gaps, not replacing HTML.
9. **No empty focus rings.** Every focusable element must have visible focus state.
10. **No motion that obscures content.** Entrance animations must complete before interaction is needed.

---

## 11. Responsive Breakpoint Behavior

### Motion Adjustments by Breakpoint

#### 1440px (Desktop Large)
- Full entrance orchestration with stagger
- All micro-interactions enabled
- Sidebar collapse animations smooth

#### 1024px (Desktop)
- Same as 1440px
- Slightly shorter stagger delays (reduce by 25%)

#### 768px (Tablet)
- Reduce entrance stagger (50% reduction)
- Drawer animations instead of sidebar collapse
- Touch-optimized: no hover lifts

#### 375px (Mobile)
- Minimal entrance animations (panels fade in, no translate)
- No stagger (all panels appear together)
- Drawer animations simplified
- Touch-only: no hover states

### Motion Duration Scaling

```css
/* Optional: reduce motion intensity on smaller screens */
@media (max-width: 768px) {
  :root {
    --stagger-delay: 50ms; /* Reduced from 75ms */
    --entrance-translate: 8px; /* Reduced from 12px */
  }
}

@media (max-width: 375px) {
  :root {
    --stagger-delay: 0ms;
    --entrance-translate: 0px;
    --duration-slow: 250ms; /* Snappier on mobile */
  }
}
```

### Accessibility Scaling

- Skip link remains first focusable element at all sizes
- Focus ring sizing consistent across breakpoints
- Touch targets minimum 44x44px on mobile (per WCAG 2.5.5)
- Reduced motion respected at all breakpoints

### Skeleton Adjustments

- Desktop: Full skeleton layouts with multiple zones
- Tablet: Simplified skeletons (fewer detail placeholders)
- Mobile: Single skeleton per panel (no granular zone skeletons)
