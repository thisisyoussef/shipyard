# Constitution Check

## Story Context
- Story ID: P10-S02
- Story Title: Anthropic Adapter Migration and Runtime Decoupling
- Owner: Codex
- Date: 2026-03-26

## Architecture Constraints
- [x] Clean architecture boundaries preserved. Anthropic SDK details move into adapter modules instead of living in shared runtime code.
- [x] New modules respect SRP and dependency direction. Shared orchestration owns control flow; the Anthropic adapter owns provider wire-format concerns.
- [x] No net-new boundary violations introduced.

## Technology Constraints
- [x] Uses the existing approved stack unless exception documented.
- [x] New dependency justified and risk-assessed. No new dependency is required because Anthropic is already in the repo.
- [x] Provider integrations use existing adapters/contracts where possible. This story is the first real consumer of the new provider-neutral contract.

## Quality Constraints
- [x] TDD-first execution planned with regression tests around the existing Anthropic behavior.
- [ ] Coverage target preserved (>90%).
- [x] File/function size limits respected by separating the adapter, shared loop changes, and tests.
- [x] Type hints and linting gates preserved through strict TypeScript and the repo's actual validation commands.

## Security Constraints
- [x] No hardcoded secrets.
- [x] Input validation plan included. Missing credentials and malformed Anthropic responses fail inside the adapter with actionable errors.
- [x] Error handling avoids secret leakage. Anthropic credentials remain env-based and should never appear in logs.
- [x] External calls include timeout/retry policy. Anthropic timeout and retry defaults remain centralized through the adapter path.

## Performance Constraints
- [x] I/O paths are async where applicable.
- [x] Connection reuse/pooling considered. The Anthropic client remains reusable behind the adapter.
- [x] Expected latency/cost impact documented. The migration should not add a second model round-trip or a duplicated loop.

## Exceptions
- Exception: The generic template references coverage and lint gates beyond the repo's enforced checks.
- Rationale: Shipyard currently validates with tests, typecheck, build, and diff check.
- Approval: Planning artifact only.

## Result
- [x] Constitution check passed
- [ ] Blocking issues identified (list below)

Blocking issues:
- None.
