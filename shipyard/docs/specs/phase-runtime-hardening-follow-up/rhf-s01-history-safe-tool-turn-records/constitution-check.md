# Constitution Check

- [x] The change stays inside replay-history serialization and does not alter the coordinator-only writer model.
- [x] No new dependency is required; existing Anthropic and raw-loop helpers are sufficient.
- [x] TDD coverage is planned for repeated writes, large command output, and failure cases.
- [x] Compact digests preserve enough signal for safe continuation without replaying full raw payloads.
