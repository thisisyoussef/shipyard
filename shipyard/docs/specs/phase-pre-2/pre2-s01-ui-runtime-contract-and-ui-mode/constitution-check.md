# Constitution Check

## Story Context
- Story ID: PRE2-S01
- Story Title: UI Runtime Contract and `--ui` Mode
- Owner: Codex
- Date: 2026-03-24

## Architecture Constraints
- [x] Clean architecture boundaries preserved. The UI server is an alternate interface over the existing engine, not a second application with its own business logic.
- [x] New modules respect SRP and dependency direction. CLI argument parsing, HTTP serving, WebSocket messaging, and browser rendering remain separate concerns.
- [x] No net-new boundary violations introduced.

## Technology Constraints
- [x] Uses the existing approved stack unless exception documented.
- [x] New dependency justified and risk-assessed. React, a small SPA build tool, and a local HTTP/WebSocket server are justified because the UI becomes a core operator surface.
- [x] Provider integrations use existing adapters/contracts where possible. The UI runtime consumes the same engine and session state, not a parallel agent implementation.

## Quality Constraints
- [x] TDD-first execution planned for CLI mode selection and message-contract validation.
- [ ] Coverage target preserved (>90%).
- [x] File/function size limits respected by splitting runtime selection, server boot, and socket message typing.
- [x] Type hints and linting gates preserved through strict TypeScript and the repo's real validation commands.

## Security Constraints
- [x] No hardcoded secrets.
- [x] Input validation plan included. WebSocket payloads must be typed and validated before the engine consumes them.
- [x] Error handling avoids secret/path leakage. Browser-visible errors stay summary-based.
- [x] External calls include timeout/retry policy. Not applicable beyond the underlying engine calls.

## Performance Constraints
- [x] I/O paths are async where applicable.
- [x] Connection reuse/pooling considered. The UI server should reuse the same session/engine lifetime instead of spawning per-event workers.
- [x] Expected latency/cost impact documented. WebSocket streaming should prefer small incremental events over full-state snapshots for every action.

## Exceptions
- Exception: The generic template references enforcement beyond the repo's actual gates.
- Rationale: Shipyard currently validates with tests, typecheck, build, and diff check.
- Approval: Planning artifact only.

## Result
- [x] Constitution check passed
- [ ] Blocking issues identified (list below)

Blocking issues:
- None.
