# Feature Spec

## Metadata
- Story ID: P10-S03
- Story Title: Provider Routing and Capability Resolution
- Author: Codex
- Date: 2026-03-26
- Related PRD/phase gate: Phase 10 Provider-Agnostic Model Runtime, configuration and routing layer for multi-provider turns

## Problem Statement

After Anthropic moves behind an adapter, Shipyard still lacks a coherent way to decide which provider and model to use for a given runtime surface. `Phase` objects do not currently carry provider/model routing intent, helper subagents inherit whatever the shared loop happens to use, and automatic target enrichment still decides availability by checking `ANTHROPIC_API_KEY` directly. To make the runtime actually configurable, Shipyard needs one provider-aware routing and capability-resolution layer.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Let phases, subagents, and enrichment choose provider/model through one shared routing system.
- Objective 2: Replace Anthropic-only capability checks with provider-aware availability resolution.
- Objective 3: Keep the configuration inspectable and deterministic instead of scattering environment checks across runtime modules.
- How this story or pack contributes to the overall objective set: This story adds the routing/config layer that makes provider-neutral adapters usable where Shipyard wants them.

## User Stories
- As the Shipyard runtime, I want one routing/config system so code execution, target management, and helper subagents can choose provider/model explicitly instead of inheriting Anthropic-only defaults.
- As a Shipyard operator, I want provider/model overrides to be predictable so I can route different runtime surfaces without patching core engine files.

## Acceptance Criteria
- [x] AC-1: Add a provider-aware configuration resolver that supports a global default plus named override points for phases, subagents, or target enrichment.
- [x] AC-2: `Phase` or adjacent phase config can express model-routing intent without embedding provider SDK types or environment parsing logic.
- [x] AC-3: Shared helper surfaces such as planner, explorer, verifier, browser evaluator, and target enrichment can opt into explicit provider/model routing through the same resolver.
- [x] AC-4: Automatic enrichment and other capability checks no longer depend directly on `ANTHROPIC_API_KEY`; they resolve availability from the active provider configuration.
- [x] AC-5: Focused tests cover default resolution, override precedence, invalid provider or model config, and provider-aware capability checks.

## Edge Cases
- Empty/null inputs: a missing override falls back to the global default cleanly.
- Boundary values: a model-only override without an explicit provider either inherits the resolved provider or fails clearly if ambiguous.
- Invalid/malformed data: unknown provider IDs or incomplete provider config fail before turn execution starts.
- Compatibility: current default behavior remains Anthropic until the operator or config selects otherwise.

## Non-Functional Requirements
- Security: credentials remain environment-based; this story centralizes resolution but does not widen credential storage.
- Performance: provider resolution should happen once per turn or route construction, not repeatedly inside each tool execution.
- Observability: chosen provider/model should be visible in runtime metadata and traces.
- Reliability: routing precedence must be deterministic and testable.

## UI Requirements (if applicable)
- Required states: No new visible UI required in this story; routing is runtime-facing.
- Accessibility contract: Not applicable.
- Design token contract: Not applicable.
- Visual-regression snapshot states: Not applicable.

## Out of Scope
- The actual OpenAI adapter implementation.
- Broad suite-wide provider-neutral mock migration.
- User-facing provider pickers or UI controls.

## Done Definition
- Shipyard has one provider/model routing system with shared override rules.
- Phases and helper roles can opt into explicit routing intent.
- Automatic enrichment availability no longer hard-codes Anthropic env checks.
- Tests prove routing precedence and capability resolution.

## Implementation Evidence
- Central routing and capability resolution landed in
  [`../../../../src/engine/model-routing.ts`](../../../../src/engine/model-routing.ts).
- Declarative phase routing landed in
  [`../../../../src/phases/phase.ts`](../../../../src/phases/phase.ts),
  [`../../../../src/phases/code/index.ts`](../../../../src/phases/code/index.ts),
  and
  [`../../../../src/phases/target-manager/index.ts`](../../../../src/phases/target-manager/index.ts).
- Shared runtime surfaces now pass explicit route IDs through
  [`../../../../src/engine/graph.ts`](../../../../src/engine/graph.ts),
  [`../../../../src/engine/turn.ts`](../../../../src/engine/turn.ts),
  and [`../../../../src/plans/turn.ts`](../../../../src/plans/turn.ts).
- Target enrichment now resolves availability and invokers through the shared
  routing layer in
  [`../../../../src/engine/target-enrichment.ts`](../../../../src/engine/target-enrichment.ts),
  [`../../../../src/engine/target-command.ts`](../../../../src/engine/target-command.ts),
  [`../../../../src/ui/server.ts`](../../../../src/ui/server.ts), and
  [`../../../../src/tools/target-manager/enrich-target.ts`](../../../../src/tools/target-manager/enrich-target.ts).
- Focused coverage landed in
  [`../../../../tests/model-routing.test.ts`](../../../../tests/model-routing.test.ts),
  [`../../../../tests/turn-runtime.test.ts`](../../../../tests/turn-runtime.test.ts),
  [`../../../../tests/plan-mode.test.ts`](../../../../tests/plan-mode.test.ts),
  and
  [`../../../../tests/target-auto-enrichment.test.ts`](../../../../tests/target-auto-enrichment.test.ts).

## Validation Evidence
- `pnpm --dir shipyard test`
- `pnpm --dir shipyard typecheck`
- `pnpm --dir shipyard build`
- `git diff --check`
