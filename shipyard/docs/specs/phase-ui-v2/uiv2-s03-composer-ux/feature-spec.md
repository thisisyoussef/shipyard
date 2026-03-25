# Feature Spec

## Metadata
- Story ID: UIV2-S03
- Story Title: Composer and Instruction UX
- Author: Claude
- Date: 2026-03-24
- Estimated effort: 2–3 hours
- Related pack: Phase UI v2 — Complete UI Reimagination
- Depends on: UIV2-S02 (Shell and Navigation Chrome)
- Skills: emil-design-eng, animate, polish, critique

## Problem Statement

The current composer in `ShipyardWorkbench.tsx` is a basic `<textarea>` with a submit button and a separate context draft panel. It has several UX deficiencies:

1. **No auto-resize.** The textarea has a fixed height. Long instructions are hidden behind scrolling rather than the input growing to show the full text.
2. **No instruction history.** Developers frequently want to re-submit a previous instruction with slight modifications. There is no way to recall past instructions with arrow keys (the command-line standard).
3. **No visual state machine.** The composer looks the same whether the agent is idle and ready for input, actively processing, or in an error state. The developer must check the agent status badge elsewhere to know if submitting will work.
4. **Context injection is a separate panel.** The context draft textarea (`contextInputRef`) sits in a different visual area. Developers lose the connection between what they are injecting and what they are instructing.
5. **No global focus shortcut.** There is no `Cmd/Ctrl+K` to jump to the composer from anywhere in the UI.
6. **Escape does nothing.** Standard behavior in command-palette UIs (Raycast, VS Code, Linear) is that Escape clears or dismisses the input.

The props interface in `ShipyardWorkbench.tsx` already has the relevant callbacks (`onInstructionChange`, `onContextChange`, `onInstructionKeyDown`, `onSubmitInstruction`) but they are wired to a basic implementation.

## Story Objectives

- Objective 1: Extract a `ComposerPanel.tsx` component that encapsulates all instruction input, context injection, and submission behavior.
- Objective 2: Build an auto-resizing textarea that grows with content up to a configurable max-height (e.g., 240px), then scrolls.
- Objective 3: Implement instruction history with up/down arrow navigation (command-line style).
- Objective 4: Implement a visual state machine with four states: idle, composing, submitting, busy.
- Objective 5: Integrate context injection as an inline badge/chip within the composer area rather than a separate panel.
- Objective 6: Add `Cmd/Ctrl+K` global focus shortcut and `Escape` to clear input.

## User Stories

- As a developer, I want the composer to auto-resize so I can see my full instruction without scrolling.
- As a developer rerunning variations of an instruction, I want to press Up arrow to recall my last instruction.
- As a developer mid-run, I want to see at a glance that the agent is busy and my input will be queued, not lost.
- As a keyboard-first user, I want to press Cmd+K to focus the composer from anywhere in the UI.
- As a developer injecting context, I want to see the queued context right next to my instruction, not in a separate panel.

## Acceptance Criteria

- [ ] AC-1: `ComposerPanel.tsx` exists as a self-contained component extracted from ShipyardWorkbench.
- [ ] AC-2: Textarea auto-resizes from 1 line (min-height ~40px) to max-height (240px), then scrolls. Resize happens on every input event.
- [ ] AC-3: Up arrow (when cursor is at position 0 or textarea is empty) cycles backward through instruction history. Down arrow cycles forward. History stores the last 50 instructions.
- [ ] AC-4: The composer has four visual states, each with distinct appearance:
  - **idle**: Subtle border, placeholder text "Send an instruction...", cursor blinks.
  - **composing**: Border brightens to accent color, character count or hint appears.
  - **submitting**: Input briefly pulses, text fades, submit button shows spinner. Lasts until backend acknowledges.
  - **busy**: Input is visually muted, placeholder changes to "Agent is working...", submit button disabled with busy indicator. Typing is still allowed (queued).
- [ ] AC-5: Context injection appears as inline badge(s) above the textarea within the composer frame. Badge shows context source/name. Click badge to expand/edit. Click X to remove.
- [ ] AC-6: Submit button is disabled when the textarea is empty (idle state) and when the agent is busy (shows queue indicator).
- [ ] AC-7: `Escape` clears the textarea content and resets to idle state. Does not dismiss the composer itself.
- [ ] AC-8: `Cmd/Ctrl+K` focuses the composer textarea from anywhere in the UI. Does not fire when already focused.
- [ ] AC-9: `Cmd/Ctrl+Enter` submits the instruction (alternative to clicking submit).
- [ ] AC-10: Composer uses component tokens from S01 and mounts inside ShipyardShell's main area (from S02).
- [ ] AC-11: `pnpm --dir shipyard build` and `pnpm --dir shipyard typecheck` pass.

## Edge Cases

- Auto-resize must handle paste events (large paste should grow immediately, not require typing).
- History navigation when the current draft has unsaved edits: store the draft temporarily so Down arrow back to "current" restores it.
- Submitting while agent is busy should queue the instruction visually (show a "queued" badge) rather than silently failing.
- Empty instruction submission must be prevented (submit button disabled, Enter does nothing).
- Context badge overflow: if many context items are injected, the badge area should scroll horizontally or wrap, not push the textarea out of view.
- Window resize should re-trigger textarea auto-resize calculation.

## Non-Functional Requirements

- Performance: Auto-resize must not cause visible layout thrash. Use `requestAnimationFrame` or `scrollHeight` measurement in a microtask.
- Accessibility: Textarea must have a visible label or `aria-label`. State changes must be announced via `aria-live` region. Submit button must have loading state communicated to screen readers.
- Responsiveness: At 375px width, the composer should span full width with touch-friendly submit button (44px minimum tap target).

## UI Requirements

- Composer container: surface-card background, 1px border (border-subtle in idle, border-strong/accent in composing), rounded radius-lg.
- Textarea: transparent background, no visible border (border is on the container), font-body at text-base size.
- Submit button: right-aligned, accent-strong background in idle/composing, muted in busy. Icon: arrow-up or send icon.
- State transitions: 150ms ease-out for border color change, 200ms for submit button state change.
- Context badges: inline above textarea, accent-soft background, small text, X button for removal.

## Out of Scope

- Slash commands or autocomplete in the composer (potential future story).
- Rich text or markdown formatting in the instruction input.
- File attachment drag-and-drop into the composer.
- Voice input.

## Done Definition

- ComposerPanel.tsx is a clean, self-contained component.
- Auto-resize, history, state machine, and keyboard shortcuts all work as specified.
- Context injection is integrated inline.
- `emil-design-eng`, `animate`, and `polish` skills report satisfactory quality.
- Build, typecheck, and tests pass.
