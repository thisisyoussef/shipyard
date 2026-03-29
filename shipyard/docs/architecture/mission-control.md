# Mission Control

Shipyard's long-run mission-control stack keeps a browser-mode `ultimate`
session alive across preview drops, runtime crashes, idle memory growth, and
operator disconnects without requiring a human to sit on the workbench tab.

## Layers

1. `scripts/ultimate-mission-watchdog.ts` is the outer supervisor. It launches
   mission control, watches `mission-state.json`, and respawns mission control
   if the inner loop exits or stops heartbeating.
2. `scripts/ultimate-mission-control.ts` is the inner supervisor. It owns the
   active runtime recovery loop for one target + session pair.
3. `src/mission-control/policy.ts` decides when to restart the runtime or
   re-arm `ultimate` based on authenticated runtime telemetry.
4. `src/ui/health.ts` defines the authenticated `/api/health` payload that
   exposes runtime memory, preview status, ultimate status, and connection
   state to mission control.

## Mission Bundle

Mission control reads a target-local JSON config so operators can keep
long-running sessions and their recovery artifacts beside the target instead of
inside the Shipyard repo.

Recommended bundle layout:

```text
target/.shipyard/ops/<sessionId>/
  mission.config.json
  brief.md
  sticky-feedback.json
  mission-state.json
  launchd/
  logs/
  backups/
```

Config highlights:

- `shipyardDirectory`: Shipyard checkout that should own recovery.
- `targetDirectory`: target being supervised.
- `sessionId`: existing browser-mode session to resume.
- `ui`: host/port/access token and optional environment overrides.
- `environment.envFiles`: optional env files that should be loaded before the
  watchdog, mission controller, and relaunched runtime come up. Use this for
  durable local secret/bootstrap state.
- `ultimate.briefPath`: durable `ultimate start` brief to replay after restart.
- `ultimate.stickyFeedbackPath`: JSON array of human guidance to requeue after
  recovery.
- `sidecars`: optional extra processes with health checks, such as a live
  console observer.

## Recovery Loop

On each poll, mission control:

1. Authenticates against `/api/access`, then reads authenticated `/api/health`.
2. Keeps a passive websocket attached so the preview supervisor remains active
   even if no human has the workbench open.
3. Evaluates restart conditions:
   - missing health beyond the grace window
   - preview supervisor in `error` while idle
   - RSS above the soft or hard memory thresholds
   - `agent-busy` with no movement in `lastActiveAt` beyond the stall window
4. Repairs the saved session JSON and active handoff from the latest mission
   backups if those artifacts are missing or malformed before a fresh runtime
   launch.
5. Restarts the UI runtime when needed and waits for fresh telemetry.
6. Replays `ultimate start <brief>` plus every sticky feedback entry when the
   runtime is healthy but `ultimate` is inactive.
7. Copies the session JSON and current active handoff artifact into timestamped
   backup folders.
8. Writes `mission-state.json` with heartbeat, runtime status, restart counts,
   backup counts, and sidecar status so the outer watchdog can verify liveness.

## Cold-Start Recovery

- `scripts/ultimate-mission-watchdog.ts` now launches mission control with
  `node --import tsx` directly instead of relying on `pnpm` shell resolution,
  which makes detached relaunches and LaunchAgent cold starts less brittle.
- `scripts/ultimate-mission-launch-agent.ts` writes a mission-local bootstrap
  env file, installs a per-session `launchd` plist under
  `~/Library/LaunchAgents/`, and points it at the watchdog so the mission can
  re-arm itself after operator disconnects or app shutdown.
- Because the launch agent updates `mission.config.json` to include the new
  env file, later watchdog/controller restarts continue to see the same secret
  source without depending on process-table recovery.

## Operational Notes

- Runtime restarts are intentionally coarse. Clearing process memory is handled
  by restarting the UI runtime while preserving the session JSON, handoff
  artifact, brief, and sticky feedback.
- Mission backups are now actionable, not just archival: if the live session
  artifact corrupts or disappears, mission control restores the newest known
  good session and matching handoff automatically before relaunching.
- Preview supervision already exists inside the runtime; mission control keeps
  it warm by holding a passive websocket connection open.
- Sidecars are optional. If an observer process is useful for a specific
  mission, add it in the mission bundle rather than hard-coding it into the
  core runtime.
- Mission bundles are durable operational state, not source code. Treat them
  like target-local runtime output and keep secrets out of version control.
