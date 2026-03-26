# Constitution Check

## Story Context
- Story ID: P10-S05
- Story Title: Provider-Neutral Test Harness and Contract Migration
- Owner: Codex
- Date: 2026-03-26

## Architecture Constraints
- [x] Clean architecture boundaries preserved. Broad tests move to the internal adapter seam while provider-specific contract suites remain isolated.
- [x] New modules respect SRP and dependency direction. Shared test helpers own fake adapter behavior; adapter suites own provider wire-format assertions.
- [x] No net-new boundary violations introduced.

## Technology Constraints
- [x] Uses the existing approved stack unless exception documented.
- [x] New dependency justified and risk-assessed. No new dependency is required for the test migration.
- [x] Provider integrations use existing adapters/contracts where possible. Test seams mirror the same internal adapter contract used in production.

## Quality Constraints
- [x] TDD-first execution planned with behavior-preserving migrations and focused helper coverage.
- [ ] Coverage target preserved (>90%).
- [x] File/function size limits respected by centralizing fake adapter helpers instead of repeating fixtures everywhere.
- [x] Type hints and linting gates preserved through strict TypeScript and the repo's actual validation commands.

## Security Constraints
- [x] No hardcoded secrets.
- [x] Input validation plan included. Fake adapters should be able to simulate malformed normalized results safely in tests.
- [x] Error handling avoids secret leakage. Tests should not require live provider credentials.
- [x] External calls include timeout/retry policy. Broad tests should avoid live provider calls entirely.

## Performance Constraints
- [x] I/O paths are async where applicable.
- [x] Connection reuse/pooling considered. Test helpers should avoid constructing real provider clients unless a focused contract suite requires it.
- [x] Expected latency/cost impact documented. Broad tests should become cheaper and more deterministic once they use fake adapters.

## Exceptions
- Exception: The generic template references coverage and lint gates beyond the repo's enforced checks.
- Rationale: Shipyard currently validates with tests, typecheck, build, and diff check.
- Approval: Planning artifact only.

## Result
- [x] Constitution check passed
- [ ] Blocking issues identified (list below)

Blocking issues:
- None.
