# Constitution Check

- [x] New modules respect SRP and dependency direction. The planner emits typed artifacts and remains outside the write path.
- [x] Backwards compatibility respected. Trivial or exact-path requests can keep the current lightweight `TaskPlan` behavior.
- [x] Testing strategy covers the change. Contract tests cover schema validation, planner invocation, and planner bypass heuristics.
- [x] New dependency justified and risk-assessed. No new dependency is required for the planner contract itself.
