# Provider-Agnostic Model Runtime Story Pack

- Pack: Provider-Agnostic Model Runtime
- Estimate: 16-24 hours
- Date: 2026-03-26
- Status: In progress (`P10-S01` through `P10-S04` implemented; `P10-S05` drafted)

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
  readonly defaultModel?: string;
  readonly defaultMaxTokens?: number;
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

- `P10-S02`: [`../../src/engine/anthropic.ts`](../../src/engine/anthropic.ts),
  [`../../src/engine/raw-loop.ts`](../../src/engine/raw-loop.ts),
  [`../../src/engine/history-compaction.ts`](../../src/engine/history-compaction.ts),
  [`../../src/engine/graph.ts`](../../src/engine/graph.ts),
  [`../../src/engine/turn.ts`](../../src/engine/turn.ts),
  [`../../src/plans/turn.ts`](../../src/plans/turn.ts),
  [`../../tests/anthropic-contract.test.ts`](../../tests/anthropic-contract.test.ts),
  [`../../tests/raw-loop.test.ts`](../../tests/raw-loop.test.ts), and
  [`../../tests/graph-runtime.test.ts`](../../tests/graph-runtime.test.ts)
  move Anthropic request/response normalization behind `createAnthropicModelAdapter`,
  store provider-neutral `TurnMessage[]` history in the shared runtime,
  thread provider/model metadata through graph tracing, and regress the
  Anthropic-backed loop through the adapter boundary.

- `P10-S02` adapter-backed Anthropic turns:

```ts
export function createAnthropicModelAdapter(
  options: AnthropicModelAdapterOptions = {},
): ModelAdapter<AnthropicToolDefinition> {
  const client = options.client ?? createAnthropicClient({
    env: options.env,
  });

  return {
    provider: "anthropic",
    defaultModel: DEFAULT_ANTHROPIC_MODEL,
    defaultMaxTokens: DEFAULT_ANTHROPIC_MAX_TOKENS,
    projectTools: projectToolsToAnthropicTools,
    async createTurn(input, requestOptions) {
      const response = await createAnthropicMessage(client, {
        systemPrompt: input.systemPrompt,
        messages: input.messages,
        tools: input.tools
          ? projectToolsToAnthropicTools(input.tools)
          : undefined,
```

- `P10-S02` shared raw loop now runs against `ModelAdapter` and returns
  provider/model metadata:

```ts
const modelAdapter = options.modelAdapter ?? createAnthropicModelAdapter({
  client: options.client as never,
});

const modelTurn = await createModelTurnWithBudgetRecovery({
  modelAdapter,
  systemPrompt: normalizedSystemPrompt,
  messages: requestHistory.messages,
  tools: toolDefinitions,
```

- `P10-S03`: [`../../src/engine/model-routing.ts`](../../src/engine/model-routing.ts),
  [`../../src/phases/phase.ts`](../../src/phases/phase.ts),
  [`../../src/phases/code/index.ts`](../../src/phases/code/index.ts),
  [`../../src/phases/target-manager/index.ts`](../../src/phases/target-manager/index.ts),
  [`../../src/engine/graph.ts`](../../src/engine/graph.ts),
  [`../../src/engine/turn.ts`](../../src/engine/turn.ts),
  [`../../src/plans/turn.ts`](../../src/plans/turn.ts),
  [`../../src/engine/target-enrichment.ts`](../../src/engine/target-enrichment.ts),
  [`../../src/engine/target-command.ts`](../../src/engine/target-command.ts),
  [`../../src/ui/server.ts`](../../src/ui/server.ts),
  [`../../src/tools/target-manager/enrich-target.ts`](../../src/tools/target-manager/enrich-target.ts),
  [`../../tests/model-routing.test.ts`](../../tests/model-routing.test.ts),
  [`../../tests/turn-runtime.test.ts`](../../tests/turn-runtime.test.ts),
  [`../../tests/plan-mode.test.ts`](../../tests/plan-mode.test.ts), and
  [`../../tests/target-auto-enrichment.test.ts`](../../tests/target-auto-enrichment.test.ts)
  add a central provider/model routing resolver, let phases and helper roles
  declare named routes, route planner/explorer/verifier/target-manager turns
  through the shared resolver, and replace Anthropic-only target-enrichment
  availability checks with provider-aware capability diagnostics.

- `P10-S03` declarative route IDs and central resolution:

```ts
export const CODE_PHASE_MODEL_ROUTE = "phase:code" as const;
export const TARGET_ENRICHMENT_MODEL_ROUTE = "target-enrichment" as const;

export function resolveModelRoute(options: {
  routing: ModelRoutingConfig;
  routeId?: ModelRouteId | string;
  override?: ModelRouteDefinition;
  env?: NodeJS.ProcessEnv;
}): ResolvedModelRoute {
  const routeId = assertKnownRouteId(options.routeId);
  const routeOverride = routeId === DEFAULT_MODEL_ROUTE
    ? undefined
    : options.routing.routes[routeId as NamedModelRouteId];
  const mergedRoute = mergeRouteDefinitions(
    options.routing.defaultRoute,
    routeOverride,
    options.override,
  );
```

- `P10-S03` provider-aware enrichment capability resolution:

```ts
export function resolveAutomaticTargetEnrichmentCapability(
  options: AutomaticTargetEnrichmentCapabilityOptions,
): ModelRouteCapability {
  if (options.invokeModel) {
    return {
      routeId: TARGET_ENRICHMENT_MODEL_ROUTE,
      provider: "custom",
      model: null,
      available: true,
      missingEnvironmentVariables: [],
      reason: null,
    };
  }

  return resolveModelRouteCapability({
    routing: options.modelRouting,
    routeId: TARGET_ENRICHMENT_MODEL_ROUTE,
    env: options.env,
    requireAdapter: true,
  });
}
```

- `P10-S04`: [`../../src/engine/openai.ts`](../../src/engine/openai.ts),
  [`../../src/engine/model-routing.ts`](../../src/engine/model-routing.ts),
  [`../../src/engine/README.md`](../../src/engine/README.md),
  [`../../tests/openai-contract.test.ts`](../../tests/openai-contract.test.ts),
  [`../../tests/model-routing.test.ts`](../../tests/model-routing.test.ts), and
  [`../../package.json`](../../package.json)
  add the OpenAI Responses adapter behind the shared `ModelAdapter`
  contract, register OpenAI as a routable provider with a real adapter,
  project Shipyard tools into OpenAI function tools, normalize
  `function_call` / `function_call_output` items into provider-neutral
  turn messages, and cover the adapter with focused contract and
  loop-level tests.

- `P10-S04` OpenAI adapter turn translation and stateless Responses request
  assembly:

```ts
export function buildOpenAIResponseRequest(
  input: OpenAIRequestInput,
): ResponseCreateParamsNonStreaming {
  const request: ResponseCreateParamsNonStreaming = {
    instructions: systemPrompt,
    input: toOpenAIInputItems(input.messages),
    model: runtimeConfig.model,
    max_output_tokens: runtimeConfig.maxTokens,
    store: false,
  };

  if (input.tools !== undefined) {
    request.tools = toOpenAIFunctionTools(input.tools);
```

- `P10-S04` routing now registers a concrete OpenAI adapter:

```ts
  openai: {
    id: "openai",
    requiredEnvironmentVariables: ["OPENAI_API_KEY"],
    createAdapter(options = {}) {
      return createOpenAIModelAdapter({
        env: options.env,
      });
    },
```
