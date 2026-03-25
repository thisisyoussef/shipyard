# UIV3-S04: Composer UX — Design Brief

Story: UIV3-S04
Phase: Design
Last updated: 2026-03-24

---

## 1. Visual Direction and Mood

The composer is the command surface — the user's voice into the system. It should feel like a premium text editor embedded in the workbench: precise, responsive, and quietly powerful. The visual language borrows from command palettes (VS Code, Linear, Raycast) — a single focused input with supporting context badges and state indicators that fade when not needed.

Key mood words translated to implementation:
- **Focused** — single dominant textarea, minimal chrome, suppressed secondary actions when idle
- **Responsive** — immediate visual feedback on keystroke, smooth height transitions, instant state changes
- **Precise** — sharp input border on focus, clear state indicators, unambiguous affordances
- **Warm** — amber accent for active/submitting states, soft glow on focus, approachable placeholder copy

The composer must never feel like a form — it should feel like a conversation prompt with intelligent assistance.

---

## 2. Component Inventory

### New Components

| Component | File | Purpose |
|---|---|---|
| `ComposerShell` | `src/composer/ComposerShell.tsx` | Container managing visual state machine |
| `ComposerTextarea` | `src/composer/ComposerTextarea.tsx` | Auto-resize textarea with focus management |
| `ComposerContextBadges` | `src/composer/ComposerContextBadges.tsx` | Attached context preview chips |
| `ComposerNotice` | `src/composer/ComposerNotice.tsx` | Feedback banner (success/error/info) |
| `ComposerActions` | `src/composer/ComposerActions.tsx` | Submit button + keyboard hint |

### Modified Components

| Component | Change |
|---|---|
| `ComposerPanel.tsx` | Refactor to compose new sub-components; extract hooks to dedicated file |
| `ShipyardWorkbench.tsx` | Register Cmd+K global shortcut for composer focus |

### Hooks (extracted to `src/composer/hooks.ts`)

| Hook | Purpose |
|---|---|
| `useAutoResize` | Measures scrollHeight, clamps to min/max, adjusts textarea height |
| `useInstructionHistory` | Stores last 20 instructions, navigates with up/down arrows |
| `useComposerState` | Derives visual state from connection + input + submission status |
| `useGlobalComposerFocus` | Registers Cmd+K listener, returns focus function |

### CSS Files

| File | Purpose |
|---|---|
| `src/composer/composer.css` | All composer-specific styles (replaces styles in styles.css) |

---

## 3. Token Selections

### From S01 Primitives (used directly)

- `--surface-inset` — textarea background (recessed feel)
- `--surface-card` — composer shell background
- `--border-subtle` — textarea idle border
- `--border-medium` — textarea hover border
- `--accent-strong` — textarea focus border, submit button
- `--accent-glow` — focus ring glow
- `--text-strong` — input text
- `--text-muted` — placeholder text
- `--text-faint` — keyboard hint
- `--font-body` — input text
- `--font-mono` — context badge labels
- `--space-3` through `--space-6` — internal gaps and padding
- `--radius-lg` — textarea corners
- `--radius-full` — context badges, submit button
- `--elevation-1` — context badge subtle lift

### From S01 Motion

- `--duration-fast` (100ms) — height transition, state changes
- `--duration-normal` (200ms) — focus ring appearance
- `--ease-out` — all transitions

### New Tokens (added to `components.css`)

| Token | Value | Purpose |
|---|---|---|
| `--composer-min-h` | `56px` | Minimum textarea height (2 lines) |
| `--composer-max-h` | `240px` | Maximum textarea height before scroll |
| `--composer-padding` | `var(--space-4)` | Internal textarea padding |
| `--composer-focus-glow` | `0 0 0 3px var(--accent-glow)` | Focus ring outer glow |
| `--composer-notice-padding` | `var(--space-3) var(--space-4)` | Notice banner padding |

---

## 4. Layout Decisions

### Composer Shell Structure

```
+-------------------------------------------------------+
| [Notice banner - conditional]                          |
+-------------------------------------------------------+
| +---------------------------------------------------+ |
| | Textarea (auto-resize 56px - 240px)                | |
| |                                                     | |
| | [Context badge] [Context badge] ...                | |
| +---------------------------------------------------+ |
+-------------------------------------------------------+
| [Submit button]                      [Keyboard hint]  |
+-------------------------------------------------------+
```

### Textarea Behavior

- **Min height**: 56px (accommodates 2 lines of text at `--text-base`)
- **Max height**: 240px (approximately 8-10 lines before scrolling)
- **Resize**: Automatic based on content, animated at 100ms
- **Overflow**: Hidden until content exceeds max height, then `overflow-y: auto`
- **Padding**: 16px all sides (`--space-4`)

### Context Badges Position

- Positioned inside the textarea container, bottom-left corner
- 8px (`--space-2`) gap from textarea edge
- Horizontal row with 6px (`--space-1-5`) gap between badges
- Badges use `position: absolute` to overlay the textarea, with textarea padding-bottom adjusted to accommodate

### Submit Row Layout

- Flex row with `justify-content: space-between`
- Submit button left-aligned (primary action should be left in LTR layouts for consistency with reading flow)
- Keyboard hint right-aligned, `--text-muted` color
- 12px (`--space-3`) gap from textarea above

---

## 5. Typography Decisions

### Textarea Input

- Font: `--font-body` (IBM Plex Sans)
- Size: `--text-base` (1.2rem / ~17px)
- Weight: `--weight-normal` (400)
- Line height: `--leading-relaxed` (1.6)
- Color: `--text-strong` (input text), `--text-muted` (placeholder)
- Letter spacing: `--tracking-normal`

### Context Badges

- Font: `--font-mono` (IBM Plex Mono)
- Size: `--text-xs` (0.833rem / ~12px)
- Weight: `--weight-medium` (500)
- Color: `--text-default`
- Text transform: none (preserve file paths as-is)

### Submit Button

- Font: `--font-body`
- Size: `--text-sm` (1rem / ~14px)
- Weight: `--weight-bold` (700)
- Color: `--text-inverse` (dark on amber)
- Text transform: none

### Keyboard Hint

- Font: `--font-mono`
- Size: `--text-xs`
- Weight: `--weight-normal`
- Color: `--text-faint`

### Notice Banner

- Title: `--font-body`, `--text-sm`, `--weight-semibold`
- Body: `--font-body`, `--text-sm`, `--weight-normal`
- Color: semantic based on tone (`--success-strong`, `--danger-strong`, etc.)

---

## 6. Color Decisions

### Visual State Machine Colors

| State | Border | Background | Glow |
|---|---|---|---|
| `idle` | `--border-subtle` | `--surface-inset` | none |
| `drafting` | `--border-medium` | `--surface-inset` | none |
| `submitting` | `--accent-strong` | `--surface-inset` | `--composer-focus-glow` |
| `submitted` | `--success-strong` (brief flash) | `--surface-inset` | none |

### Focus State

- Border transitions from `--border-subtle` to `--accent-strong`
- Focus glow: `0 0 0 3px var(--accent-glow)` (amber at 30% opacity)
- Inner shadow maintained: `var(--shadow-inner)`

### Context Badges

- Background: `--surface-muted`
- Border: `--border-subtle`
- Text: `--text-default`
- Dismiss button: `--text-muted` default, `--danger-strong` on hover

### Notice Banner Tones

| Tone | Background | Border | Text |
|---|---|---|---|
| `success` | `--success-soft` | `--border-success` | `--success-strong` |
| `danger` | `--danger-soft` | `--border-danger` | `--danger-strong` |
| `warning` | `--warning-soft` | `--border-warning` | `--warning-strong` |
| `accent` | `--accent-soft` | `--accent-border` | `--accent-strong` |

---

## 7. Motion Plan

### Textarea Auto-Resize

- Property: `height`
- Duration: `--duration-fast` (100ms)
- Easing: `--ease-out`
- Trigger: on every keystroke via `useAutoResize` hook
- Note: use `requestAnimationFrame` to batch multiple keystrokes

### Focus Ring Appearance

- Properties: `border-color`, `box-shadow`
- Duration: `--duration-normal` (200ms)
- Easing: `--ease-out`
- The glow fades in smoothly, not abruptly

### State Transitions

| Transition | Duration | Easing |
|---|---|---|
| idle → drafting | `--duration-fast` | `--ease-out` |
| drafting → submitting | `--duration-fast` | `--ease-out` |
| submitting → submitted | `--duration-fast` | `--ease-out` |
| submitted → idle | `--duration-normal` | `--ease-out` |

### Submit Button

- Active (pressed): `transform: scale(0.97)` at `--duration-fast`
- Loading: subtle pulse animation on background gradient
- Success flash: brief green border flash at 200ms, then reset

### Notice Banner Enter/Exit

- Enter: `translateY(-8px)` → `translateY(0)` + opacity 0 → 1 at `--duration-normal`
- Exit: opacity 1 → 0 at `--duration-fast`

### Cmd+K Focus

- When triggered, textarea receives focus with no additional animation
- If composer is scrolled out of view, smooth scroll to composer first (native `scrollIntoView({ behavior: 'smooth' })`)

### Instruction History Navigation

- No visual animation on up/down — instant text replacement
- Cursor moves to end of text after history navigation

### Reduced Motion

All transitions collapse to 0ms. Height changes are instant. Focus ring appears without fade.

---

## 8. Copy Direction

### Placeholder Text

Idle state:
> "Ask Shipyard to inspect a file, explain the current diff, or map the next change."

This placeholder:
- Gives concrete action examples
- Establishes the conversational nature
- Is long enough to fill the textarea width without looking sparse

### Keyboard Hint

> "Cmd+Enter to send / Up/Down for history"

Short, scannable, mono-spaced. No period at end.

### Submit Button Labels

| State | Label |
|---|---|
| idle / drafting | "Run instruction" |
| submitting | "Sending..." |
| busy (agent working) | "Working..." |

### Notice Messages

| Scenario | Title | Detail |
|---|---|---|
| Success | "Instruction sent" | "The agent is processing your request." |
| Error | "Failed to send" | "Check your connection and try again." |
| Context queued | "Context attached" | "1 file will be included with your next instruction." |

Tone: terse, technical, no emoji. Notices are transient feedback, not conversational.

### Accessibility Labels

- Textarea: `aria-label="Instruction input"` if no visible label
- Submit button: `aria-label` matches visible text
- Context badges: each badge has `aria-label="Attached context: [filename]"`
- Dismiss button on badge: `aria-label="Remove [filename] from context"`

---

## 9. Accessibility Requirements

### Keyboard Navigation

| Key | Action |
|---|---|
| `Cmd+K` / `Ctrl+K` | Focus composer textarea from anywhere |
| `Cmd+Enter` / `Ctrl+Enter` | Submit instruction |
| `Up Arrow` | Previous instruction from history (when cursor at start) |
| `Down Arrow` | Next instruction from history (when cursor at start) |
| `Escape` | Blur textarea (optional, clear draft warning first) |
| `Tab` | Move focus to submit button |
| `Shift+Tab` | Move focus back to textarea or previous element |

### Focus Order

1. Textarea (first focusable in composer)
2. Context badge dismiss buttons (if badges present)
3. Submit button

### ARIA Roles and States

| Element | Role / Attribute |
|---|---|
| Composer shell | `role="form"` |
| Textarea | `role="textbox"`, `aria-multiline="true"`, `aria-keyshortcuts="Control+Enter Meta+Enter"` |
| Submit button | `type="submit"`, `aria-disabled` when agent busy |
| Notice banner | `role="alert"` for errors, `role="status"` for success/info |
| Context badges container | `role="list"`, `aria-label="Attached context"` |
| Each context badge | `role="listitem"` |

### Contrast Requirements

- Input text (`--text-strong`) on `--surface-inset`: >7:1 contrast ratio
- Placeholder text (`--text-muted`) on `--surface-inset`: >4.5:1 contrast ratio
- Submit button text (`--text-inverse`) on amber gradient: >4.5:1 contrast ratio

### Screen Reader Announcements

- On successful submission: announce "Instruction sent" via `aria-live="polite"` region
- On error: announce error message via `aria-live="assertive"` region
- On history navigation: no announcement (text change is perceived naturally)

---

## 10. Anti-Patterns to Avoid

1. **No fixed textarea height.** Always use auto-resize within min/max bounds.
2. **No browser default resize handle.** Set `resize: none` on textarea.
3. **No submit on plain Enter.** Enter inserts newline; only Cmd/Ctrl+Enter submits.
4. **No history navigation when cursor is mid-text.** Only trigger history on Up when cursor is at position 0.
5. **No visual state without semantic state.** Every border/glow change must reflect an actual state change.
6. **No blocking the UI during submission.** Textarea remains editable for next instruction while agent is busy.
7. **No context badges outside the composer.** Badges are visually attached to the textarea, not floating.
8. **No animated placeholder text.** Placeholder is static.
9. **No submit button position change based on content.** Button stays in fixed position in submit row.
10. **No raw keyboard codes in UI copy.** Use "Cmd" not "Command", "Ctrl" not "Control".

---

## 11. Responsive Breakpoint Behavior

### 1440px (Desktop Large)

- Composer at full width within main content area
- Textarea min-height 56px, max-height 240px
- Context badges in single row, horizontally scrollable if overflow

### 1024px (Tablet Large)

- No change from desktop

### 768px (Tablet)

- Textarea max-height reduced to 180px (less screen real estate)
- Context badges wrap to second row if needed
- Submit button and keyboard hint stack vertically

### 375px (Mobile)

- Textarea max-height reduced to 120px
- Keyboard hint hidden (touch devices don't need Cmd+K hint)
- Submit button full width
- Context badges scroll horizontally with visible overflow indicator

### Breakpoint Implementation

```css
@media (max-width: 768px) {
  .composer-textarea {
    max-height: 180px;
  }

  .composer-actions {
    flex-direction: column;
    gap: var(--space-2);
  }

  .composer-keyboard-hint {
    order: -1;
    align-self: flex-start;
  }
}

@media (max-width: 375px) {
  .composer-textarea {
    max-height: 120px;
  }

  .composer-keyboard-hint {
    display: none;
  }

  .composer-submit {
    width: 100%;
  }
}
```

---

## Critique Checklist

| Dimension | Score | Notes |
|---|---|---|
| Visual hierarchy | 8/10 | Textarea dominates, secondary elements recede |
| Information architecture | 8/10 | Clear single-purpose component |
| Emotional resonance | 7/10 | Warm but professional, could add more delight |
| Discoverability | 7/10 | Cmd+K needs onboarding; keyboard hint helps |
| Composition | 8/10 | Clean layout, context badges well-placed |
| Typography | 8/10 | Appropriate scale, good mono/body contrast |
| Color | 8/10 | Semantic states clear, amber accent consistent |
| States | 9/10 | Full state machine coverage |
| Microcopy | 8/10 | Actionable placeholder, terse labels |

Average: 7.9/10 — Meets quality bar.

---

## Implementation Notes

1. **Cmd+K registration**: Use `useEffect` in `ShipyardWorkbench` to register global listener. Check `event.metaKey` (Mac) and `event.ctrlKey` (Windows). Prevent default browser behavior.

2. **History cursor logic**: Only trigger history navigation when `selectionStart === 0` and arrow key is pressed. This prevents hijacking normal cursor movement.

3. **Auto-resize timing**: Debounce is not needed — `scrollHeight` measurement is fast. Use `requestAnimationFrame` only if multiple keystrokes in same frame cause jank.

4. **Context badge truncation**: File paths longer than 24 characters should truncate with ellipsis in the middle (e.g., `src/comp...el.tsx`) to preserve both start and extension.

5. **Submission flow**: On submit, immediately show "submitting" state, push instruction to history, clear textarea, show notice briefly (2s), then return to idle. Do not wait for agent response to clear textarea.
