# Constitution Check

- [x] New modules respect SRP and dependency direction. Persistence handling
  stays at the hosted-workspace/bootstrap boundary instead of leaking storage
  concerns into the agent graph or tool prompts.
- [x] Backwards compatibility respected. Local Shipyard use still works without
  a mounted volume; hosted persistence only applies when the hosted workspace
  path is configured for deployment.
- [x] Testing strategy covers the change. Workspace restore, restart
  continuity, and misconfigured-volume behavior all have explicit coverage.
- [x] New dependency justified and risk-assessed. Railway volume-backed
  filesystem persistence should not require a new object-storage dependency in
  the first pass.
