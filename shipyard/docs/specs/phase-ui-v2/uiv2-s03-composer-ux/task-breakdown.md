# Task Breakdown

## Story
- Story ID: UIV2-S03
- Story Title: Composer and Instruction UX

## Execution Notes
- Extract the component first with identical behavior, then layer on new features (auto-resize, history, state machine).
- Test keyboard shortcuts against the guard conditions (no firing in textareas outside the composer).
- The `Cmd/Ctrl+K` shortcut should be registered at the document level in App.tsx, similar to the sidebar shortcuts from S02.
- Auto-resize hook should be written and unit-tested before integrating into ComposerPanel.
- History hook should be written and unit-tested before integrating into ComposerPanel.

## Tasks

| Task ID | Description | Dependency | Parallelizable | Validation |
|---|---|---|---|---|
| T001 | Extract `ComposerPanel.tsx` from `ShipyardWorkbench.tsx`. Move the existing textarea, submit button, context draft area, and composer notice into the new component. Wire props from ShipyardWorkbench/App. Verify existing behavior is identical. | none | no | `pnpm --dir shipyard build`, existing submit flow works |
| T002 | Build `useAutoResize` hook. Accepts textarea ref and max-height. Measures shadow element scrollHeight on input/paste events. Sets textarea height via inline style. Caps at max-height. Provides `resetHeight()` method. Write unit tests. | none | yes | Unit tests pass, `pnpm --dir shipyard test` |
| T003 | Build `useInstructionHistory` hook. Stores up to 50 instructions in a ref-backed array. `push()` adds new entry. `navigateUp(currentValue)` saves draft and moves index back. `navigateDown()` moves forward, returns draft at end. Write unit tests. | none | yes | Unit tests pass, `pnpm --dir shipyard test` |
| T004 | Implement visual state machine in ComposerPanel. Define `ComposerState` type (`idle` | `composing` | `submitting` | `busy`). Derive state in App.tsx from agent status and submission flow. Apply `data-state` attribute on composer container. Style each state per the spec (border color, placeholder, button state). Add transition animations (150ms border, 200ms button). | blocked-by:T001 | no | `pnpm --dir shipyard build`, visual check in all 4 states |
| T005 | Integrate `useAutoResize` into ComposerPanel textarea. Set min-height to 40px, max-height to 240px. Verify auto-resize on typing, pasting, and window resize. Verify reset on submit/escape. | blocked-by:T001,T002 | no | `pnpm --dir shipyard build`, visual check |
| T006 | Integrate `useInstructionHistory` into ComposerPanel. Wire `onKeyDown` handler for Up/Down arrows with cursor position guards (Up only at position 0 or empty, Down only at end). Push to history on successful submit. | blocked-by:T001,T003 | no | `pnpm --dir shipyard build`, history navigation works |
| T007 | Integrate context injection as inline badges above the textarea. Replace the separate context draft textarea with a badge row. Each badge shows context label, preview on hover/click, X button to remove. Horizontal scroll if overflow. Wire `onContextRemove` and `onContextExpand` callbacks. | blocked-by:T001 | no | `pnpm --dir shipyard build`, context badges render |
| T008 | Add keyboard shortcuts. Register `Cmd/Ctrl+K` at document level to focus composer textarea. Implement `Escape` in composer's `onKeyDown` to clear input and reset to idle. Implement `Cmd/Ctrl+Enter` in composer's `onKeyDown` to submit. | blocked-by:T001 | yes | Keyboard shortcuts work correctly |
| T009 | Style the ComposerPanel using S01 component tokens. Apply surface-card background, border transitions, accent colors, badge styling, submit button variants. Ensure responsive behavior at 375px (full-width, 44px tap targets). | blocked-by:T004,T005,T007 | no | `pnpm --dir shipyard build`, visual check |
| T010 | Run `emil-design-eng`, `animate`, and `polish` skills on the completed composer. Address any findings. | blocked-by:T009 | no | Skill output review |

## TDD Mapping

- T001 tests:
  - [ ] ComposerPanel renders textarea and submit button
  - [ ] onSubmitInstruction fires on form submit
  - [ ] Composer notice renders when provided
- T002 tests:
  - [ ] Textarea height grows with content up to max-height
  - [ ] Height does not exceed max-height (scrolls instead)
  - [ ] resetHeight() returns textarea to min-height
  - [ ] Paste event triggers resize
- T003 tests:
  - [ ] navigateUp returns previous instruction
  - [ ] navigateDown returns next instruction or draft
  - [ ] Draft is preserved during navigation
  - [ ] History caps at 50 items (oldest dropped)
- T004 tests:
  - [ ] Composer renders with data-state="idle" when state is idle
  - [ ] Submit button is disabled in idle and busy states
  - [ ] Placeholder text changes per state
- T005 tests:
  - [ ] Textarea grows when text is typed
  - [ ] Textarea shrinks when text is deleted
  - [ ] Textarea resets height on submit
- T006 tests:
  - [ ] Up arrow at position 0 recalls previous instruction
  - [ ] Down arrow restores current draft
  - [ ] Up arrow in middle of text does nothing (normal cursor behavior)
- T007 tests:
  - [ ] Context badges render for each context item
  - [ ] Clicking X on badge fires onContextRemove
  - [ ] Badge overflow scrolls horizontally
- T008 tests:
  - [ ] Cmd+K focuses textarea from outside
  - [ ] Escape clears textarea content
  - [ ] Cmd+Enter submits instruction
- T009 tests:
  - [ ] Composer uses component token CSS variables
  - [ ] At 375px width, composer is full-width with 44px submit button

## Completion Criteria

- [ ] All acceptance criteria from feature-spec.md verified
- [ ] ComposerPanel.tsx is self-contained with no layout concerns
- [ ] Auto-resize, history, and state machine work correctly
- [ ] Keyboard shortcuts functional without conflicts
- [ ] Context injection is inline within the composer frame
- [ ] Build, typecheck, and tests pass
- [ ] Skills report satisfactory quality
