# Constitution Check

## Story Context
- Story ID: P2-S03
- Story Title: Surgical `edit_block` Guardrails
- Owner: Codex
- Date: 2026-03-24

## Architecture Constraints
- [x] Clean architecture boundaries preserved. `edit_block` remains a tool-layer concern and consumes the shared stale-read helpers from P2-S02.
- [x] New modules respect SRP and dependency direction. Helper functions handle counting, previewing, and diff-size checks instead of one monolithic function.
- [x] No net-new boundary violations introduced.

## Technology Constraints
- [x] Uses the existing approved stack unless exception documented.
- [x] New dependency justified and risk-assessed. No new dependency planned.
- [x] Provider integrations use existing adapters/contracts where possible. Not applicable beyond the local tool contract.

## Quality Constraints
- [x] TDD-first execution planned with guardrail failures written before the success path.
- [ ] Coverage target preserved (>90%).
- [x] File/function size limits respected by extracting helper calculations.
- [x] Type hints and linting gates preserved.

## Security Constraints
- [x] No hardcoded secrets.
- [x] Input validation plan included. Empty anchors, missing files, ambiguous anchors, and large rewrites are rejected.
- [x] Error handling avoids secret/path leakage. Preview snippets come from the target file, but only the target-relative path is named.
- [x] External calls include timeout/retry policy. Not applicable for local file edits.

## Performance Constraints
- [x] I/O paths are async where applicable.
- [x] Connection reuse/pooling considered. Not applicable.
- [x] Expected latency/cost impact documented. Re-reading the file before each edit is acceptable for correctness at this stage.

## Exceptions
- Exception: Coverage and lint thresholds in the generic template do not map 1:1 to the current Shipyard gates.
- Rationale: The real gates remain test, typecheck, build, and diff check.
- Approval: Planning artifact only.

## Result
- [x] Constitution check passed
- [ ] Blocking issues identified (list below)

Blocking issues:
- None.
