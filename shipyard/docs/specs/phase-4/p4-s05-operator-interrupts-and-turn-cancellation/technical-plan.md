# Technical Plan

## Metadata
- Story ID: P4-S05
- Story Title: Operator Interrupts and Turn Cancellation
- Author: Codex
- Date: 2026-03-24

## Proposed Design
- Components/modules affected:
  - `shipyard/src/engine/turn.ts` for turn-scoped cancellation context,
    reporter outcome handling, and persisted turn summaries
  - `shipyard/src/engine/graph.ts` and `shipyard/src/engine/raw-loop.ts` for
    cancellation-aware routing and safe-boundary exits
  - `shipyard/src/engine/loop.ts` and `shipyard/src/bin/shipyard.ts` for
    terminal interrupt handling and prompt recovery
  - `shipyard/src/ui/server.ts`, `shipyard/src/ui/contracts.ts`, and
    `shipyard/src/ui/workbench-state.ts` for real browser cancel behavior and
    truthful ready/busy/cancelled state transitions
  - `shipyard/src/tools/run-command.ts` and any long-running tool helpers for
    subprocess termination support
  - `shipyard/tests/` for terminal, browser, runtime, and tool cancellation
    coverage
- Public interfaces/contracts:
  - one active-turn cancellation handle owned by the current operator surface
  - a shared turn/runtime contract that can emit `cancelled`
  - browser `cancel` semantics that target the active turn instead of returning
    a placeholder error
  - terminal interrupt semantics that cancel the active turn without ending the
    Shipyard session
- Data flow summary: the operator requests cancellation from terminal or
  browser; the active surface resolves the turn-scoped controller; the shared
  runtime propagates the interrupt through model, tool, and subprocess work; the
  runtime exits at the next safe boundary; the reporter emits a cancelled
  outcome; the operator surface clears the active turn and returns to ready.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - stateful execution engine
  - reversible editing and bounded recovery
  - real CLI wiring and trace capture
  - truthful operator control over a live turn
- Story ordering rationale: this story should build on the existing runtime,
  recovery, and trace plumbing so it can complete the shared operator-control
  contract rather than inventing a parallel path.
- Gaps/overlap check: this story owns interrupt semantics and cancelled-state
  propagation; it should not redefine the underlying tool registry, checkpoint
  format, or browser transport contract.
- Whole-pack success signal: Shipyard can now plan, act, verify, recover, and
  be interrupted by a human without losing the session.

## Architecture Decisions
- Decision: use one per-turn `AbortController` or equivalent cancellation
  primitive as the shared interrupt mechanism across terminal mode, browser
  mode, runtime execution, model calls, and subprocess tools.
- Alternatives considered:
  - kill and resume the entire process
  - UI-only cancel with no terminal equivalent
  - a queued terminal text command for cancellation
- Rationale: a shared turn-scoped controller is the smallest design that keeps
  both operator surfaces behaviorally aligned.

- Decision: terminal human interrupt during an active turn should map to turn
  cancellation rather than process exit, while `exit` and `quit` remain the
  explicit session shutdown path.
- Alternatives considered:
  - keep `Ctrl+C` as a hard exit even during active work
  - add a typed `cancel` command only
- Rationale: the terminal loop cannot rely on line-oriented input while blocked
  inside a running turn, but an interrupt signal is immediate and conventional.

- Decision: cancellation stops new work and abortable long-running work, but
  does not promise retroactive rollback of already-completed atomic edits.
- Alternatives considered:
  - always restore checkpoints on cancellation
  - treat cancellation as a recover-and-retry flow
- Rationale: automatic rollback would blur operator intent with verification
  logic and can destroy useful partial work. The runtime should instead report
  exactly what was interrupted and what, if anything, already landed.

## Data Model / API Contracts
- Request shape:
  - browser `cancel` request for the active session turn
  - terminal active-turn interrupt request
- Response shape:
  - `agent:done` with `status: "cancelled"` for browser mode
  - terminal final text that reports the turn as cancelled rather than failed
  - turn/state summaries that preserve cancelled as a separate outcome
- Storage/index changes:
  - active turn cancellation handle stays in memory
  - persisted rolling summary and trace events should record cancelled turns
    distinctly from errors

## Dependency Plan
- Existing dependencies used: Node `AbortController`, current Anthropic and
  LangGraph/LangSmith wiring, current subprocess tool implementation, current UI
  transport/state modules.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: a late model or tool completion leaks output after cancellation.
  - Mitigation: gate reporter emissions behind active-turn cancellation checks
    and ignore stale completions.
  - Risk: subprocesses survive the cancelled turn.
  - Mitigation: wire the turn-scoped signal into `run_command` and assert child
    termination in tests.
  - Risk: cancelling after an edit leaves the operator confused about file
    state.
  - Mitigation: make the final cancelled summary explicit about any completed
    edit before interruption.

## Test Strategy
- Unit tests:
  - cancelled reporter path is distinct from success and error
  - graph/fallback routing exits on cancellation at safe boundaries
  - stale post-cancel emissions are ignored
  - subprocess cancellation produces a stable cancelled result
- Integration tests:
  - terminal active turn is interrupted and the prompt returns without process
    restart
  - browser cancel stops an active instruction and allows the next instruction
    in the same session
  - a cancelled turn does not leave workbench state stuck in `agent-busy`
- E2E or smoke tests:
  - one terminal interrupt against a deliberately long-running instruction
  - one browser cancel against the same class of long-running turn
- Edge-case coverage mapping:
  - cancel when idle
  - repeated cancel requests
  - cancel during `run_command`
  - cancel after one edit but before final response

## UI Implementation Plan (if applicable)
- Behavior logic modules:
  - the socket server owns the active turn handle and routes `cancel`
  - workbench state distinguishes operator cancellation from runtime failure
- Component structure:
  - existing cancel affordances should only be active while a turn is running
- Accessibility implementation plan:
  - busy and cancelled status text should stay screen-readable and explicit
- Visual regression capture plan:
  - ready -> busy -> cancelled -> ready transition should be captured if UI
    visual coverage exists for the workbench

## Rollout and Risk Mitigation
- Rollback strategy: keep the shared cancellation handle narrow so the change
  can be backed out without undoing the broader graph/runtime contract if
  needed.
- Feature flags/toggles: not required unless aborting the model client proves
  unstable; the fallback should still honor cancellation at safe boundaries.
- Observability checks: record cancelled turns in the local trace log and verify
  browser activity ends with `cancelled`, not `error`.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
