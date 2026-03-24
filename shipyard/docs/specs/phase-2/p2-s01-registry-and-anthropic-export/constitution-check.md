# Constitution Check

## Story Context
- Story ID: P2-S01
- Story Title: Registry and Anthropic Tool Export
- Owner: Codex
- Date: 2026-03-24

## Architecture Constraints
- [x] Clean architecture boundaries preserved. The registry stays in `shipyard/src/tools/registry.ts`, while each tool continues to own its own execution logic.
- [x] New modules respect SRP and dependency direction. Tool files only know how to register themselves; the code phase consumes registry output instead of hard-coding tool imports.
- [x] No net-new boundary violations introduced.

## Technology Constraints
- [x] Uses the existing approved stack. No new dependency is needed for the registry or schema projection.
- [x] New dependency justified and risk-assessed. No net-new dependency planned.
- [x] Provider integrations use existing adapters/contracts where possible. Anthropic formatting is produced from local metadata instead of adding a provider SDK.

## Quality Constraints
- [x] TDD-first execution planned through focused registry tests before code-phase rewiring.
- [ ] Coverage target preserved (>90%).
- [x] File/function size limits respected by keeping registry helpers and projection logic small.
- [x] Type hints and linting gates preserved through strict TypeScript and the repo's actual validation set.

## Security Constraints
- [x] No hardcoded secrets.
- [x] Input validation plan included via schema-driven definitions and duplicate-registration checks.
- [x] Error handling avoids secret/path leakage because registry failures are name-based and local.
- [x] External calls include timeout/retry policy. No external network call is introduced in this story.

## Performance Constraints
- [x] I/O paths are async where applicable. Registry helpers are in-memory only.
- [x] Connection reuse/pooling considered. Not applicable for this story.
- [x] Expected latency/cost impact documented. Registry lookup stays O(1) by name.

## Exceptions
- Exception: The generic template references `>90%` coverage and lint gates that Shipyard does not currently enforce.
- Rationale: The real repo gates are `pnpm --dir shipyard test`, `typecheck`, `build`, and `git diff --check`.
- Approval: Planning artifact only; implementation still adds focused Vitest coverage.

## Result
- [x] Constitution check passed
- [ ] Blocking issues identified (list below)

Blocking issues:
- None.
