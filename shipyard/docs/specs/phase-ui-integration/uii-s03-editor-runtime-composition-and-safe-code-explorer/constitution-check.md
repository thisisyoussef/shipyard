# Constitution Check

- [x] Read-only code browsing stays inside a target-root sandbox and does not
      create a new write path or bypass existing edit safety.
- [x] Editor integration prefers extracted reusable workbench surfaces over a
      second copy of chat/preview/diff logic.
- [x] No new runtime dependencies are introduced. File browsing stays on native
      HTTP/JSON and current UI primitives.
- [x] Tests cover path validation, large/binary file handling, layout
      persistence, and legacy workbench regression.
