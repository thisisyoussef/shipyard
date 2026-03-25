# Constitution Check

- [x] New modules respect SRP and dependency direction. Plan storage, task selection, and active-task context remain distinct concerns.
- [x] Backwards compatibility respected. Normal instructions continue to work; `next` / `continue` are additive operator commands.
- [x] Testing strategy covers the change. Selection, persistence, failure handling, and status transitions all have explicit coverage.
- [x] New dependency justified and risk-assessed. No new dependencies are required.
