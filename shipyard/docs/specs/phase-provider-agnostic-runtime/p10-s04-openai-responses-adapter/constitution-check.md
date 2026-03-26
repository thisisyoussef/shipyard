# Constitution Check

## Story Context
- Story ID: P10-S04
- Story Title: OpenAI Responses Adapter
- Owner: Codex
- Date: 2026-03-26

## Architecture Constraints
- [x] Clean architecture boundaries preserved. OpenAI wire-format concerns stay inside the adapter and focused adapter tests.
- [x] New modules respect SRP and dependency direction. Shared orchestration stays provider-neutral while the adapter owns Responses-specific translation.
- [x] No net-new boundary violations introduced.

## Technology Constraints
- [x] Uses the existing approved stack unless exception documented.
- [x] New dependency justified and risk-assessed. Adding the official OpenAI SDK is acceptable if it keeps the Responses integration smaller and better typed than hand-rolled HTTP.
- [x] Provider integrations use existing adapters/contracts where possible. OpenAI must implement the same internal adapter boundary Anthropic already uses.

## Quality Constraints
- [x] TDD-first execution planned with focused adapter contract tests before broad runtime migration.
- [ ] Coverage target preserved (>90%).
- [x] File/function size limits respected by separating config, request assembly, normalization, and tests.
- [x] Type hints and linting gates preserved through strict TypeScript and the repo's actual validation commands.

## Security Constraints
- [x] No hardcoded secrets.
- [x] Input validation plan included. Missing credentials, malformed tool arguments, and missing call IDs fail clearly in the adapter.
- [x] Error handling avoids secret leakage. OpenAI credentials remain env-based and should never appear in logs.
- [x] External calls include timeout/retry policy. The adapter should define or inherit sensible request defaults instead of delegating that responsibility to callers.

## Performance Constraints
- [x] I/O paths are async where applicable.
- [x] Connection reuse/pooling considered. The OpenAI client should be reusable behind the adapter.
- [x] Expected latency/cost impact documented. The OpenAI path should not introduce duplicate model calls outside the shared tool loop.

## Exceptions
- Exception: The generic template references coverage and lint gates beyond the repo's enforced checks.
- Rationale: Shipyard currently validates with tests, typecheck, build, and diff check.
- Approval: Planning artifact only.

## Result
- [x] Constitution check passed
- [ ] Blocking issues identified (list below)

Blocking issues:
- None.
