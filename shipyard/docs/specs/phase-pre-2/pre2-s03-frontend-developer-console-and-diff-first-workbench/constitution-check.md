# Constitution Check

## Story Context
- Story ID: PRE2-S03
- Story Title: Frontend Developer Console and Diff-First Workbench
- Owner: Codex
- Date: 2026-03-24

## Architecture Constraints
- [x] Clean architecture boundaries preserved. The frontend renders socket-driven state and never re-implements engine behavior.
- [x] New modules respect SRP and dependency direction. Layout, event presentation, and chat input remain separate concerns.
- [x] No net-new boundary violations introduced.

## Technology Constraints
- [x] Uses the existing approved stack unless exception documented.
- [x] New dependency justified and risk-assessed. React and its local build path are justified because the UI becomes a core operator surface.
- [x] Provider integrations use existing adapters/contracts where possible. The frontend consumes the WebSocket contract from PRE2-S01/PRE2-S02 without inventing a second protocol.

## Quality Constraints
- [x] TDD-first execution planned for event rendering, panel layout state, and reconnect behavior where practical.
- [ ] Coverage target preserved (>90%).
- [x] File/function size limits respected by splitting panels and event-list components.
- [x] Type hints and linting gates preserved.

## Security Constraints
- [x] No hardcoded secrets.
- [x] Input validation plan included. User-entered context and instructions are sanitized or bounded before submission.
- [x] Error handling avoids secret/path leakage. The frontend shows summarized agent errors, not raw stack traces by default.
- [x] External calls include timeout/retry policy. Socket reconnect behavior should be bounded and visible.

## Performance Constraints
- [x] I/O paths are async where applicable.
- [x] Connection reuse/pooling considered. One socket connection per tab is the default.
- [x] Expected latency/cost impact documented. The UI should stream incremental events and virtualize or collapse older details instead of repainting giant transcripts.

## Exceptions
- Exception: The generic template references broader enforcement than the repo currently runs.
- Rationale: The real validation set remains tests, typecheck, build, and diff check.
- Approval: Planning artifact only.

## Result
- [x] Constitution check passed
- [ ] Blocking issues identified (list below)

Blocking issues:
- None.
