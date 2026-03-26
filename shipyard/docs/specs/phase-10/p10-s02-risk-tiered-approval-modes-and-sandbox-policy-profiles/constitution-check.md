# Constitution Check

- [x] New modules respect SRP and dependency direction. Policy evaluation,
  approval storage, tool enforcement, and UI prompts remain distinct layers.
- [x] Backwards compatibility is planned. A clearly labeled permissive local
  profile can preserve today's development ergonomics while safer defaults
  roll out.
- [x] Testing strategy covers the change. Policy classification, approval
  interruption, resume behavior, redaction, and risky-command handling all need
  focused tests.
- [x] New dependency risk is bounded. Sandboxing adapters must sit behind typed
  interfaces so local-only development does not depend on one provider or one
  container runtime.
