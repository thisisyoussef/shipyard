# Constitution Check

## Story Context
- Story ID: P3-S01
- Story Title: Anthropic Client and Tool-Use Contract
- Owner: Codex
- Date: 2026-03-24

## Architecture Constraints
- [x] Clean architecture boundaries preserved. Claude API concerns stay in engine/runtime helpers and do not leak into tool implementation files.
- [x] New modules respect SRP and dependency direction. The client/config layer handles Anthropic requests, while the raw loop consumes that layer later.
- [x] No net-new boundary violations introduced.

## Technology Constraints
- [x] Uses the existing approved stack unless exception documented.
- [x] New dependency justified and risk-assessed. Adding Anthropic's official TypeScript SDK is acceptable if it keeps the loop simpler than hand-rolled HTTP.
- [x] Provider integrations use existing adapters/contracts where possible. The client should consume the Phase 2 registry output rather than inventing a second tool-definition format.

## Quality Constraints
- [x] TDD-first execution planned with client/config tests before loop implementation.
- [ ] Coverage target preserved (>90%).
- [x] File/function size limits respected by splitting config, request assembly, and response helpers.
- [x] Type hints and linting gates preserved through strict TypeScript and the repo's actual validation commands.

## Security Constraints
- [x] No hardcoded secrets.
- [x] Input validation plan included. Missing API keys and unknown model configuration fail clearly before a live request is attempted.
- [x] Error handling avoids secret leakage. Errors should never print the Anthropic API key.
- [x] External calls include timeout/retry policy. The initial client wrapper should own request timeout defaults, even if retry policy remains minimal in this phase.

## Performance Constraints
- [x] I/O paths are async where applicable.
- [x] Connection reuse/pooling considered. The Anthropic client should be created once per loop or shared helper rather than per tool call.
- [x] Expected latency/cost impact documented. The loop should reuse message history and keep the system prompt/tool list stable across turns.

## Exceptions
- Exception: The generic template references coverage and lint gates beyond the repo's enforced checks.
- Rationale: Shipyard currently validates with tests, typecheck, build, and diff check.
- Approval: Planning artifact only.

## Result
- [x] Constitution check passed
- [ ] Blocking issues identified (list below)

Blocking issues:
- None.
