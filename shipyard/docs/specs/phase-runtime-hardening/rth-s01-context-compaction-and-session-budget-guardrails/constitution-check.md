# Constitution Check

- [x] New modules respect SRP and dependency direction. History compaction, summary budgeting, and envelope serialization can be isolated from tool execution and provider transport.
- [x] Backwards compatibility respected. Current tool semantics and recent-turn continuity remain intact while only stale history is compacted.
- [x] Testing strategy covers the change. Repeated-write raw-loop tests, turn-summary tests, and context-envelope budget tests are required.
- [x] New dependency justified and risk-assessed. No new dependency is required; the story should build on existing session, handoff, and tracing patterns.
