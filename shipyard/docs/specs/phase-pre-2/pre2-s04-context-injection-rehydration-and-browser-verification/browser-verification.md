# Browser Verification

## Metadata
- Story ID: PRE2-S04
- Date: 2026-03-24
- Runtime: `SHIPYARD_UI_PORT=3211 pnpm --dir shipyard start -- --target .. --ui --session pre2-s04-browser`
- Session: `Xta82FVhJImGpSp0E9AFk`

## Five-Instruction MVP Flow

1. `inspect shipyard/package.json`
   - Observed: session info rendered and live turn streaming completed.
2. Paste context in the left sidebar and run `inspect shipyard/src/ui/server.ts`
   - Observed: the injected context attached to turn `turn-2` and persisted as a context receipt.
3. Reload the page.
   - Observed: the same session rehydrated with 4 browser turns and the saved context receipt intact.
4. Run `inspect missing.ts`
   - Observed: the runtime emitted an `agent:error` for the missing file without breaking the session.
5. Run `inspect shipyard/README.md`
   - Observed: the recovery turn completed successfully and emitted a diff preview event.

## Acceptance Notes

- Context injection is single-turn and visibly acknowledged.
- Reload behaves like reattachment, not a silent new session.
- Error states remain visible without blocking the next successful turn.
- This flow is the baseline demo path for later browser-facing phases.

## Verification Results

- Rehydrated turns observed after reconnect: `4`
- Persisted context receipt observed: `Treat AGENTS.md and the current diff as the source of truth.`
- Error path observed: `inspect missing.ts`
- Recovery path observed: `inspect shipyard/README.md`
- Diff preview observed during the flow: yes

## Harness Note

- The embedded Playwright browser in this environment rendered the shell and correctly showed the reconnecting/disconnected state, but its local WebSocket bridge could not stay attached to `127.0.0.1`.
- Streaming, context rehydration, error handling, and diff emission were therefore verified against the same running UI runtime through the live WebSocket contract in parallel with the browser shell snapshot.
