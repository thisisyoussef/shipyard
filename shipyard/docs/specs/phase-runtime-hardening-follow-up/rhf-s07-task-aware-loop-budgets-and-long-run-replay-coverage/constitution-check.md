# Constitution Check

- [x] The story centralizes acting-budget selection instead of scattering ad hoc overrides across the runtime.
- [x] No new dependency is required; the work stays inside existing runtime heuristics and tests.
- [x] TDD coverage is planned for both the heuristic itself and the replay scenarios it is meant to protect.
- [x] The design keeps larger budgets subordinate to existing failure, continuation, and blocked-file safeguards.
