# Constitution Check

## Story Context
- Story ID: P4-S02
- Story Title: Checkpointing and Recovery Flow
- Owner: Codex
- Date: 2026-03-24

## Architecture Constraints
- [x] Clean architecture boundaries preserved. Checkpoint behavior stays under `shipyard/src/checkpoints/` and graph recovery consumes it rather than embedding filesystem rollback logic in node bodies.
- [x] New modules respect SRP and dependency direction. `CheckpointManager` owns checkpoint lookup/restore, while the recover node owns retry policy.
- [x] No net-new boundary violations introduced.

## Technology Constraints
- [x] Uses the existing approved stack unless exception documented.
- [x] New dependency justified and risk-assessed. No new dependency planned.
- [x] Provider integrations use existing adapters/contracts where possible. Not applicable beyond local runtime contracts.

## Quality Constraints
- [x] TDD-first execution planned around checkpoint creation, latest-restore selection, and retry-blocking behavior.
- [ ] Coverage target preserved (>90%).
- [x] File/function size limits respected by keeping path resolution, timestamp naming, and restore selection in helpers.
- [x] Type hints and linting gates preserved.

## Security Constraints
- [x] No hardcoded secrets.
- [x] Input validation plan included. Only target-relative file paths should be checkpointed or restored.
- [x] Error handling avoids secret/path leakage. Checkpoint outputs should remain target-relative or session-relative.
- [x] External calls include timeout/retry policy. Not applicable for local file operations.

## Performance Constraints
- [x] I/O paths are async where applicable.
- [x] Connection reuse/pooling considered. Not applicable.
- [x] Expected latency/cost impact documented. Checkpoint copies happen only before edits and are intentionally simple.

## Exceptions
- Exception: The generic template references broader enforcement than the repo currently has.
- Rationale: The real repo gates remain tests, typecheck, build, and diff check.
- Approval: Planning artifact only.

## Result
- [x] Constitution check passed
- [ ] Blocking issues identified (list below)

Blocking issues:
- None.
