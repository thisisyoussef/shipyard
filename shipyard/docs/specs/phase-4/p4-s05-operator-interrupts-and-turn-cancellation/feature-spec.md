# Feature Spec

## Metadata
- Story ID: P4-S05
- Story Title: Operator Interrupts and Turn Cancellation
- Author: Codex
- Date: 2026-03-24
- Related PRD/phase gate: Persistent-loop operator control and browser parity

## Problem Statement

Shipyard presents itself as a persistent local agent with terminal and browser
surfaces over one shared session and runtime. That promise currently breaks when
an operator wants to stop a bad or long-running turn. The browser protocol
accepts `cancel` but returns a placeholder error instead of interrupting work,
terminal mode has no true in-turn human interrupt path, and the shared turn
executor never produces a real `cancelled` outcome. The result is a loop that
can resume after restart, but cannot be safely interrupted and continued inside
the same live session.

## Story Objectives

- Objective 1: Define one shared cancellation contract that works across
  terminal mode, browser mode, the turn executor, and both runtime paths.
- Objective 2: Let an operator interrupt an active turn and immediately issue a
  new instruction without restarting Shipyard.
- Objective 3: Make cancellation truthful in runtime state, streamed events,
  session summaries, and traces so it is not misreported as success or error.

## User Stories

- As a terminal operator, I want to stop the active turn and keep the Shipyard
  session alive for the next instruction.
- As a browser operator, I want the cancel action to stop the current run
  instead of returning a placeholder error.
- As the runtime, I want cancellation to be a first-class outcome so late tool
  or model completions do not keep mutating state after the operator has
  interrupted the turn.

## Acceptance Criteria

- [ ] AC-1: Shipyard defines one per-turn cancellation primitive that is owned
  by the active operator surface and passed through `executeInstructionTurn`
  into graph and fallback runtime execution.
- [ ] AC-2: Terminal mode supports a real human interrupt of the active turn
  without killing the Shipyard process, and the prompt returns ready for the
  next instruction in the same session.
- [ ] AC-3: Browser `cancel` requests stop the active browser-driven turn and
  end the streamed activity with `agent:done` status `cancelled` instead of a
  placeholder error.
- [ ] AC-4: The shared turn runtime distinguishes `cancelled` from `error` in
  reporter events, final turn result, rolling summary, session persistence, and
  workbench state.
- [ ] AC-5: Graph mode and fallback mode both honor cancellation at the next
  safe boundary so they stop planning, tool use, verification, and response
  streaming once the interrupt is in effect.
- [ ] AC-6: Long-running subprocess-backed work, especially `run_command`, is
  terminated or concluded as cancelled when the turn is interrupted, with
  cleanup behavior made explicit.
- [ ] AC-7: Late-arriving tool or model results after cancellation do not emit
  success output, overwrite the cancelled summary, or leave terminal/UI state
  stuck as busy.
- [ ] AC-8: Automated coverage proves at least one terminal interrupt path and
  one browser cancel path, and proves a follow-up instruction succeeds without
  restarting the session.
- [ ] AC-9: Local traces and any configured LangSmith-linked runtime reporting
  record cancellation distinctly from ordinary failures.

## Edge Cases

- Cancelling when no turn is active should be explicit and harmless.
- Repeated cancel requests should be idempotent.
- A cancellation request that arrives during a short atomic file operation may
  complete that operation, but the runtime must stop before starting new work
  and report that honestly.
- Cancelling after an edit but before final response should not convert the turn
  into a false success.
- Browser disconnect should not imply cancellation; only an explicit operator
  interrupt should stop the turn.

## Non-Functional Requirements

- Reliability: cancellation must not leave orphan subprocesses or a stuck busy
  state.
- Safety: cancellation should stop new work quickly without inventing rollback
  behavior that the runtime cannot guarantee.
- Observability: cancelled turns must be visible as cancelled in logs, traces,
  and streamed status.
- UX consistency: terminal and browser mode should follow one operator-control
  model, not divergent semantics.

## UI Requirements (if applicable)

- The browser workbench should only present cancel as active when a turn is in
  progress.
- Cancelled state should read as operator-controlled interruption, not an error
  masquerading as one.
- After cancellation, the browser should visibly return to a ready state so the
  next instruction can be submitted immediately.

## Out of Scope

- Human approval or approval-node workflows.
- Pause-and-resume from an exact mid-turn execution checkpoint.
- Remote multi-user arbitration or queueing between multiple operators.
- Automatic rollback of already-completed edits solely because a human
  interrupted the turn.

## Done Definition

- Shipyard can interrupt an active turn from terminal mode and browser mode
  without restarting the session.
- Cancellation is a first-class runtime outcome rather than a placeholder or a
  hard process stop.
- Tests cover interrupted-turn behavior plus successful follow-up work in the
  same session.
