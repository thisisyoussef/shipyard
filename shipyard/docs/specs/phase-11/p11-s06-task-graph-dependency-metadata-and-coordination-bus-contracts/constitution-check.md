# Constitution Check

- [x] New modules respect SRP and dependency direction. Task graph state,
  coordination messages, file leases, and board projection remain separate
  contracts rather than one overloaded scheduler object.
- [x] Backwards compatibility is planned. The current plan queue and open-project
  board remain available while richer task-graph contracts are introduced.
- [x] Testing strategy covers the change. Dependency ordering, assignment
  changes, lease acquisition, message threading, and projection updates all need
  explicit coverage.
- [x] New dependency risk is bounded. External coordination systems remain
  adapter boundaries, not hard runtime dependencies.
