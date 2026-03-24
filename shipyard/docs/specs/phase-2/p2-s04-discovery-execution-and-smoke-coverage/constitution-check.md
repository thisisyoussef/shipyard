# Constitution Check

## Story Context
- Story ID: P2-S04
- Story Title: Discovery, Execution, and Smoke Coverage
- Owner: Codex
- Date: 2026-03-24

## Architecture Constraints
- [x] Clean architecture boundaries preserved. Read-only discovery tools stay isolated from write tools, and the manual smoke script remains outside the LLM runtime loop.
- [x] New modules respect SRP and dependency direction. Each tool still does one thing, and the smoke script orchestrates them without becoming product runtime code.
- [x] No net-new boundary violations introduced.

## Technology Constraints
- [x] Uses the existing approved stack unless exception documented.
- [x] New dependency justified and risk-assessed. No new dependency planned.
- [x] Provider integrations use existing adapters/contracts where possible. `git_diff` shells out to local git instead of adding a git library.

## Quality Constraints
- [x] TDD-first execution planned for `list_files`, `search_files`, `run_command`, and `git_diff`, with the smoke script added after the focused tests are green.
- [ ] Coverage target preserved (>90%).
- [x] File/function size limits respected by keeping shell helpers shared and tool-specific logic small.
- [x] Type hints and linting gates preserved.

## Security Constraints
- [x] No hardcoded secrets.
- [x] Input validation plan included. Depth and timeout values are bounded, and command output is clipped.
- [x] Error handling avoids secret/path leakage by converting output paths back to target-relative form.
- [x] External calls include timeout/retry policy. `run_command` enforces timeouts; `git_diff` reuses bounded command execution.

## Performance Constraints
- [x] I/O paths are async where applicable.
- [x] Connection reuse/pooling considered. Not applicable.
- [x] Expected latency/cost impact documented. Search and command outputs are intentionally clipped or filtered to stay token-cheap.

## Exceptions
- Exception: The generic template's coverage and lint expectations are stricter than the current Shipyard repo gates.
- Rationale: Existing enforced validation is tests, typecheck, build, and diff check.
- Approval: Planning artifact only.

## Result
- [x] Constitution check passed
- [ ] Blocking issues identified (list below)

Blocking issues:
- None.
