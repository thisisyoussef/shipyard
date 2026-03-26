# Constitution Check

- [x] New modules respect SRP and dependency direction. Task scheduling,
  isolated execution, apply or discard flow, and UI board projection remain
  distinct layers.
- [x] Backwards compatibility is planned. Foreground `next` / `continue` still
  work while the background task board is introduced incrementally.
- [x] Testing strategy covers the change. Task lifecycle, isolation,
  cancellation, retry, and apply or discard behavior all need dedicated
  coverage.
- [x] New dependency risk is bounded. Isolation should reuse git worktrees or
  bounded sandboxes behind adapters rather than inventing a heavyweight new
  orchestration system.
