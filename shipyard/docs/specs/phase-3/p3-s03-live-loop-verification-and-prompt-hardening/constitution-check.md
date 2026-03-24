# Constitution Check

## Story Context
- Story ID: P3-S03
- Story Title: Live Loop Verification and Prompt Hardening
- Owner: Codex
- Date: 2026-03-24

## Architecture Constraints
- [x] Clean architecture boundaries preserved. Live verification uses the raw loop and prompt modules; it does not change tool internals unless a prompt failure exposes a true tool bug.
- [x] New modules respect SRP and dependency direction. The verification harness owns scenario setup while prompt files own instruction tuning.
- [x] No net-new boundary violations introduced.

## Technology Constraints
- [x] Uses the existing approved stack unless exception documented.
- [x] New dependency justified and risk-assessed. No new dependency is required for the live verification harness.
- [x] Provider integrations use existing adapters/contracts where possible. Live verification exercises the real Anthropic path from P3-S01/P3-S02.

## Quality Constraints
- [x] TDD-first execution planned where practical for local harness helpers; the live Claude scenarios are the final acceptance gate.
- [ ] Coverage target preserved (>90%).
- [x] File/function size limits respected by keeping test-fixture setup and byte-diff checks in helpers or scripts.
- [x] Type hints and linting gates preserved.

## Security Constraints
- [x] No hardcoded secrets.
- [x] Input validation plan included. Live verification should fail fast when `ANTHROPIC_API_KEY` is missing.
- [x] Error handling avoids secret/path leakage. Logs and transcripts should not print credentials.
- [x] External calls include timeout/retry policy through the shared Claude client.

## Performance Constraints
- [x] I/O paths are async where applicable.
- [x] Connection reuse/pooling considered. One Claude client should serve the scenario run.
- [x] Expected latency/cost impact documented. The scenarios use small fixtures and a short tool list to keep token and cost usage low.

## Exceptions
- Exception: Live Claude verification cannot be a mandatory always-on CI gate without secrets and budget.
- Rationale: This story should provide an opt-in harness or smoke path with clear prerequisites instead of assuming CI access to Anthropic.
- Approval: Planning artifact only.

## Result
- [x] Constitution check passed
- [ ] Blocking issues identified (list below)

Blocking issues:
- None.
