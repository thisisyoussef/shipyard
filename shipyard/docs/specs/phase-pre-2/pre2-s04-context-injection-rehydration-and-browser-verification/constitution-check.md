# Constitution Check

## Story Context
- Story ID: PRE2-S04
- Story Title: Context Injection, Rehydration, and Browser Verification
- Owner: Codex
- Date: 2026-03-24

## Architecture Constraints
- [x] Clean architecture boundaries preserved. This story finishes behavior at the seams between frontend, backend, and session state rather than inventing a new runtime path.
- [x] New modules respect SRP and dependency direction. Context injection, reconnect behavior, and browser verification remain distinct concerns.
- [x] No net-new boundary violations introduced.

## Technology Constraints
- [x] Uses the existing approved stack unless exception documented.
- [x] New dependency justified and risk-assessed. No new dependency should be needed beyond the runtime/frontend choice already made.
- [x] Provider integrations use existing adapters/contracts where possible. Browser verification exercises the same engine and session paths later phases will use.

## Quality Constraints
- [x] TDD-first execution planned where practical for rehydration and context-payload behavior.
- [ ] Coverage target preserved (>90%).
- [x] File/function size limits respected by keeping verification harnesses and context persistence helpers separate.
- [x] Type hints and linting gates preserved.

## Security Constraints
- [x] No hardcoded secrets.
- [x] Input validation plan included. Injected context payloads remain bounded and explicit.
- [x] Error handling avoids secret/path leakage. Browser verification should surface readable errors, not raw internal dumps by default.
- [x] External calls include timeout/retry policy. The engine retains its own timeout and retry rules.

## Performance Constraints
- [x] I/O paths are async where applicable.
- [x] Connection reuse/pooling considered. Page reloads reconnect to the same session rather than spawning a new one silently.
- [x] Expected latency/cost impact documented. Context injection should be explicit per turn and not bloat every future message accidentally.

## Exceptions
- Exception: The generic template assumes broader enforcement than the repo's current gates.
- Rationale: Shipyard still validates through tests, typecheck, build, and diff check.
- Approval: Planning artifact only.

## Result
- [x] Constitution check passed
- [ ] Blocking issues identified (list below)

Blocking issues:
- None.
