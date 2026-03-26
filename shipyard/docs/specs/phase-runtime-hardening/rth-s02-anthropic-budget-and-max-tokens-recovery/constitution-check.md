# Constitution Check

- [x] New modules respect SRP and dependency direction. Anthropic config, stop-reason handling, and loop recovery stay provider/runtime concerns rather than leaking into tool implementations.
- [x] Backwards compatibility respected. Existing request helpers remain the single Anthropic integration surface even as defaults and recovery paths evolve.
- [x] Testing strategy covers the change. Config resolution, `max_tokens` handling, and timeout/error reporting need focused runtime tests.
- [x] New dependency justified and risk-assessed. No new dependency is required; the existing Anthropic SDK and runtime contracts are sufficient.
