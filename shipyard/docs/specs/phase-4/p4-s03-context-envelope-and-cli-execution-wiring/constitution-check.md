# Constitution Check

## Story Context
- Story ID: P4-S03
- Story Title: Context Envelope and CLI Execution Wiring
- Owner: Codex
- Date: 2026-03-24

## Architecture Constraints
- [x] Clean architecture boundaries preserved. Context assembly stays under `shipyard/src/context/`, while the CLI and engine consume the serialized envelope rather than rebuilding prompt text in multiple places.
- [x] New modules respect SRP and dependency direction. The CLI should gather inputs and persist session state, not own orchestration logic.
- [x] No net-new boundary violations introduced.

## Technology Constraints
- [x] Uses the existing approved stack unless exception documented.
- [x] New dependency justified and risk-assessed. No new dependency planned.
- [x] Provider integrations use existing adapters/contracts where possible. Prompt composition should reuse the code-phase prompt plus serialized envelope rather than inventing a separate prompt path.

## Quality Constraints
- [x] TDD-first execution planned for envelope serialization and CLI-to-engine handoff behavior.
- [ ] Coverage target preserved (>90%).
- [x] File/function size limits respected by separating envelope assembly from serialization.
- [x] Type hints and linting gates preserved.

## Security Constraints
- [x] No hardcoded secrets.
- [x] Input validation plan included. Missing `AGENTS.md` or missing injected context should degrade gracefully.
- [x] Error handling avoids secret/path leakage. Prompt serialization should remain target-relative and summary-based.
- [x] External calls include timeout/retry policy. Runtime model invocation still delegates to the shared engine layer.

## Performance Constraints
- [x] I/O paths are async where applicable.
- [x] Connection reuse/pooling considered. Not applicable for envelope assembly itself.
- [x] Expected latency/cost impact documented. The serialized envelope should be structured and bounded rather than dumping raw session internals indiscriminately.

## Exceptions
- Exception: The generic template assumes broader enforcement than the repo currently runs.
- Rationale: Shipyard's actual gates are test, typecheck, build, and diff check.
- Approval: Planning artifact only.

## Result
- [x] Constitution check passed
- [ ] Blocking issues identified (list below)

Blocking issues:
- None.
