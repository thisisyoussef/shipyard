# Constitution Check

## Story Context
- Story ID: P4-S05
- Story Title: Operator Interrupts and Turn Cancellation
- Owner: Codex
- Date: 2026-03-24

## Architecture Constraints
- [x] Clean architecture boundaries preserved. Interrupt handling stays in the
  shared runtime and operator surfaces rather than creating a browser-only or
  terminal-only execution path.
- [x] New modules respect SRP and dependency direction. Terminal signal
  handling, browser cancel transport, turn execution, and subprocess abortion
  remain separate concerns.
- [x] No net-new boundary violations introduced.

## Technology Constraints
- [x] Uses the existing approved stack unless exception documented.
- [x] New dependency justified and risk-assessed. No new dependency is planned;
  the story should rely on existing Node and runtime primitives.
- [x] Provider integrations use existing adapters/contracts where possible.
  Cancellation should thread through the current engine, tool, and tracing
  layers instead of bypassing them.

## Quality Constraints
- [x] TDD-first execution planned for terminal interrupt, browser cancel, and
  cancelled-status propagation.
- [ ] Coverage target preserved (>90%).
- [x] File/function size limits respected by keeping cancellation ownership
  local to the active surface and shared executor.
- [x] Type hints and linting gates preserved through strict TypeScript and the
  repo's real validation commands.

## Security Constraints
- [x] No hardcoded secrets.
- [x] Input validation plan included. Browser `cancel` requests should continue
  to use typed message validation before touching runtime state.
- [x] Error handling avoids secret/path leakage. Cancelled output should be
  status-oriented, not raw exception dumping.
- [x] External calls include timeout/retry policy. Long-running subprocess and
  model work should honor cancellation rather than running unbounded after an
  interrupt.

## Performance Constraints
- [x] I/O paths are async where applicable.
- [x] Connection reuse/pooling considered. Cancellation should reuse the
  existing session/runtime lifetime rather than forcing session restart.
- [x] Expected latency/cost impact documented. Prompt interruption should cut
  wasted work and avoid extra operator restarts.

## Exceptions
- Exception: The generic template references enforcement beyond the repo's
  current documented gates.
- Rationale: Shipyard currently validates with tests, typecheck, build, and
  diff check rather than a separately enforced coverage gate.
- Approval: Planning artifact only.

## Result
- [x] Constitution check passed
- [ ] Blocking issues identified (list below)

Blocking issues:
- None.
