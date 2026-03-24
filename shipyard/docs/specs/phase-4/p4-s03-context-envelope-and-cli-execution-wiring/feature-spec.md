# Feature Spec

## Metadata
- Story ID: P4-S03
- Story Title: Context Envelope and CLI Execution Wiring
- Author: Codex
- Date: 2026-03-24
- Related PRD/phase gate: Phase 4 LangGraph State Machine, steps 4.3 and 4.4

## Problem Statement

The current CLI still routes natural-language input into a stub planning path, and the current context envelope builder does not yet match the four-layer Phase 1.2 structure or serialize itself into a model-ready prompt block. Phase 4 needs one coherent context assembler plus a real CLI handoff into the graph or raw-loop runtime.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Assemble the full prompt context from discovery, rules, session state, retries, errors, and injected context.
- Objective 2: Serialize that context into a readable prompt block with stable section headers.
- Objective 3: Replace the CLI's stub instruction path with actual agent execution and session-summary persistence.
- How this story or pack contributes to the overall objective set: This story connects the new runtime to the actual user-facing entrypoint.

## User Stories
- As a Shipyard user, I want the CLI to send my instruction into the real agent runtime with the right project context so I do not have to re-explain the repo every turn.

## Acceptance Criteria
- [ ] AC-1: `src/context/envelope.ts` assembles a `ContextEnvelope` from target directory, current instruction, discovery report, session summary, retry counts, blocked files, recent errors, and optional injected context.
- [ ] AC-2: The envelope loader reads `AGENTS.md` from the target directory when present and includes it in the rules layer.
- [ ] AC-3: Add a serializer that renders the envelope into prompt text with the required section headers: Project Context, Project Rules, Injected Context, Session History, Recent Errors, and Blocked Files.
- [ ] AC-4: The CLI entrypoint replaces the stub instruction handler with actual agent execution using the combined code-phase system prompt plus serialized envelope.
- [ ] AC-5: After each run, the CLI updates the rolling session summary with a brief note about what happened and persists the session state.
- [ ] AC-6: The runtime selector can call either the LangGraph graph or the raw-loop fallback without changing the CLI contract.

## Edge Cases
- Empty/null inputs: empty injected-context arrays and missing `AGENTS.md` files should serialize cleanly without blank noisy sections.
- Boundary values: blocked files and recent errors may be empty and should be omitted or rendered compactly.
- Invalid/malformed data: discovery reports with partial fields should still serialize into readable prompt text.
- External-service failures: runtime failures still append a brief error note to session history before the CLI returns.

## Non-Functional Requirements
- Security: prompt text should not include secrets or absolute system paths.
- Performance: envelope assembly should avoid unnecessary file reads beyond `AGENTS.md` and injected context inputs.
- Observability: saved session summaries should let the next turn understand what happened at a glance.
- Reliability: the same envelope data should serialize deterministically.

## UI Requirements (if applicable)
- Required states: Not applicable.
- Accessibility contract: Not applicable.
- Design token contract: Not applicable.
- Visual-regression snapshot states: Not applicable.

## Out of Scope
- GUI presentation of the envelope.
- Long-term memory retrieval beyond current session summary and injected context.
- Complex prompt-versioning infrastructure.

## Done Definition
- Context assembly and serialization match the Phase 4 prompt contract.
- The CLI invokes the real engine path.
- Session summaries and saved session state reflect each completed turn.
