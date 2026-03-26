# Constitution Check

- [x] New modules respect SRP and dependency direction. Routing heuristics, recent-path carry-forward, and subagent visibility stay coordinator/runtime concerns rather than changing tool behavior.
- [x] Backwards compatibility respected. Broad existing-target requests can still use explorer or planner when Shipyard truly lacks enough local evidence.
- [x] Testing strategy covers the change. Coordinator routing, same-session continuation, and subagent event visibility all need explicit graph/runtime coverage.
- [x] New dependency justified and risk-assessed. No new dependency is required; the story should reuse the current reporter, trace, and raw-loop option surfaces.
