# Feature Spec

## Metadata
- Story ID: P11-S05
- Story Title: Three-Role TDD Runtime and Reviewable Handoff Contracts
- Author: Codex
- Date: 2026-03-28
- Related PRD/phase gate: Phase 11 runtime factory foundations

## Problem Statement

Shipyard already uses explorer, planner, verifier, and browser-evaluator
subagents, but its TDD process still lives mostly as workflow guidance outside
the product runtime. There is no runtime-native equivalent of "Agent 1 writes
tests from the spec, Agent 2 implements without editing those tests, Agent 3
reviews or refactors while keeping the suite green." That means the TDD
discipline is harder to preserve once the product itself starts orchestrating
multi-phase work. Shipyard needs a dedicated TDD runtime lane with explicit
handoffs, stage policies, RED/GREEN guards, and durable quality reports.

## Story Pack Objectives
- Objective 1: Make the current three-role TDD discipline a real runtime path
  instead of a docs-only promise.
- Objective 2: Preserve stage isolation so tests, implementation, and review do
  not silently collapse back into one opaque agent loop.
- Objective 3: Give later coordinators and task graphs a clean implementation
  lane with explicit evidence and retry limits.
- How this story contributes to the overall objective set: it is the
  implementation backbone that turns approved PM artifacts into bounded code
  delivery stages.

## User Stories
- As an operator, I want Shipyard to prove RED before implementation starts.
- As a test author, I want my contract preserved so the implementer cannot
  silently weaken it.
- As a reviewer, I want explicit quality and missing-test reports after the
  implementation goes green.

## Acceptance Criteria
- [x] AC-1: Shipyard has a dedicated TDD runtime lane with explicit stages for
  test author, implementer, and reviewer.
- [x] AC-2: The implementer stage cannot modify test-author artifacts silently;
  objections are recorded as escalations instead.
- [x] AC-3: RED/GREEN checks are first-class runtime events with durable
  handoff artifacts and retry counters.
- [x] AC-4: The TDD lane can attach to approved specs and later emit structured
  quality or review artifacts back into the registry.
- [x] AC-5: Optional property-test and mutation-test hooks can run when the
  story qualifies, but the lane degrades cleanly when those adapters are not
  configured.
- [x] AC-6: The operator can inspect stage outputs, escalations, and quality
  findings without reconstructing them from chat history.

## Edge Cases
- Empty/null inputs: a TDD lane cannot start without an approved spec and a
  focused validation command or equivalent test contract.
- Boundary values: trivial bug-fix stories can still use the same lane with one
  narrow test group.
- Invalid/malformed data: malformed test-stage artifacts or missing handoff
  files fail clearly instead of advancing to implementation.
- External-service failures: missing property or mutation tooling records an
  explicit skip rather than failing the whole TDD lane.

## Non-Functional Requirements
- Security: the test-author and reviewer stages should default to read-only
  tool surfaces except where stage-specific writes are explicitly allowed.
- Performance: the lane should keep focused validation narrow enough for
  interactive development.
- Observability: stage transitions, retries, skips, and escalations must be
  visible in traces and later task-board projections.
- Reliability: restart or interruption should not lose the current TDD stage or
  its handoff files.

## Out of Scope
- Rendering a visual TDD lane in the UI.
- Full mutation infrastructure for repos that do not support it.
- Autonomous PR or merge handling.

## Done Definition
- Shipyard can execute an explicit three-role TDD lane with durable handoffs
  and quality reports instead of relying on external workflow memory.

## Implementation Evidence

- `shipyard/src/tdd/contracts.ts`, `shipyard/src/tdd/store.ts`, and
  `shipyard/src/artifacts/types.ts`: add the durable TDD lane vocabulary,
  persisted lane schema, workbench projection state, and typed artifact
  contracts for handoffs, escalations, quality findings, focused validation,
  and optional checks.

  ```ts
  export const tddWorkbenchStateSchema = z.object({
    activeLaneId: z.string().trim().min(1).nullable(),
    status: z.union([tddLaneStatusSchema, z.literal("idle")]),
    currentStage: tddStageSchema.nullable(),
  });
  ```

- `shipyard/src/tdd/turn.ts`: implements `tdd start`, `tdd continue`, and
  `tdd status`, resolves approved technical specs from the artifact registry,
  forces RED before implementation, records immutable test-author files, saves
  `tdd-handoff` / `tdd-escalation` / `tdd-quality-report` artifacts, and emits
  optional property or mutation outcomes as explicit pass/skip/blocked records.

  ```ts
  const traced = await runWithLangSmithTrace({
    name: "shipyard.tdd-turn",
    runType: "chain",
    tags: ["shipyard", "tdd-turn", command.type],
  });
  ```

- `shipyard/src/engine/state.ts`, `shipyard/src/ui/contracts.ts`,
  `shipyard/src/ui/workbench-state.ts`, `shipyard/src/engine/loop.ts`, and
  `shipyard/src/ui/server.ts`: persist `activeTddLaneId`, project compact
  `workbenchState.tddState`, surface TDD summaries in recovered sessions, and
  route `tdd ...` instructions through both CLI and browser runtimes.

- `shipyard/src/engine/turn.ts` and `shipyard/src/agents/profiles.ts`: add the
  `phaseOverride` seam used by the TDD lane and the dedicated `test-author`
  runtime profile so stage-specific turn execution can stay bounded without
  mutating the general code phase contract.

- `shipyard/tests/tdd-runtime.test.ts` and `shipyard/tests/loop-runtime.test.ts`:
  verify RED-before-implementer behavior, already-green escalations,
  restart-safe lane persistence, immutable test enforcement, reviewer quality
  report emission, optional-check downgrade behavior, and `tdd` command routing
  through the main loop.

## LangSmith / Monitoring

- Fresh deterministic finish-check traces on project
  `shipyard-p11-s05-finishcheck`:
  - start trace: `019d36f3-784f-7000-8000-0431f8edb0a8`
  - implementer trace: `019d36f3-9580-7000-8000-06a072ebdf38`
  - reviewer trace: `019d36f3-bcd3-7000-8000-06a03cb29fce`
- The isolated finish-check executed a full `tdd start -> tdd continue ->
  tdd continue` lane and confirmed:
  - test-author recorded a red focused validation and immutable test path
  - implementer advanced the lane to reviewer without mutating test artifacts
  - reviewer completed the lane with a published quality report artifact
- `langsmith run list --project "$LANGSMITH_PROJECT" --last-n-minutes 30 --error --limit 10 --full`
  returned `[]` for the isolated finish-check project.
- `langsmith insights list --project "$LANGSMITH_PROJECT" --limit 3` returned
  `null` for the isolated finish-check project.
