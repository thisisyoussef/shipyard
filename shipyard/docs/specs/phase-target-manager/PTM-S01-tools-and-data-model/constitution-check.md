# Constitution Check

- [x] New modules respect SRP and dependency direction. Each tool is a single file with a focused responsibility. Profile IO is separated from tools.
- [x] Backwards compatibility respected. No existing CLI arguments, REPL commands, or session state contracts are changed. `targetProfile` is an optional addition to `SessionState`.
- [x] Testing strategy covers the change. Unit tests for each tool, integration test for create+enrich flow, mocked Claude for enrichment.
- [x] New dependency justified and risk-assessed. No new dependencies. Scaffold templates are static strings. Enrichment uses the existing Anthropic client.
