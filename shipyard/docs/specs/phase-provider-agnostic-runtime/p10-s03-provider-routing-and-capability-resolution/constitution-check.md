# Constitution Check

## Story Context
- Story ID: P10-S03
- Story Title: Provider Routing and Capability Resolution
- Owner: Codex
- Date: 2026-03-26

## Architecture Constraints
- [x] Clean architecture boundaries preserved. Phases and helpers declare routing intent while the resolver owns provider/model selection.
- [x] New modules respect SRP and dependency direction. Capability and route resolution stay centralized instead of spreading env parsing across features.
- [x] No net-new boundary violations introduced.

## Technology Constraints
- [x] Uses the existing approved stack unless exception documented.
- [x] New dependency justified and risk-assessed. No new dependency is required for routing and capability resolution.
- [x] Provider integrations use existing adapters/contracts where possible. Routing builds on the provider-neutral contract introduced earlier in the pack.

## Quality Constraints
- [x] TDD-first execution planned with route-resolution and capability tests before broad provider rollout.
- [ ] Coverage target preserved (>90%).
- [x] File/function size limits respected by separating resolver logic, phase config, and tests.
- [x] Type hints and linting gates preserved through strict TypeScript and the repo's actual validation commands.

## Security Constraints
- [x] No hardcoded secrets.
- [x] Input validation plan included. Invalid provider IDs or incomplete route config fail before execution.
- [x] Error handling avoids secret leakage. Missing credentials are surfaced as provider-aware diagnostics without echoing secret values.
- [x] External calls include timeout/retry policy. Not applicable in this config-resolution story.

## Performance Constraints
- [x] I/O paths are async where applicable.
- [x] Connection reuse/pooling considered. Routing resolution occurs before provider execution and does not change client reuse strategy.
- [x] Expected latency/cost impact documented. Route resolution should be constant-time compared with model execution.

## Exceptions
- Exception: The generic template references coverage and lint gates beyond the repo's enforced checks.
- Rationale: Shipyard currently validates with tests, typecheck, build, and diff check.
- Approval: Planning artifact only.

## Result
- [x] Constitution check passed
- [ ] Blocking issues identified (list below)

Blocking issues:
- None.
