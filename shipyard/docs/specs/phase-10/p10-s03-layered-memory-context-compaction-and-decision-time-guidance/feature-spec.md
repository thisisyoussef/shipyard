# Feature Spec

## Metadata
- Story ID: P10-S03
- Story Title: Layered Memory, Context Compaction, and Decision-Time Guidance
- Author: Codex
- Date: 2026-03-26
- Related PRD/phase gate: Phase 10 durable runtime, policy, and factory workflow

## Problem Statement

Shipyard currently serializes project rules, diff context, recent outputs,
errors, active-task details, and handoff information into one large
`ContextEnvelope` string each turn. That was useful for early runtime
iterations, but it scales poorly as more artifacts and helper roles arrive. The
runtime now needs layered memory with explicit retrieval, compaction, and short
decision-time guidance so the model gets the right context at the right moment
without a giant ever-growing prompt.

## Story Pack Objectives
- Objective 1: Split runtime context into durable, bounded memory layers.
- Objective 2: Make prompt growth intentional through compaction and retrieval
  rather than by concatenating more raw artifacts.
- Objective 3: Add targeted guidance for repeated failures or risky trajectories
  without bloating the base system prompt.
- How this story contributes to the overall objective set: it modernizes
  Shipyard's context system so later indexing, routing, and background-task
  stories can reuse the same retrieval substrate.

## User Stories
- As a coordinator, I want only the most relevant context slices for the active
  task so I can plan and act with less noise.
- As an operator, I want failure notes and prior task context to help the next
  attempt without rereading a long raw transcript.
- As a runtime owner, I want guidance hooks that can steer repeated failure
  loops without rewriting the base prompt each time.

## Acceptance Criteria
- [ ] AC-1: Shipyard defines explicit memory layers for stable repo rules,
  thread state, active task, failure or reflection notes, target profile, and
  optional indexed repo knowledge.
- [ ] AC-2: Prompt assembly retrieves only the layers relevant to the current
  turn and records which layers were used.
- [ ] AC-3: Large diffs, logs, or prior outputs are compacted into bounded
  summaries with source pointers rather than copied verbatim every turn.
- [ ] AC-4: Decision-time guidance can inject short targeted reminders based on
  runtime signals such as repeated test failures, risky commands, or diff churn.
- [ ] AC-5: Memory retention and eviction rules prevent unbounded prompt growth
  across long sessions.
- [ ] AC-6: Existing context sources like uploads, target rules, and handoff
  notes remain supported through the new layered retrieval model.

## Edge Cases
- Empty/null inputs: a new target with no prior memory still produces a minimal
  valid context envelope.
- Boundary values: single-task and multi-task threads both use the same memory
  layer structure.
- Invalid/malformed data: malformed memory entries are skipped with clear trace
  warnings rather than poisoning prompt assembly.
- External-service failures: if summarization or compaction fails, Shipyard
  falls back to the last valid compact summary instead of dumping the raw blob.

## Non-Functional Requirements
- Security: memory layers must not retain secrets or unsafe raw credentials.
- Performance: retrieval and compaction should be cached or incremental enough
  to avoid material latency spikes on every turn.
- Observability: traces should record retrieved layers, dropped layers, and any
  guidance injections.
- Reliability: compaction should be deterministic enough that retries do not
  produce wildly different context for the same runtime state.

## UI Requirements (if applicable)
- Required states: active memory sources, compacted summary available, skipped
  memory layer, and guidance-injected turn.
- Accessibility contract: the workbench should summarize memory receipts in a
  readable way without requiring users to inspect raw JSON.

## Out of Scope
- Building the durable repo index itself.
- New helper-role routing logic.
- Continuous eval dashboards.

## Done Definition
- Shipyard assembles prompts from bounded memory layers with explicit retrieval
  and targeted guidance instead of concatenating one ever-growing envelope.
