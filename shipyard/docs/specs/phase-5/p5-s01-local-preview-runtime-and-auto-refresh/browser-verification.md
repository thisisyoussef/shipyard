# Browser Verification

## Metadata
- Story ID: P5-S01
- Date: 2026-03-24
- Command: `pnpm --dir shipyard exec tsx tests/manual/phase5-local-preview-smoke.ts`
- Supported target: scaffolded Vite-style temp project created by the smoke script
- Unavailable target: `test-targets/tic-tac-toe`

## Supported Preview Flow

1. Start the UI runtime against the scaffolded previewable target.
   - Observed: discovery reported `previewCapability.status = available`, and the browser socket received `preview:state` updates from `starting` to `running`.
2. Wait for the preview URL.
   - Observed: the supervisor published a loopback URL and recent log lines including the Vite-style readiness line.
3. Submit `rename the package in package.json`.
   - Observed: the runtime streamed the normal tool/edit events plus `preview:state` transitions through `refreshing` and back to `running`.
4. Load the preview URL directly.
   - Observed: the loopback page responded successfully and stayed available after the edit cycle.

## Unavailable Flow

1. Start the UI runtime against `test-targets/tic-tac-toe`.
   - Observed: the initial `session:state` snapshot carried `workbenchState.previewState.status = unavailable`.
2. Inspect the unavailable reason.
   - Observed: the reason remained explicit instead of guessing a command: `No package.json was found, so Shipyard cannot infer a supported local preview command.`

## Acceptance Notes

- Supported targets auto-start without blocking the rest of the UI runtime.
- Edit-triggered refresh stays aligned with the target-native HMR path.
- Unsupported targets remain fully usable and explain why preview is unavailable.
- The current repo snapshot does not yet ship a previewable `test-targets/tic-tac-toe`, so the supported verification path uses a scaffolded Vite-style temp target while `tic-tac-toe` remains the unavailable baseline.
