# Constitution Check

- [x] New modules respect SRP and dependency direction. The fast path stays inside coordinator/runtime/tracing surfaces and does not widen tool or provider boundaries.
- [x] Backwards compatibility respected. Broad, ambiguous, or multi-file work still falls back to the existing raw-loop and verifier subagent path.
- [x] Testing strategy covers the change. Focused graph, live-verification, and LangSmith tracing tests will guard routing, deterministic verification, and trace lookup behavior.
- [x] New dependency justified and risk-assessed. No new dependency is required; the story reuses existing model adapters, tool functions, and tracing helpers.
