# Provider-Agnostic Model Runtime Story Pack

- Pack: Provider-Agnostic Model Runtime
- Estimate: 16-24 hours
- Date: 2026-03-26
- Status: In progress (`P10-S01` implemented; `P10-S02` through `P10-S05` drafted)

## Pack Objectives

1. Replace Anthropic-specific runtime protocol types with a provider-neutral
   model contract that the shared turn loop can consume.
2. Keep one orchestration path for planning, tool use, verification,
   cancellation, and tracing while allowing multiple model adapters behind it.
3. Add provider/model routing that can choose different providers or models for
   the code phase, target manager, and helper subagents without wiring SDK
   details into those modules.
4. Add OpenAI support through the Responses API while preserving Anthropic as a
   first-class provider and keeping the default behavior backward compatible.
5. Move runtime and UI tests onto provider-neutral fakes so future
   model-provider work does not require Anthropic wire types across the whole
   suite.

## Shared Constraints

- `ToolDefinition` stays the canonical registry contract. Provider-specific
  tool projection belongs in adapter modules, not in `src/tools/registry.ts`.
- `graph.ts`, `raw-loop.ts`, turn execution, checkpoints, cancellation, and
  tracing remain shared runtime infrastructure. Do not fork the orchestration
  loop per provider.
- Anthropic support must remain backward compatible while the new abstractions
  land. This pack adds abstraction first, not a Claude removal.
- No provider SDK request or response types should leak beyond adapter modules
  once the pack is complete.
- Provider/model selection must be inspectable and deterministic.
- Tests should default to provider-neutral fake adapters, keeping only focused
  adapter contract coverage provider-specific.

## Planned Stories

| Story ID | Title | Purpose | Depends On |
|---|---|---|---|
| P10-S01 | Internal Model Adapter Contract and Neutral Tool Projection | Introduce provider-neutral turn/tool contracts and remove provider-specific tool projection from the registry so later stories have one stable abstraction boundary. | Phase 2 tool registry, Phase 3 model/tool loop foundation |
| P10-S02 | Anthropic Adapter Migration and Runtime Decoupling | Move Anthropic request/response handling behind an adapter and remove Anthropic wire types from the shared runtime loop and graph state. | P10-S01 |
| P10-S03 | Provider Routing and Capability Resolution | Add provider/model selection for phases, subagents, and target enrichment; replace Anthropic-only env checks with provider-aware capability resolution. | P10-S01, P10-S02 |
| P10-S04 | OpenAI Responses Adapter | Add an OpenAI adapter that speaks the Responses API tool-calling contract through the shared provider abstraction and routing system. | P10-S01, P10-S03 |
| P10-S05 | Provider-Neutral Test Harness and Contract Migration | Replace Anthropic-shaped mocks in the broad runtime suite with provider-neutral fakes and retain only focused adapter contract tests. | P10-S02, P10-S03, P10-S04 |

## Sequencing Rationale

- `P10-S01` lands first because every later story depends on one shared
  internal model contract and on the registry no longer exporting
  Anthropic-specific tool definitions.
- `P10-S02` follows so the current Anthropic runtime is the first consumer of
  the new abstraction.
- `P10-S03` adds routing after Anthropic is behind the adapter boundary.
- `P10-S04` adds OpenAI only after the abstraction and routing layers are
  stable enough to accept a second provider without duplicating the loop.
- `P10-S05` lands last because the biggest test payoff comes after both
  providers and the final routing shape exist.

## Whole-Pack Success Signal

- The shared runtime loop can execute turns against an internal `ModelAdapter`
  contract instead of directly against Anthropic SDK message types.
- The tool registry exposes only provider-neutral tool definitions.
- Anthropic remains a supported default path, but provider/model choice can be
  configured per runtime surface or helper role without branching the loop.
- OpenAI can run through the same orchestration path using a Responses API
  adapter instead of a one-off alternate loop.

## Implementation Evidence

### Code References

- `P10-S01`: [`../../src/engine/model-adapter.ts`](../../src/engine/model-adapter.ts),
  [`../../src/tools/registry.ts`](../../src/tools/registry.ts),
  [`../../src/engine/anthropic.ts`](../../src/engine/anthropic.ts),
  [`../../src/engine/raw-loop.ts`](../../src/engine/raw-loop.ts), and
  [`../../tests/model-adapter.test.ts`](../../tests/model-adapter.test.ts)
  add the provider-neutral internal turn/tool contract, remove
  Anthropic-specific tool projection from the registry, move Anthropic tool
  projection into the Anthropic integration layer, and cover the seam with
  focused contract tests.
- `P10-S01` also updates [`../../tests/tooling.test.ts`](../../tests/tooling.test.ts),
  [`../../tests/anthropic-contract.test.ts`](../../tests/anthropic-contract.test.ts),
  [`../../tests/raw-loop.test.ts`](../../tests/raw-loop.test.ts),
  [`../../tests/explorer-subagent.test.ts`](../../tests/explorer-subagent.test.ts),
  [`../../tests/planner-subagent.test.ts`](../../tests/planner-subagent.test.ts),
  and [`../../tests/verifier-subagent.test.ts`](../../tests/verifier-subagent.test.ts)
  so provider-specific projection is asserted through the Anthropic layer
  instead of the shared registry.

### Representative Snippets

- `P10-S01` provider-neutral adapter contract:

```ts
export interface ModelAdapter<TProjectedTool = unknown> {
  readonly provider: string;
  projectTools: (tools: ToolDefinition[]) => TProjectedTool[];
  createTurn: (
    input: ModelTurnInput,
    options?: { signal?: AbortSignal },
  ) => Promise<ModelTurnResult>;
}
```

- `P10-S01` Anthropic-side tool projection:

```ts
export function projectToolsToAnthropicTools(
  tools: ToolDefinition[],
): AnthropicToolDefinition[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
}
```

- `P10-S01` raw loop now consumes generic tool definitions before provider
  projection:

```ts
const anthropicTools = projectToolsToAnthropicTools(
  getTools(normalizedToolNames),
);
```
