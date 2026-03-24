# Constitution Check

- [x] New modules respect SRP and dependency direction. Explorer stays read-only and isolated.
- [x] Backwards compatibility respected. No writer path or coordinator behavior changes are implied.
- [x] Testing strategy covers the change. Read-only subagent behavior can be exercised directly.
- [x] New dependency justified and risk-assessed. No new dependency required beyond existing agent/runtime machinery.
