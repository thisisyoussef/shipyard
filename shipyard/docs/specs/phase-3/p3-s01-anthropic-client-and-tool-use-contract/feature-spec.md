# Feature Spec

## Metadata
- Story ID: P3-S01
- Story Title: Anthropic Client and Tool-Use Contract
- Author: Codex
- Date: 2026-03-24
- Related PRD/phase gate: Phase 3 Wire Tools To Claude, groundwork for step 3.1

## Problem Statement

Shipyard has a persistent local loop and a growing tool surface, but nothing in the current runtime knows how to call Claude or how to translate the Phase 2 tool registry into a live Anthropic Messages API request. Before the raw loop exists, the repo needs one small, explicit contract for model selection, API credentials, message history, and tool-use block handling.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Establish a minimal Claude integration layer that matches the raw loop's needs without introducing framework overhead.
- Objective 2: Keep model/tool protocol details centralized so the raw loop and later graph runtime do not drift apart.
- Objective 3: Make the integration testable without requiring every unit test to hit the live Anthropic API.
- How this story or pack contributes to the overall objective set: This story provides the protocol and client foundation the raw loop depends on.

## User Stories
- As the Shipyard engine, I want a small Claude client contract so I can send system prompts, message history, and tool definitions to Sonnet 4.5 without duplicating API knowledge in every engine module.

## Acceptance Criteria
- [ ] AC-1: Add a minimal Anthropic client/helper layer that reads `ANTHROPIC_API_KEY` from the environment and fails clearly when it is missing.
- [ ] AC-2: Define the model/config contract for Phase 3, defaulting to the Sonnet 4.5 alias `claude-sonnet-4-5` while keeping the implementation easy to pin later if needed.
- [ ] AC-3: Add typed helpers or adapters for the Anthropic message/content shapes the raw loop will consume, including assistant `tool_use` blocks and user `tool_result` blocks.
- [ ] AC-4: The client/request layer accepts tool definitions produced by the Phase 2 registry without inventing a second schema format.
- [ ] AC-5: Focused tests cover missing-key handling, request assembly, and response-block extraction or normalization without requiring live API calls.

## Edge Cases
- Empty/null inputs: blank system prompts or user messages reject before network calls.
- Boundary values: empty tool-name lists still allow plain model requests.
- Invalid/malformed data: unknown or malformed content blocks fail with a descriptive error instead of silently disappearing.
- External-service failures: Anthropic API failures return actionable error messages without leaking secrets.

## Non-Functional Requirements
- Security: credentials stay environment-based only.
- Performance: one client instance should be reusable across loop turns.
- Observability: request-level failures identify the stage that failed, such as config, request assembly, or API response parsing.
- Reliability: content-block helpers preserve enough raw structure for the loop to replay assistant messages exactly.

## UI Requirements (if applicable)
- Required states: Not applicable.
- Accessibility contract: Not applicable.
- Design token contract: Not applicable.
- Visual-regression snapshot states: Not applicable.

## Out of Scope
- The iterative tool loop itself.
- LangGraph integration.
- Prompt tuning based on live model behavior.

## Done Definition
- The repo has one Claude client/config entrypoint.
- The raw loop can depend on typed block helpers rather than hand-parsing arbitrary JSON inline.
- Tests prove the request/response contract without live API dependence.
