# Phase 4: LangGraph State Machine Story Pack

- Pack: Phase 4 LangGraph State Machine
- Estimate: 2-3 hours
- Date: 2026-03-24
- Status: Drafted for implementation

## Pack Objectives

1. Replace the ad hoc loop handoff with a stateful execution engine that can plan, act, verify, recover, and respond with explicit routing between those stages.
2. Make every file edit reversible, every retry bounded, and every blocked file visible in runtime state.
3. Finish the MVP by wiring the CLI to the real engine path and capturing usable LangSmith traces for both a clean run and an error run.

## Shared Constraints

- Product code and product docs stay under `shipyard/`; `.ai/` remains helper-only.
- The repo already includes `@langchain/langgraph`, `@langchain/anthropic`, `@anthropic-ai/sdk`, and `langsmith`, so this phase is primarily about orchestration and integration rather than dependency discovery.
- LangGraph.js `StateGraph` nodes operate on shared state and return `Partial<State>` updates, and graphs must be `.compile()`d before use.
- `addConditionalEdges` is the routing primitive to use when implementing the Phase 4 node transitions.
- LangSmith tracing is automatic for LangGraph/LangChain-managed calls when tracing environment variables are configured; custom/raw fallback functions should be wrapped with `traceable`.
- If LangGraph wiring starts consuming the whole time budget, the fallback path is the Phase 3 raw loop plus manual state management and `traceable` instrumentation. The pack must preserve that escape hatch explicitly.
- The current worktree already contains unrelated source edits. This pack documents Phase 4 without assuming those unrelated changes are part of the same implementation commit.

## Planned Stories

| Story ID | Title | Purpose | Depends On |
|---|---|---|---|
| P4-S01 | Graph Runtime and Fallback Contract | Define the LangGraph state shape, nodes, conditional edges, and the equivalent raw-loop fallback path. | Phase 3 implementation |
| P4-S02 | Checkpointing and Recovery Flow | Make every edit reversible and wire retry/blocking behavior into graph recovery. | P4-S01 |
| P4-S03 | Context Envelope and CLI Execution Wiring | Assemble the full prompt context, replace the CLI stub path, and persist turn summaries back to session state. | P4-S01 |
| P4-S04 | LangSmith Tracing and MVP Verification | Capture automatic or `traceable` traces, run the two required tasks, and record the trace URLs in `CODEAGENT.md`. | P4-S02, P4-S03 |

## Sequencing Rationale

- `P4-S01` sets the execution contract for the entire phase, including the explicit fallback path if LangGraph setup becomes a time sink.
- `P4-S02` isolates reversible editing and recovery, which are critical safety features and easy to reason about separately from prompt/context work.
- `P4-S03` then wires the runtime into the user-facing CLI once the engine and recovery primitives are defined.
- `P4-S04` closes the phase by proving the graph or fallback loop produces usable traces and can complete both a clean task and an error task.

## Whole-Pack Success Signal

- Shipyard can take a natural-language instruction, build context, plan, act, verify, recover when needed, and return a final response.
- File edits are checkpointed before mutation and reverted automatically on failed verification.
- Retry counts, blocked files, last edited file, and final summaries live in runtime state rather than being inferred from logs alone.
- LangSmith shows full traces for one successful task and one failing task, and those two MVP trace URLs are saved into `shipyard/CODEAGENT.md`.
