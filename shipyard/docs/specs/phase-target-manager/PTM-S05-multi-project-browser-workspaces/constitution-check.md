# Constitution Check

- [x] New modules respect SRP and dependency direction. The plan keeps per-target
  runtime orchestration on the UI server side, preserves target-manager tools as
  the creation/opening boundary, and limits React changes to view models and new
  project-board components.
- [x] Backwards compatibility is planned. Existing single-target `--target`
  startup still works, CLI target flows stay unchanged, and the browser keeps a
  single writer per target by deduping one open runtime per target path.
- [x] Testing strategy covers the change. The story adds RED coverage for
  runtime multiplexing, active-project snapshot routing, and browser rendering
  before implementation.
- [x] New dependency risk is bounded. No new dependencies are required; the
  change builds on the existing session model, preview supervisor, WebSocket
  contracts, and React workbench shell.
