# Constitution Check

- [x] New modules respect SRP and dependency direction. TDD stage orchestration,
  handoff storage, RED/GREEN guards, and optional mutation or property-test
  hooks stay separate.
- [x] Backwards compatibility is planned. Existing direct-turn execution remains
  available while the richer TDD runtime lane is introduced explicitly.
- [x] Testing strategy covers the change. Stage isolation, retry caps, contract
  enforcement, and handoff persistence all need explicit coverage.
- [x] New dependency risk is bounded. Property or mutation hooks remain optional
  adapters rather than hard requirements for every repo.
