# Constitution Check

- [x] Board state remains additive and read-only. This story does not create a
      new mutable task database or write authority.
- [x] Projection logic is planned to align with Phase 11 `BoardProjection`
      concepts instead of inventing a throwaway UI-only shape.
- [x] No new runtime dependencies are introduced. Columns remain backend-driven
      and the UI stays declarative.
- [x] Tests cover empty, stale, and fallback projection modes so the board does
      not regress into silent mock behavior.
