# Constitution Check

- [x] New modules respect SRP and dependency direction. Discovery infers
  capability, preview supervision owns process lifecycle, and the UI only
  renders preview state.
- [x] Backwards compatibility respected. Targets without preview capability keep
  the current Shipyard workflow and receive an explicit unavailable state.
- [x] Testing strategy covers the change. Capability inference, lifecycle
  supervision, UI state transitions, and manual preview verification are all in
  scope.
- [x] New dependency justified and risk-assessed. Start with Node built-ins and
  existing runtime contracts; add no new dependency unless native watch limits
  prove it necessary.
