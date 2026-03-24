# Constitution Check

## Story Context
- Story ID: P2-S02
- Story Title: Safe Relative File IO
- Owner: Codex
- Date: 2026-03-24

## Architecture Constraints
- [x] Clean architecture boundaries preserved. Shared path resolution and read-hash tracking stay inside the tool layer.
- [x] New modules respect SRP and dependency direction. `read_file` and `write_file` own file IO while `edit_block` consumes the shared helpers later.
- [x] No net-new boundary violations introduced.

## Technology Constraints
- [x] Uses the existing approved stack unless exception documented.
- [x] New dependency justified and risk-assessed. No new dependency planned.
- [x] Provider integrations use existing adapters/contracts where possible. Not applicable beyond the local tool contract.

## Quality Constraints
- [x] TDD-first execution planned.
- [ ] Coverage target preserved (>90%).
- [x] File/function size limits respected by extracting shared path/hash helpers instead of growing one large file.
- [x] Type hints and linting gates preserved.

## Security Constraints
- [x] No hardcoded secrets.
- [x] Input validation plan included. Both tools reject absolute and escaping paths.
- [x] Error handling avoids secret/path leakage by reporting only target-relative paths.
- [x] External calls include timeout/retry policy. Not applicable for local file IO.

## Performance Constraints
- [x] I/O paths are async where applicable.
- [x] Connection reuse/pooling considered. Not applicable.
- [x] Expected latency/cost impact documented. Hashing is linear in file size and only happens on read/write.

## Exceptions
- Exception: The generic coverage and lint expectations are stronger than the repo's current enforced gates.
- Rationale: Shipyard currently validates with tests, typecheck, build, and diff check.
- Approval: Planning artifact only.

## Result
- [x] Constitution check passed
- [ ] Blocking issues identified (list below)

Blocking issues:
- None.
