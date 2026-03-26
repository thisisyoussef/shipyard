# Constitution Check

- [x] New modules respect SRP and dependency direction. Job orchestration,
  artifact retention, readiness scoring, and UI projection remain separate
  layers.
- [x] Backwards compatibility is planned. Existing preview and deploy flows can
  project into the job model without breaking their current contracts.
- [x] Testing strategy covers the change. Job lifecycle, retention, readiness
  scoring, and UI projection all need explicit coverage.
- [x] New dependency risk is bounded. Event delivery should reuse the shipped
  WebSocket and trace infrastructure before adding another transport layer.
