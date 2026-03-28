# Constitution Check

- [x] New modules respect SRP and dependency direction. Artifact contracts,
  storage, indexing, migration, and query helpers remain separate concerns.
- [x] Backwards compatibility is planned. Existing plan queues, handoffs,
  checkpoints, and traces are normalized or adapted instead of silently
  discarded.
- [x] Testing strategy covers the change. Schema validation, versioning,
  migration, query filters, and artifact persistence all need explicit
  coverage.
- [x] New dependency risk is bounded. The first implementation should prefer
  filesystem plus typed metadata and only add indexing infrastructure if the
  file-backed approach cannot satisfy query needs.
