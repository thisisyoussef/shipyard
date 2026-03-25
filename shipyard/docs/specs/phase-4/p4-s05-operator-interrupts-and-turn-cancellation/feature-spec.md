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

- [x] AC-1: Shipyard defines one per-turn cancellation primitive that is owned
  by the active operator surface and passed through `executeInstructionTurn`
  into graph and fallback runtime execution.
- [x] AC-2: Terminal mode supports a real human interrupt of the active turn
  without killing the Shipyard process, and the prompt returns ready for the
  next instruction in the same session.
- [x] AC-3: Browser `cancel` requests stop the active browser-driven turn and
  end the streamed activity with `agent:done` status `cancelled` instead of a
  placeholder error.
- [x] AC-4: The shared turn runtime distinguishes `cancelled` from `error` in
  reporter events, final turn result, rolling summary, session persistence, and
  workbench state.
- [x] AC-5: Graph mode and fallback mode both honor cancellation at the next
  safe boundary so they stop planning, tool use, verification, and response
  streaming once the interrupt is in effect.
- [x] AC-6: Long-running subprocess-backed work, especially `run_command`, is
  terminated or concluded as cancelled when the turn is interrupted, with
  cleanup behavior made explicit.
- [x] AC-7: Late-arriving tool or model results after cancellation do not emit
  success output, overwrite the cancelled summary, or leave terminal/UI state
  stuck as busy.
- [x] AC-8: Automated coverage proves at least one terminal interrupt path and
  one browser cancel path, and proves a follow-up instruction succeeds without
  restarting the session.
- [x] AC-9: Local traces and any configured LangSmith-linked runtime reporting
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

## Code References

- [`../../../../src/engine/cancellation.ts`](../../../../src/engine/cancellation.ts):
  defines the shared turn-scoped cancellation primitive, idempotent abort
  helper, and error normalization used by terminal, browser, runtime, and tool
  layers.
- [`../../../../src/engine/turn.ts`](../../../../src/engine/turn.ts):
  accepts the per-turn `signal`, suppresses late post-cancel tool emissions,
  returns `cancelled` as a first-class turn status, and persists cancelled
  summaries into the session trace/history.
- [`../../../../src/engine/graph.ts`](../../../../src/engine/graph.ts),
  [`../../../../src/agents/explorer.ts`](../../../../src/agents/explorer.ts),
  and [`../../../../src/agents/verifier.ts`](../../../../src/agents/verifier.ts):
  propagate cancellation through plan/act/verify helper paths so graph runtime
  exits with a cancelled state instead of surfacing planner/verifier aborts as
  ordinary failures.
- [`../../../../src/engine/loop.ts`](../../../../src/engine/loop.ts):
  keeps the terminal process alive, maps `Ctrl+C` onto the active turn
  controller, and returns the prompt ready for the next instruction in the same
  session.
- [`../../../../src/ui/server.ts`](../../../../src/ui/server.ts),
  [`../../../../src/ui/workbench-state.ts`](../../../../src/ui/workbench-state.ts),
  [`../../../../ui/src/App.tsx`](../../../../ui/src/App.tsx), and
  [`../../../../ui/src/panels/ComposerPanel.tsx`](../../../../ui/src/panels/ComposerPanel.tsx):
  replace the browser cancel placeholder with a real interrupt path, keep the
  browser workbench truthful about cancelled turns, and preserve the next draft
  instruction while a turn is being stopped.
- [`../../../../src/tools/run-command.ts`](../../../../src/tools/run-command.ts):
  threads the active turn signal into spawned subprocesses and terminates the
  process tree when the operator interrupts the turn.
- [`../../../../tests/loop-runtime.test.ts`](../../../../tests/loop-runtime.test.ts),
  [`../../../../tests/turn-runtime.test.ts`](../../../../tests/turn-runtime.test.ts),
  [`../../../../tests/ui-runtime.test.ts`](../../../../tests/ui-runtime.test.ts),
  [`../../../../tests/tooling.test.ts`](../../../../tests/tooling.test.ts), and
  [`../../../../tests/graph-runtime.test.ts`](../../../../tests/graph-runtime.test.ts):
  cover terminal interrupts, browser cancel, cancelled turn-state propagation,
  subprocess abortion, and planner-path cancellation.

## Representative Snippets

```ts
export function abortTurn(
  controller: AbortController,
  reason = DEFAULT_TURN_CANCELLED_REASON,
): void {
  if (controller.signal.aborted) {
    return;
  }

  controller.abort(createTurnCancelledError(reason));
}
```

```ts
const handleSigint = (): void => {
  if (activeTurnController === null) {
    console.log("No active Shipyard turn is running.");
    rl.prompt();
    return;
  }

  console.log(
    "Interrupt requested. Waiting for Shipyard to stop the current turn...",
  );
  abortTurn(activeTurnController);
};
```

```ts
if (activeInstructionController.signal.aborted) {
  sessionState.workbenchState = {
    ...sessionState.workbenchState,
    latestError: null,
    agentStatus:
      "Cancellation already requested. Waiting for the active turn to stop.",
  };
  await broadcastSessionState();
  break;
}

abortTurn(activeInstructionController);
```
