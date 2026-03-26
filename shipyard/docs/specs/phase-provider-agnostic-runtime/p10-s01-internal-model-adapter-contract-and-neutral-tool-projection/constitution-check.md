# Constitution Check

## Story Context
- Story ID: P10-S01
- Story Title: Internal Model Adapter Contract and Neutral Tool Projection
- Owner: Codex
- Date: 2026-03-26

## Architecture Constraints
- [x] Clean architecture boundaries preserved. The new provider-neutral contract lives in engine/runtime modules and does not leak provider specifics into tools.
- [x] New modules respect SRP and dependency direction. Registry code stays generic while adapters own provider-specific wire projection.
- [x] No net-new boundary violations introduced.

## Technology Constraints
- [x] Uses the existing approved stack unless exception documented.
- [x] New dependency justified and risk-assessed. No new dependency is required for this contract-only story.
- [x] Provider integrations use existing adapters/contracts where possible. The new boundary is introduced so later provider adapters reuse one internal contract.

## Quality Constraints
- [x] TDD-first execution planned with contract and registry tests before provider migration.
- [ ] Coverage target preserved (>90%).
- [x] File/function size limits respected by splitting the contract, registry cleanup, and tests.
- [x] Type hints and linting gates preserved through strict TypeScript and the repo's actual validation commands.

## Security Constraints
- [x] No hardcoded secrets.
- [x] Input validation plan included. Contract normalization should reject malformed tool results clearly.
- [x] Error handling avoids secret leakage. This story does not widen secret surfaces.
- [x] External calls include timeout/retry policy. Not applicable in this contract-only story.

## Performance Constraints
- [x] I/O paths are async where applicable.
- [x] Connection reuse/pooling considered. This story does not create provider clients yet.
- [x] Expected latency/cost impact documented. Tool projection remains local and synchronous.

## Exceptions
- Exception: The generic template references coverage and lint gates beyond the repo's enforced checks.
- Rationale: Shipyard currently validates with tests, typecheck, build, and diff check.
- Approval: Planning artifact only.

## Result
- [x] Constitution check passed
- [ ] Blocking issues identified (list below)

Blocking issues:
- None.
