# Constitution Check

- [x] Typed ultimate controls remain adapters over the existing ultimate-mode
      runtime instead of introducing a second scheduler or command path.
- [x] Human interrupt and cancel semantics remain explicit and backward
      compatible with text-command behavior.
- [x] No new runtime dependencies are introduced. State projection, badges, and
      composer behavior stay inside current UI/backend contracts.
- [x] Reconnect and reload behavior is planned explicitly so ultimate state does
      not silently reset to “off” while work is still active.
