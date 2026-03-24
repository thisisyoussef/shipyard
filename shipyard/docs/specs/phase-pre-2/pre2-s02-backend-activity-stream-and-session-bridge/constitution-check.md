# Constitution Check

## Story Context
- Story ID: PRE2-S02
- Story Title: Backend Activity Stream and Session Bridge
- Owner: Codex
- Date: 2026-03-24

## Architecture Constraints
- [x] Clean architecture boundaries preserved. Backend streaming wraps the existing engine/tool flow rather than embedding UI concerns inside tools.
- [x] New modules respect SRP and dependency direction. The socket bridge emits events, while the engine continues to own task execution.
- [x] No net-new boundary violations introduced.

## Technology Constraints
- [x] Uses the existing approved stack unless exception documented.
- [x] New dependency justified and risk-assessed. Only the chosen HTTP/WebSocket stack from PRE2-S01 is expected.
- [x] Provider integrations use existing adapters/contracts where possible. Event emission should attach to current tool/engine boundaries instead of replacing them.

## Quality Constraints
- [x] TDD-first execution planned for event emission and session-state snapshots.
- [ ] Coverage target preserved (>90%).
- [x] File/function size limits respected by isolating event formatting helpers from runtime execution logic.
- [x] Type hints and linting gates preserved.

## Security Constraints
- [x] No hardcoded secrets.
- [x] Input validation plan included. Browser-issued instructions and status requests remain typed.
- [x] Error handling avoids secret/path leakage. Tool/result summaries are truncated before sending to the browser.
- [x] External calls include timeout/retry policy. The socket bridge reuses engine policies rather than inventing new ones.

## Performance Constraints
- [x] I/O paths are async where applicable.
- [x] Connection reuse/pooling considered. A single socket session should stream multiple turns.
- [x] Expected latency/cost impact documented. Stream deltas are smaller and cheaper than replaying full session transcripts on every change.

## Exceptions
- Exception: The generic template assumes broader enforcement than the repo currently runs.
- Rationale: The actual repo gates remain tests, typecheck, build, and diff check.
- Approval: Planning artifact only.

## Result
- [x] Constitution check passed
- [ ] Blocking issues identified (list below)

Blocking issues:
- None.
