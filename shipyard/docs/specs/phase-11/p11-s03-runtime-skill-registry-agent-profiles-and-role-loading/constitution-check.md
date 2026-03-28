# Constitution Check

- [x] New modules respect SRP and dependency direction. Skill manifests,
  loading, reference access, validator hooks, and agent profiles stay separate
  from phase execution.
- [x] Backwards compatibility is planned. Existing phase prompts and helper
  agents keep working while runtime-native skills and profiles are introduced.
- [x] Testing strategy covers the change. Manifest validation, skill loading,
  tool registration, profile routing, and unload behavior all need explicit
  coverage.
- [x] New dependency risk is bounded. The first version should load local
  manifests and prompt fragments before considering remote catalogs or package
  installation.
