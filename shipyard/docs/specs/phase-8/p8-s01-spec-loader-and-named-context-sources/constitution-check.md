# Constitution Check

- [x] New modules respect SRP and dependency direction. The tool stays read-only, tool registration remains in the existing registry path, and no UI-only concerns leak into the backend contract.
- [x] Backwards compatibility respected. Existing `read_file` and pasted injected-context workflows remain valid.
- [x] Testing strategy covers the change. Unit coverage handles path validation, truncation, and deterministic expansion; integration coverage handles tool registration and visibility.
- [x] New dependency justified and risk-assessed. No new dependencies are required.
