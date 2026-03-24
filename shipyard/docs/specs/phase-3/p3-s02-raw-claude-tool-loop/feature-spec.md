# Feature Spec

## Metadata
- Story ID: P3-S02
- Story Title: Raw Claude Tool Loop
- Author: Codex
- Date: 2026-03-24
- Related PRD/phase gate: Phase 3 Wire Tools To Claude, step 3.1

## Problem Statement

Shipyard currently has a persistent local REPL and a scaffolded code phase, but no agentic runtime that can hand control to Claude, execute returned tools, and continue the conversation until the model is done. Before any higher-level orchestration framework is introduced, the repo needs a small, explicit raw loop that proves the live model-to-tool path works in the simplest possible way.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Build the simplest working agentic loop around Claude tool use.
- Objective 2: Keep loop behavior observable and bounded so failures are debuggable without framework spelunking.
- Objective 3: Return final model text cleanly once the tool-calling phase is over.
- How this story or pack contributes to the overall objective set: This story delivers the direct runtime fallback that validates the entire tool pipeline.

## User Stories
- As the Shipyard engine, I want a raw Claude tool loop so I can send an instruction, let Claude call tools, feed tool results back, and stop once Claude produces its final answer.

## Acceptance Criteria
- [ ] AC-1: Add `src/engine/raw-loop.ts` exporting a function that takes a system prompt, a user message, a list of tool names, and the target directory.
- [ ] AC-2: The loop sends the initial request to Claude with the system prompt, message history, and Anthropic-formatted tool definitions from the registry.
- [ ] AC-3: When Claude returns `stop_reason === "tool_use"`, the loop extracts every `tool_use` block, looks up each tool, executes it with the provided input and target directory, and appends both the assistant tool-use message and the next user tool-result message to history before continuing.
- [ ] AC-4: The loop stops once `stop_reason` is not `tool_use`, extracts the final text response, and returns it to the caller.
- [ ] AC-5: The loop caps execution at 25 iterations and fails clearly if the cap is exceeded.
- [ ] AC-6: Every turn logs the turn number, tool calls with truncated inputs, and tool results with success/failure plus truncated output to the console.

## Edge Cases
- Empty/null inputs: blank user message or missing tool list is handled before the first request.
- Boundary values: multiple tool calls in one assistant response are executed in order and all results are returned in the next user message.
- Invalid/malformed data: unknown requested tool names become failure tool results rather than crashing the loop.
- External-service failures: Claude API or tool execution failures surface as actionable loop errors.

## Non-Functional Requirements
- Security: do not print secrets or full unbounded tool outputs to the console.
- Performance: keep tool lookup constant-time and message history mutation lightweight.
- Observability: logs must be detailed enough to replay what happened during a failing live session.
- Reliability: the loop must replay the assistant tool-use message exactly before sending tool results back.

## UI Requirements (if applicable)
- Required states: Not applicable.
- Accessibility contract: Not applicable.
- Design token contract: Not applicable.
- Visual-regression snapshot states: Not applicable.

## Out of Scope
- LangGraph integration.
- Parallel tool execution across multiple Claude turns.
- Advanced retry/backoff orchestration beyond the shared client timeout behavior.

## Done Definition
- A single raw-loop function can run a full Claude tool session.
- The function is bounded, logged, and returns final text.
- Focused tests cover loop continuation, cap behavior, and unknown-tool handling with mocks or fixtures.
