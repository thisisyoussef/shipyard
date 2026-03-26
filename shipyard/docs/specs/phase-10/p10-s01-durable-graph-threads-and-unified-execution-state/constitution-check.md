# Constitution Check

- [x] New modules respect SRP and dependency direction. Thread persistence,
  checkpoint storage, migration, and UI/status projection stay separate rather
  than collapsing into `graph.ts`.
- [x] Backwards compatibility is planned. Legacy sessions, plan queues, and
  handoff artifacts migrate or normalize into the new thread contract instead
  of being discarded.
- [x] Testing strategy covers the change. Graph resume, `plan:` routing,
  `next` / `continue`, interruption, recovery, and migration all require
  explicit coverage before rollout.
- [x] New dependency risk is bounded. If a checkpointer backend is introduced,
  it must stay target-local, deterministic, and optional for lightweight local
  development.
