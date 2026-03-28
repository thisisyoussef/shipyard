# Constitution Check

- [x] New modules respect SRP and dependency direction. Phase definitions,
  pipeline execution, approval policy, and artifact editing remain separate
  layers instead of collapsing into `turn.ts`.
- [x] Backwards compatibility is planned. Existing single-turn, `plan:`, and
  `next` / `continue` flows continue working while pipeline mode is introduced.
- [x] Testing strategy covers the change. Pause/resume, approve, reject, edit,
  skip, and previous-phase return paths all require explicit coverage.
- [x] New dependency risk is bounded. The pipeline runner should build on the
  existing session, thread, and artifact model rather than requiring a new
  external workflow service.
