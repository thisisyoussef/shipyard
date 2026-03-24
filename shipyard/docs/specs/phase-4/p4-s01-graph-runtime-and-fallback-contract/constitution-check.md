# Constitution Check

## Story Context
- Story ID: P4-S01
- Story Title: Graph Runtime and Fallback Contract
- Owner: Codex
- Date: 2026-03-24

## Architecture Constraints
- [x] Clean architecture boundaries preserved. State-machine logic stays in `shipyard/src/engine/` and consumes context, tools, and tracing helpers instead of re-implementing them.
- [x] New modules respect SRP and dependency direction. Node functions own planning/acting/verifying/recovering/responding behavior, while shared helpers own prompt assembly or checkpointing.
- [x] No net-new boundary violations introduced.

## Technology Constraints
- [x] Uses the existing approved stack unless exception documented.
- [x] New dependency justified and risk-assessed. No new dependency is expected because LangGraph and LangSmith are already installed.
- [x] Provider integrations use existing adapters/contracts where possible. The graph should consume the Phase 3 Claude/runtime layer rather than reaching directly into Anthropic primitives from every node.

## Quality Constraints
- [x] TDD-first execution planned for graph routing and fallback behavior.
- [ ] Coverage target preserved (>90%).
- [x] File/function size limits respected by splitting node helpers, route selectors, and state assembly functions.
- [x] Type hints and linting gates preserved through strict TypeScript and the repo's actual validation commands.

## Security Constraints
- [x] No hardcoded secrets.
- [x] Input validation plan included. The runtime should fail clearly on missing engine configuration or unsupported tools.
- [x] Error handling avoids secret leakage. Traces and logs should not include API keys or unbounded tool outputs.
- [x] External calls include timeout/retry policy. Model invocation continues to rely on the shared Claude client configuration from Phase 3.

## Performance Constraints
- [x] I/O paths are async where applicable.
- [x] Connection reuse/pooling considered. One model client should serve the graph invocation.
- [x] Expected latency/cost impact documented. The graph should reuse state across nodes and preserve the raw-loop fallback when LangGraph overhead is not paying for itself.

## Exceptions
- Exception: The generic template references coverage and lint gates beyond the repo's enforced checks.
- Rationale: Shipyard currently validates with tests, typecheck, build, and diff check.
- Approval: Planning artifact only.

## Result
- [x] Constitution check passed
- [ ] Blocking issues identified (list below)

Blocking issues:
- None.
