# Hosted Shipyard on Railway

This page documents the current hosted Shipyard contract on Railway. It covers
the public browser runtime, the persistent workspace contract, the shared
access-token gate, browser-side file upload intake, and the first Vercel deploy
path from the workbench.

## Service Contract

- Runtime mode: `shipyard --ui`
- Build command: `pnpm install --frozen-lockfile && pnpm --dir shipyard build`
- Start command: `pnpm --dir shipyard start -- --ui`
- Health check path: `/api/health`
- Fixed hosted targets directory: `/app/workspace`
- Recommended volume mount path: `/app/workspace`

## Required Environment

| Variable | Value | Purpose |
| --- | --- | --- |
| `SHIPYARD_TARGETS_DIR` | `/app/workspace` | Moves hosted targets and `.shipyard/` runtime state into one predictable server-side workspace. |
| `SHIPYARD_UI_HOST` | `0.0.0.0` | Lets the existing Node + WebSocket runtime bind to Railway's public networking instead of loopback only. |
| `SHIPYARD_REQUIRE_PERSISTENT_WORKSPACE` | `1` | Fails startup loudly when the hosted service is expected to use a durable mounted workspace but Railway has not attached the volume yet. |
| `SHIPYARD_ACCESS_TOKEN` | shared secret | Protects `/api/access`, the SPA shell, and `/ws` with a lightweight hosted gate. |
| `VERCEL_TOKEN` | Vercel token | Enables the `deploy_target` tool and the browser-side `Deploy to Vercel` action. |

## Provider Environment

- Railway provides `PORT` at runtime. Shipyard falls back to `PORT` when
  `SHIPYARD_UI_PORT` is unset.
- Railway exposes `RAILWAY_VOLUME_MOUNT_PATH` when a persistent volume is
  attached. Shipyard uses that to validate the hosted persistence contract when
  `SHIPYARD_REQUIRE_PERSISTENT_WORKSPACE=1`.
- Railway can also provide `RAILWAY_PUBLIC_DOMAIN` for the public service URL.
- The hosted runtime keeps local defaults when these provider variables are not
  present.

## Workspace Layout

- Hosted targets live under `/app/workspace/<target-name>`.
- Runtime artifacts stay inside each target's `.shipyard/` directory so
  sessions, traces, uploads, and related state benefit from the same
  persistence contract.
- Browser uploads land in
  `.shipyard/uploads/<session-id>/...` and are converted into bounded
  next-turn context notes instead of being embedded directly into the websocket
  payload.
- The preview panel remains a local workspace preview. Public share links come
  from production deploys and are surfaced separately.

## Operator Flow

1. Open the Railway-hosted Shipyard URL.
2. If `SHIPYARD_ACCESS_TOKEN` is set, unlock the session through the hosted
   access gate. The bootstrap query parameter flow removes `access_token` from
   the visible URL after the cookie is set.
3. Select or create a target inside `/app/workspace`.
4. Optionally attach reference files from the browser; Shipyard stores them
   inside the workspace and injects safe previews into the next turn.
5. Use the workbench deploy action to publish the current target to Vercel.
6. Share the deployed target-app URL, not the Shipyard editor URL or the local
   preview URL.

## Failure Behavior

- If `/app/workspace` does not exist yet, Shipyard creates it on startup.
- If `SHIPYARD_REQUIRE_PERSISTENT_WORKSPACE=1` and Railway has not attached the
  expected volume, startup fails clearly instead of silently falling back to an
  ephemeral directory.
- If the hosted access token is missing or invalid, `/api/health` redacts
  session details and websocket upgrades are rejected with `401`.
- If `VERCEL_TOKEN` is missing, the deploy action stays disabled and the UI
  explains how to restore deploy capability.

## Railway Setup Notes

- Point Railway's config-as-code path at `/shipyard/railway.json`.
- If you configure service settings directly in the Railway dashboard, use the
  build and start commands above.
- Attach a persistent volume at `/app/workspace` before enabling
  `SHIPYARD_REQUIRE_PERSISTENT_WORKSPACE=1`.
