# Technical Plan

## Metadata
- Story ID: P4-S03
- Story Title: Context Envelope and CLI Execution Wiring
- Author: Codex
- Date: 2026-03-24

## Proposed Design
- Components/modules affected:
  - `shipyard/src/context/envelope.ts`
  - `shipyard/src/bin/shipyard.ts`
  - `shipyard/src/engine/loop.ts` or the new runtime entrypoint
  - `shipyard/src/engine/state.ts` for session-summary persistence
  - `shipyard/src/phases/code/prompts.ts`
- Public interfaces/contracts:
  - `buildContextEnvelope(...)`
  - `serializeContextEnvelope(...)`
  - CLI instruction path invoking the graph or fallback runtime
- Data flow summary: the CLI loads discovery and rules, builds the context envelope, serializes it into prompt text, combines it with the code-phase system prompt, invokes the selected engine path, and then persists an updated session summary.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - stateful execution engine
  - reversible editing and bounded recovery
  - real CLI wiring and trace capture
- Story ordering rationale: this story follows the runtime contract so the CLI can target a real engine entrypoint rather than a stub.
- Gaps/overlap check: this story owns context assembly and user-facing runtime invocation, while trace capture and verification remain separate.
- Whole-pack success signal: a user can point Shipyard at a directory, enter an instruction, and hit the real engine path with a rich serialized context.

## Architecture Decisions
- Decision: keep the context envelope as a structured object plus a deterministic serializer, instead of storing only prompt text.
- Alternatives considered:
  - build the prompt inline in the CLI
  - store only raw strings without a structured envelope
- Rationale: a structured envelope is easier to trace, test, and reuse across graph and fallback runtime paths.

## Data Model / API Contracts
- Request shape:
  - discovery report
  - current instruction
  - rolling summary
  - retry counts
  - blocked files
  - recent errors
  - injected context strings
- Response shape:
  - `ContextEnvelope`
  - serialized prompt text
  - updated session summary and saved session state
- Storage/index changes:
  - session files continue to store rolling summary and discovery state

## Dependency Plan
- Existing dependencies used: current session helpers, code-phase prompt module, filesystem access for `AGENTS.md`.
- New dependencies proposed (if any): none.
- Risk and mitigation:
  - Risk: the serialized envelope grows too noisy and dilutes instruction quality.
  - Mitigation: keep section headers stable and omit empty sections or compress them to short placeholders.

## Test Strategy
- Unit tests:
  - envelope assembly with and without `AGENTS.md`
  - deterministic prompt serialization
  - summary update after a successful or failed run
- Integration tests:
  - CLI instruction path builds prompt text and invokes the selected runtime
- E2E or smoke tests: deferred to P4-S04
- Edge-case coverage mapping:
  - empty blocked files
  - recent errors present without injected context
  - missing project rules file

## UI Implementation Plan (if applicable)
- Behavior logic modules: Not applicable.
- Component structure: Not applicable.
- Accessibility implementation plan: Not applicable.
- Visual regression capture plan: Not applicable.

## Rollout and Risk Mitigation
- Rollback strategy: if full CLI wiring is unstable, keep the serializer and invoke the runtime behind a temporary manual command path.
- Feature flags/toggles: a runtime selector for graph vs fallback is acceptable.
- Observability checks: session summaries and traces should record which runtime path executed.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
