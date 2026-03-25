# Technical Plan

## Metadata
- Story ID: UIV2-S03
- Story Title: Composer and Instruction UX
- Author: Claude
- Date: 2026-03-24

## Proposed Design

- Components/modules affected:
  - `shipyard/ui/src/ComposerPanel.tsx` — new component
  - `shipyard/ui/src/hooks/useAutoResize.ts` — new hook for textarea auto-resize
  - `shipyard/ui/src/hooks/useInstructionHistory.ts` — new hook for history navigation
  - `shipyard/ui/src/ShipyardWorkbench.tsx` — composer code extracted, replaced with `<ComposerPanel />`
  - `shipyard/ui/src/App.tsx` — may own instruction history state; passes composer state props
  - `shipyard/ui/src/styles.css` — composer styles extracted/rewritten
  - `shipyard/ui/src/tokens/components.css` — composer/input component tokens (from S01)

- Public interfaces/contracts:
  ```typescript
  type ComposerState = 'idle' | 'composing' | 'submitting' | 'busy';

  interface ComposerPanelProps {
    state: ComposerState;
    instruction: string;
    contextItems: Array<{ id: string; label: string; preview: string }>;
    instructionInputRef: RefObject<HTMLTextAreaElement | null>;
    onInstructionChange: (value: string) => void;
    onSubmitInstruction: (event: FormEvent) => void;
    onContextRemove: (id: string) => void;
    onContextExpand: (id: string) => void;
    composerNotice: ComposerNotice | null;
  }
  ```

- Data flow summary:
  - `App.tsx` derives `ComposerState` from `agentStatus` and submission state.
  - `ComposerPanel` manages its own internal concerns (auto-resize, history navigation) via hooks.
  - Instruction history is stored in a `useRef`-backed array (not in React state to avoid re-renders on history push).
  - Submit dispatches to `App.tsx` via `onSubmitInstruction`, which sends the WebSocket message.

## Pack Cohesion and Sequencing

- Higher-level pack objectives: Make instruction input feel like a premium command palette, not a basic form.
- Story ordering rationale: S03 depends on S02 for the shell's main content slot. S03 is independent of S04 (activity feed) and can be built in parallel once S02 is complete.
- Whole-pack success signal: The composer feels responsive, communicates agent state clearly, and supports keyboard-first workflows.

## Architecture Decisions

- **Decision**: Extract auto-resize and history as custom hooks rather than embedding logic in the component.
  - Rationale: Hooks are testable in isolation and reusable. `useAutoResize` can be unit-tested with a mock textarea element. `useInstructionHistory` can be tested with synthetic input sequences.

- **Decision**: Composer state (`idle` | `composing` | `submitting` | `busy`) is derived in App.tsx, not managed by the ComposerPanel.
  - Rationale: The state depends on WebSocket messages (agent status) which App.tsx already handles. ComposerPanel is a controlled component that receives its state as a prop.

- **Decision**: Instruction history stored in a ref-backed circular buffer, not in localStorage.
  - Rationale: History is session-scoped. Persisting across sessions risks sending stale instructions. 50 items max keeps memory bounded. No serialization overhead.

- **Decision**: Auto-resize uses `scrollHeight` measurement on a hidden "shadow" element rather than directly measuring the textarea.
  - Rationale: Directly setting textarea height and reading scrollHeight causes layout thrash. A hidden shadow element with the same styling can be measured without affecting visible layout.

- **Decision**: Context injection rendered as inline badges above textarea, not as a collapsible panel.
  - Rationale: The current separate context panel creates a disconnected experience. Inline badges keep context visible in the same frame as the instruction being composed.

## Component Anatomy

```
┌─ ComposerPanel container (surface-card) ──────────────┐
│ ┌─ Context badges (horizontal scroll) ──────────────┐ │
│ │ [CLAUDE.md ×] [session.json ×] [+ Add context]    │ │
│ └────────────────────────────────────────────────────┘ │
│ ┌─ Textarea (auto-resize) ──────────────────────────┐ │
│ │ Send an instruction...                             │ │
│ │                                                    │ │
│ └────────────────────────────────────────────────────┘ │
│ ┌─ Footer bar ──────────────────────────────────────┐ │
│ │ [notice area]                          [⌘K] [Send]│ │
│ └────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

### State Visual Mapping
| State | Border | Placeholder | Submit Button | Extra |
|---|---|---|---|---|
| idle | border-subtle | "Send an instruction..." | disabled, muted | — |
| composing | border-strong (accent) | — | enabled, accent | char hint |
| submitting | border-strong (accent) | — | spinner | pulse animation |
| busy | border-subtle | "Agent is working..." | disabled, busy icon | queue badge |

## Hooks Design

### useAutoResize(ref, maxHeight)
- On every `input` and `paste` event, measure shadow element's `scrollHeight`.
- Set textarea `style.height` to `Math.min(scrollHeight, maxHeight)`.
- On window resize, recalculate.
- Returns `{ resetHeight }` for clearing.

### useInstructionHistory(maxItems = 50)
- Internal: `historyRef` (string[]), `indexRef` (number), `draftRef` (string).
- `push(instruction)`: Add to history, reset index to end.
- `navigateUp(currentValue)`: If at end, save `currentValue` as draft. Move index back. Return history[index].
- `navigateDown()`: Move index forward. If at end, return draft. Return history[index].
- Returns `{ push, navigateUp, navigateDown }`.

## Dependency Plan

- Existing dependencies used: React hooks (useState, useEffect, useRef, useCallback), DOM APIs (scrollHeight, requestAnimationFrame).
- New dependencies proposed: None.
- Risk and mitigation:
  - Risk: Auto-resize causes visible flicker on fast typing.
    Mitigation: Debounce measurement to `requestAnimationFrame` granularity. Use `will-change: height` on the textarea.
  - Risk: History navigation interferes with normal cursor movement in multi-line input.
    Mitigation: Only activate Up history when cursor is at position 0 (start of textarea) or textarea is empty. Only activate Down history when cursor is at the end.

## Test Strategy

- Unit tests:
  - `useAutoResize`: Mock textarea with controlled scrollHeight, verify height is set correctly. Verify max-height capping. Verify reset.
  - `useInstructionHistory`: Push items, navigate up/down, verify correct values returned. Verify draft preservation. Verify circular buffer at capacity.
  - `ComposerPanel`: Render in each of the four states, verify correct CSS classes/attributes applied. Verify submit button disabled states. Verify context badges render.
- Integration tests:
  - Typing in textarea triggers auto-resize.
  - Up arrow in empty textarea recalls last instruction.
  - Submit dispatches onSubmitInstruction callback.
  - Escape clears textarea.
  - Cmd+K focuses textarea.
- Skill-based validation:
  - Run `emil-design-eng` skill for design quality.
  - Run `animate` skill for state transition quality.
  - Run `polish` skill for micro-interaction refinement.

## Rollout and Risk Mitigation

- Rollback strategy: ComposerPanel is a new component. ShipyardWorkbench's old composer code can be restored by removing the ComposerPanel import and re-inlining the textarea.
- Observability checks: Composer state is derived from agentStatus which is already visible in the header. State transitions can be logged in development mode.
- Maintenance note: New composer features (slash commands, autocomplete) should be added as sub-components or hooks within ComposerPanel, not by re-expanding ShipyardWorkbench.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
