# Constitution Check

- [x] New modules respect SRP and dependency direction. Memory storage,
  retrieval, compaction, and prompt assembly remain separate concerns.
- [x] Backwards compatibility is planned. Existing context sources like target
  rules, uploads, and handoffs remain usable while the layered retrieval model
  takes over.
- [x] Testing strategy covers the change. Retrieval selection, compaction,
  targeted guidance injection, and trace visibility all require explicit tests.
- [x] New dependency risk is bounded. Retrieval and summarization should use
  repo-owned artifacts first and avoid external services as mandatory runtime
  dependencies.
