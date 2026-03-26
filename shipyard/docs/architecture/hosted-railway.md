# Hosted Shipyard on Railway

This page documents the current hosted Shipyard contract on Railway. It covers
the public browser runtime, the persistent workspace contract, the shared
access-token gate, browser-side file upload intake, and the first Vercel deploy
path from the workbench.

## Service Contract

- Runtime mode: `shipyard --ui`
- Build command: `pnpm install --frozen-lockfile && pnpm build`
- Start command: `pnpm start -- --ui`
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
| `VERCEL_TOKEN` | Vercel token | Enables the `deploy_target` tool and automatic public publishing after successful edited turns. |

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
- The hosted workbench no longer shows a localhost preview panel. Public share
  links come from Vercel publishes and are surfaced from the target header.
- Preview supervision still runs behind the scenes for runtime capabilities and
  tests, but the hosted operator surface no longer treats loopback URLs as
  shareable output.

## Operator Flow

1. Open the Railway-hosted Shipyard URL.
2. If `SHIPYARD_ACCESS_TOKEN` is set, unlock the session through the hosted
   access gate. The bootstrap query parameter flow removes `access_token` from
   the visible URL after the cookie is set.
3. Select or create a target inside `/app/workspace`.
4. Optionally attach reference files from the browser; Shipyard stores them
   inside the workspace and injects safe previews into the next turn.
5. After a successful edited turn, Shipyard automatically publishes the current
   target to Vercel when `VERCEL_TOKEN` is configured.
6. Open or copy the latest production URL from the target header and share the
   deployed target-app URL, not the Shipyard editor URL.

## Failure Behavior

- If `/app/workspace` does not exist yet, Shipyard creates it on startup.
- If `SHIPYARD_REQUIRE_PERSISTENT_WORKSPACE=1` and Railway has not attached the
  expected volume, startup fails clearly instead of silently falling back to an
  ephemeral directory.
- If the hosted access token is missing or invalid, `/api/health` redacts
  session details and websocket upgrades are rejected with `401`.
- If `VERCEL_TOKEN` is missing, automatic publishing stays unavailable and the
  target header explains how to restore deploy capability.
- If browser verification is requested but the Railway image does not include
  the required Playwright or Chromium system libraries, Shipyard records an
  explicit degraded verification result instead of treating that infrastructure
  gap as proof that the target app is broken.
- If a preview command such as `npm run dev` reaches a concrete ready state
  before timing out, Shipyard treats the verification command as successful and
  records the ready URL in trace metadata even though the process itself stays
  alive.
- Infra-only verification degradation does not trigger the normal recovery loop
  unless Shipyard also has separate command or build evidence that the target
  code actually failed.

## Railway Setup Notes

- If Railway is connected to the full repo, set the service root directory to
  `shipyard/` so `package.json`, `pnpm-lock.yaml`, and `railway.json` resolve
  together.
- If you prefer repo-controlled auto-deploy instead of Railway's native GitHub
  integration, add a root GitHub Actions workflow that runs on pushes to
  `main`, changes into `shipyard/`, and deploys with
  `railway up . --path-as-root --project <project-id> --environment <env-id> --service <service-id>`.
- Repo-controlled auto-deploy should use a GitHub Actions secret for Railway
  authentication. Prefer `RAILWAY_TOKEN` with a Railway project token; keep
  `RAILWAY_API_TOKEN` as the fallback when you intentionally use a broader
  account or workspace token.
- Repo-controlled auto-deploy does not require the Railway service itself to be
  GitHub-linked. Native Railway GitHub autodeploy remains optional and can be
  enabled later from the service settings if you want Railway to watch a branch
  directly.
- Point Railway's config-as-code path at `/shipyard/railway.json` when the
  provider is watching the full repo, or keep `railway.json` at the uploaded
  app root when deploying only the `shipyard/` directory.
- If you configure service settings directly in the Railway dashboard, use the
  build and start commands above.
- Attach a persistent volume at `/app/workspace` before enabling
  `SHIPYARD_REQUIRE_PERSISTENT_WORKSPACE=1`.
- When you want full hosted browser verification, use a Railway image or build
  setup that includes Playwright's Linux browser dependencies. Without those
  packages Shipyard will fall back to command-led verification and mark browser
  evaluation as degraded in traces instead of retrying impossible checks.
