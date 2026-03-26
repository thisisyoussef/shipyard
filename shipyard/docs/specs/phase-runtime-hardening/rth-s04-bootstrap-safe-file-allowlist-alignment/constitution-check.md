# Constitution Check

- [x] New modules respect SRP and dependency direction. The change stays inside target-manager bootstrap validation and does not create a second scaffold path.
- [x] Backwards compatibility respected. Existing empty-target bootstrap behavior remains intact while allowing a narrowly defined seed-doc allowlist.
- [x] Testing strategy covers the change. Allowlisted seed docs and rejected true-content directories both need regression coverage.
- [x] New dependency justified and risk-assessed. No new dependency is required.
