# Constitution Check

## Story Context
- Story ID: P3-S02
- Story Title: Raw Claude Tool Loop
- Owner: Codex
- Date: 2026-03-24

## Architecture Constraints
- [x] Clean architecture boundaries preserved. The raw loop lives in `shipyard/src/engine/raw-loop.ts` and consumes the Phase 2 registry plus the P3-S01 Claude client helpers.
- [x] New modules respect SRP and dependency direction. The loop owns turn orchestration, not tool implementation or prompt authoring.
- [x] No net-new boundary violations introduced.

## Technology Constraints
- [x] Uses the existing approved stack unless exception documented.
- [x] New dependency justified and risk-assessed. No new dependency beyond P3-S01 is expected.
- [x] Provider integrations use existing adapters/contracts where possible. The loop uses the Anthropic client helper and Phase 2 registry output rather than calling provider SDK methods ad hoc.

## Quality Constraints
- [x] TDD-first execution planned for loop termination, tool execution, and logging boundaries.
- [ ] Coverage target preserved (>90%).
- [x] File/function size limits respected by factoring message-history mutation and logging helpers.
- [x] Type hints and linting gates preserved.

## Security Constraints
- [x] No hardcoded secrets.
- [x] Input validation plan included. Unknown tool names, missing tool definitions, and iteration overruns return safe failures.
- [x] Error handling avoids secret/path leakage. Console logging truncates inputs and outputs.
- [x] External calls include timeout/retry policy through the shared Claude client.

## Performance Constraints
- [x] I/O paths are async where applicable.
- [x] Connection reuse/pooling considered. The loop should reuse the Claude client across iterations.
- [x] Expected latency/cost impact documented. The loop caps iterations at 25 to prevent unbounded spend or infinite tool cycles.

## Exceptions
- Exception: The generic coverage and lint expectations are stricter than the repo's currently enforced gates.
- Rationale: The real validation set remains test, typecheck, build, and diff check.
- Approval: Planning artifact only.

## Result
- [x] Constitution check passed
- [ ] Blocking issues identified (list below)

Blocking issues:
- None.
