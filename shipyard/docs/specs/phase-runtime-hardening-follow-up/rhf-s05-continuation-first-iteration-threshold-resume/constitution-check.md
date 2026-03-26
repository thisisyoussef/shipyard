# Constitution Check

- [x] The story extends the existing handoff flow instead of inventing a second retry or memory system.
- [x] No new dependency is required; raw-loop, graph, and turn orchestration already own this control path.
- [x] TDD coverage is planned for threshold hits, auto-resume, and failure-vs-continuation separation.
- [x] The design preserves explicit failure semantics for genuine runtime errors.
