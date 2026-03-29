# Hosted Shipyard on Railway

This page documents the current hosted Shipyard contract on Railway. It covers
the public browser runtime, the persistent workspace contract, the shared
access-token gate, browser-side file upload intake, and the first Vercel deploy
path from the workbench. It also documents the hosted factory runtime profile
added in Phase 11: target-local `.shipyard/hosting/` state, hosted-safe GitHub
auth selection, explicit degraded hosted mode, and clear separation between the
Shipyard service URL, private preview URLs, and public target-app deploy URLs.

## Service Contract

- Runtime mode: `node ./dist/bin/shipyard.js --ui`
- Build system: checked-in multistage `shipyard/Dockerfile`
- Start command: `node --env-file-if-exists=.env ./dist/bin/shipyard.js --ui`
- Health check path: `/api/health`
- Fixed hosted targets directory: `/app/workspace`
- Recommended volume mount path: `/app/workspace`

## Required Environment

| Variable | Value | Purpose |
| --- | --- | --- |
| `SHIPYARD_TARGETS_DIR` | `/app/workspace` | Moves hosted targets and `.shipyard/` runtime state into one predictable server-side workspace. |
| `SHIPYARD_UI_HOST` | `0.0.0.0` | Recommended explicit override. When Railway-hosted env signals are present, Shipyard now also falls back to `0.0.0.0` automatically so a missing bind var does not leave the service on loopback only. |
| `SHIPYARD_REQUIRE_PERSISTENT_WORKSPACE` | `1` | Fails startup loudly when the hosted service is expected to use a durable mounted workspace but Railway has not attached the volume yet. |
| `SHIPYARD_ACCESS_TOKEN` | shared secret | Protects `/api/access`, the SPA shell, and `/ws` with a lightweight hosted gate. |
| `ANTHROPIC_API_KEY` | Anthropic API key | Enables the shipped default Anthropic runtime in hosted production. |
| `SHIPYARD_MODEL_PROVIDER` | `anthropic` | Pins hosted production to the Anthropic provider even if local defaults change later. |
| `SHIPYARD_ANTHROPIC_MODEL` | `claude-opus-4-6` | Pins hosted production to Claude Opus 4.6 for the default route. |
| `GITHUB_TOKEN` | optional hosted-safe GitHub token | Enables canonical GitHub repo binding, PR, and merge operations inside Railway without relying on `gh auth`. |
| `GITHUB_APP_ID` / `GITHUB_APP_INSTALLATION_ID` / `GITHUB_APP_PRIVATE_KEY` | optional hosted-safe GitHub App credentials | Alternative hosted-safe adapter when you want app-based repo access instead of a long-lived token. |
| `GITHUB_OAUTH_TOKEN` | optional hosted-safe OAuth token | Alternative hosted-safe adapter for delegated GitHub repo operations. |
| `VERCEL_TOKEN` | Vercel token | Enables the `deploy_target` tool and automatic public publishing after successful edited turns. |

## Provider Environment

- Railway provides `PORT` at runtime. Shipyard falls back to `PORT` when
  `SHIPYARD_UI_PORT` is unset.
- Railway exposes `RAILWAY_VOLUME_MOUNT_PATH` when a persistent volume is
  attached. Shipyard uses that to validate the hosted persistence contract when
  `SHIPYARD_REQUIRE_PERSISTENT_WORKSPACE=1`.
- Railway can also provide `RAILWAY_PUBLIC_DOMAIN` for the public service URL.
- `SHIPYARD_HOSTED_URL` can override the derived public service URL when you
  front the Railway service with a custom domain and want Shipyard to surface
  that canonical URL in hosted runtime state.
- The hosted runtime keeps local defaults when these provider variables are not
  present.

## Workspace Layout

- Hosted targets live under `/app/workspace/<target-name>`.
- Runtime artifacts stay inside each target's `.shipyard/` directory so
  sessions, traces, uploads, and related state benefit from the same
  persistence contract.
- Hosted runtime metadata now also persists under
  `.shipyard/hosting/runtime.json` so Railway-specific availability, workspace
  binding, and degraded-hosted recovery state survive restarts.
- Browser uploads land in
  `.shipyard/uploads/<session-id>/...` and are converted into bounded
  next-turn context notes instead of being embedded directly into the websocket
  payload.
- The hosted workbench no longer shows a localhost preview panel. Public share
  links come from Vercel publishes and are surfaced from the target header.
- Preview supervision still runs behind the scenes for runtime capabilities and
  tests, but the hosted operator surface no longer treats loopback URLs as
  shareable output.

## Hosted Runtime Surfaces

- **Shipyard service URL**: the Railway public domain or `SHIPYARD_HOSTED_URL`.
  This is the editor and `/api/health` surface for Shipyard itself.
- **Private preview URL**: any loopback or internal preview URL discovered by
  the preview supervisor. This remains operator-only and is never treated as a
  public share link.
- **Public target deploy URL**: the target app URL returned by `deploy_target`
  or automatic Vercel publishing. This is the shareable product URL.

The hosted runtime publishes these surfaces separately in persisted workbench
state and runtime health diagnostics so later coordinator or board consumers do
not confuse the Shipyard editor with the product being built.

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
6. Use the hosted runtime status or target header to distinguish the active
   Shipyard service URL, any private preview URL, and the latest public target
   deployment URL.
7. Open or copy the latest production URL from the target header and share the
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
- If hosted GitHub auth is missing, not hosted-safe, or has insufficient
  repository access, Shipyard enters an explicit degraded hosted mode. Planning,
  TDD, and standard code turns remain usable, but canonical GitHub binding, PR,
  and merge automation stay blocked until a hosted-safe adapter is restored.
- If `ANTHROPIC_API_KEY` is missing while the hosted default route is
  `anthropic`, turns fail clearly with missing-credential diagnostics instead
  of silently falling back to another provider.
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

- If Railway is connected to the full repo, set the service `Root Directory`
  to `/shipyard` so `package.json`, `pnpm-lock.yaml`, and `railway.json`
  resolve together.
- The checked-in `shipyard/railway.json` now pins Railway to the checked-in
  `Dockerfile`, clears the old build-command override, and starts the compiled
  runtime from `dist/bin/shipyard.js`.
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
- The checked-in GitHub Actions deploy workflow now syncs
  `SHIPYARD_ACCESS_TOKEN`, `ANTHROPIC_API_KEY`, `GITHUB_TOKEN` when the
  optional `SHIPYARD_GITHUB_TOKEN` secret is configured,
  `VERCEL_TOKEN` when configured,
  `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` to keep browser binaries out of the
  default hosted image,
  `SHIPYARD_TARGETS_DIR=/app/workspace`,
  `SHIPYARD_UI_HOST=0.0.0.0`,
  `SHIPYARD_REQUIRE_PERSISTENT_WORKSPACE=1`,
  `SHIPYARD_MODEL_PROVIDER=anthropic`, and
  `SHIPYARD_ANTHROPIC_MODEL=claude-opus-4-6` into the production Railway
  service before uploading new builds.
- The repo-controlled deploy step now shells through
  `.github/scripts/railway-ci-deploy.sh`, which runs `railway up` with verbose
  logging and retries deploys that fail after a completed build or surface the
  transient registry/container-pull errors that have been hitting the hosted
  service.
- The Dockerfile now compiles Shipyard in a build stage, prunes dev
  dependencies, and copies only `package.json`, `node_modules`, `dist/`, and
  built-in `skills/` into the final runtime image. Because the hosted runtime
  already degrades browser evaluation when Chromium is unavailable, the build
  stage also keeps `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` so browser binaries stay
  out of the default production image. If you want full hosted browser
  verification, replace that default with an image or install step that
  intentionally provisions the browser binaries and Linux dependencies.
- For local operator convenience, keep the same hosted token in the ignored
  `shipyard/.env` file and optionally add `SHIPYARD_HOSTED_URL`; the repo-root
  helper `node scripts/print-hosted-access-url.mjs` prints a bootstrap URL
  without committing the secret into tracked docs or source.
- Point Railway's config-as-code path at `/shipyard/railway.json` when the
  provider is watching the full repo, or keep `railway.json` at the uploaded
  app root when deploying only the `shipyard/` directory.
- If you configure service settings directly in the Railway dashboard, use the
  checked-in Dockerfile builder plus the compiled start command above.
- Attach a persistent volume at `/app/workspace` before enabling
  `SHIPYARD_REQUIRE_PERSISTENT_WORKSPACE=1`.
- When you want full hosted browser verification, use a Railway image or build
  setup that includes Playwright's Linux browser dependencies. Without those
  packages Shipyard will fall back to command-led verification and mark browser
  evaluation as degraded in traces instead of retrying impossible checks.
