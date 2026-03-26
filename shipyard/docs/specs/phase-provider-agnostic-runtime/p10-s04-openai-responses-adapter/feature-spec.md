# Feature Spec

## Metadata
- Story ID: P10-S04
- Story Title: OpenAI Responses Adapter
- Author: Codex
- Date: 2026-03-26
- Related PRD/phase gate: Phase 10 Provider-Agnostic Model Runtime, second-provider implementation through the shared adapter boundary

## Problem Statement

Once Anthropic is adapter-backed and provider routing exists, Shipyard still does not actually support another provider until a second adapter is implemented. The requested second provider is OpenAI, and the runtime should target the Responses API rather than bolt in a separate one-off execution path. The adapter must translate Shipyard's internal tool-using turn contract into the OpenAI Responses wire format and back without duplicating the orchestration loop.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Add OpenAI support through the same shared runtime boundary Anthropic now uses.
- Objective 2: Preserve one orchestration loop by translating OpenAI wire semantics into Shipyard-owned turn/tool abstractions.
- Objective 3: Keep provider-specific differences localized inside the OpenAI adapter and focused contract tests.
- How this story or pack contributes to the overall objective set: This story makes the provider-agnostic architecture real by adding the first non-Anthropic adapter.

## User Stories
- As the Shipyard runtime, I want an OpenAI adapter so I can run the same tool-using turn loop against OpenAI models without forking the runtime.
- As a Shipyard maintainer, I want OpenAI-specific request and response logic localized so future provider changes do not ripple through graph, raw loop, or UI runtime code.

## Acceptance Criteria
- [ ] AC-1: Add an OpenAI adapter that implements the internal `ModelAdapter` contract using the Responses API.
- [ ] AC-2: The adapter projects Shipyard tool definitions into OpenAI function-tool descriptors without changing the shared registry contract.
- [ ] AC-3: The adapter normalizes OpenAI `function_call` items into Shipyard `ToolCall` values and can encode `ToolCallResult` values back into `function_call_output` inputs keyed by `call_id`.
- [ ] AC-4: The OpenAI adapter integrates with provider/model routing and fails clearly when the OpenAI provider is selected but credentials or required config are missing.
- [ ] AC-5: Focused tests cover request assembly, tool projection, tool-call normalization, tool-result round-trip encoding, and final-text extraction.

## Edge Cases
- Empty/null inputs: OpenAI still supports final-text-only turns without tools.
- Boundary values: a single response may include one or many function calls and should normalize deterministically.
- Invalid/malformed data: malformed tool arguments or missing `call_id` fail clearly inside the adapter.
- Provider failures: OpenAI API errors return actionable diagnostics without leaking secrets.

## Non-Functional Requirements
- Security: credentials stay environment-based only.
- Performance: the adapter should avoid extra model round-trips beyond the shared loop's normal tool-call cycle.
- Observability: provider/model and request-stage failures should be visible in trace metadata and test diagnostics.
- Reliability: OpenAI tool calls and final text should normalize into the same orchestration contract Anthropic already uses.

## UI Requirements (if applicable)
- Required states: No new UI required in this story.
- Accessibility contract: Not applicable.
- Design token contract: Not applicable.
- Visual-regression snapshot states: Not applicable.

## Out of Scope
- Streaming-specific UI behavior for OpenAI responses.
- Prompt retuning beyond targeted adapter-compatibility fixes.
- User-facing provider selectors.

## Done Definition
- Shipyard has a working OpenAI Responses adapter behind the shared provider contract.
- OpenAI tool calls and tool results round-trip through the shared loop without a duplicate execution path.
- Focused adapter tests prove the OpenAI wire-format translation.
