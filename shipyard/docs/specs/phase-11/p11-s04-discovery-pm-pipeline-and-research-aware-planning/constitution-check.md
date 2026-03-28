# Constitution Check

- [x] New modules respect SRP and dependency direction. Research lookup,
  discovery synthesis, PM artifact writing, backlog state, and phase execution
  remain separate concerns.
- [x] Backwards compatibility is planned. The existing `plan:` path remains
  available for lightweight operator-driven planning while richer discovery and
  PM phases are introduced.
- [x] Testing strategy covers the change. Artifact generation, research-source
  filtering, backlog ordering, approval flow, and skip/reentry behavior all
  need explicit coverage.
- [x] New dependency risk is bounded. Research starts with read-only official
  docs and curated sources before any broader search or integration layer is
  added.
