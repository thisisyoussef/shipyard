# Constitution Check

- [x] New modules respect SRP and dependency direction. Index building,
  storage, retrieval, and wiki summarization remain separate from planner or
  explorer orchestration.
- [x] Backwards compatibility is planned. Broad discovery can fall back to
  today's live file search when no index exists or the index is stale.
- [x] Testing strategy covers the change. Incremental refresh, stale index
  detection, wiki generation, and bounded large-repo behavior all need
  dedicated coverage.
- [x] New dependency risk is bounded. Indexing should prefer repo-owned parsing
  tools and file metadata before adding heavyweight external services.
