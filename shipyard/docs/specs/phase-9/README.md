# Phase 9: Hosted Shipyard and Public Deploy Story Pack

- Pack: Phase 9 Hosted Shipyard and Public Deploy
- Estimate: 12-18 hours
- Date: 2026-03-25
- Status: Implemented

## Pack Objectives

1. Run Shipyard's browser runtime as a public Railway service with a
   predictable server-side workspace and provider-compatible host/port
   handling.
2. Protect the hosted Shipyard URL with a lightweight access token so the
   assignment demo is usable without exposing open API-credit burn.
3. Let Shipyard deploy the current target project to a public production URL
   from inside the target directory, using Vercel first.
4. Make the two-URL model explicit: one URL for the hosted Shipyard editor and
   a separate URL for the deployed target app.
5. Persist hosted project files across sessions, service restarts, and Railway
   redeploys, starting with a mounted volume at `/app/workspace`.
6. Let hosted users upload local reference files into the chat flow so
   Shipyard can inspect them without relying on browser-only filesystem paths.

## Scope Translation

| Requested idea | Keep or defer | Notes |
|---|---|---|
| Live cloud sandboxes and public live preview containers | Defer | This pack does not chase Lovable-style per-session sandboxes. It keeps Shipyard's current workspace model and adds public hosting plus one-click production deploy. |
| Shipyard hosted on Railway | Keep | This is the simplest public runtime baseline for the current Node + `ws` UI server. |
| Target project deployed from the hosted workspace | Keep | Add a first-class deploy tool that runs non-interactively inside the target directory. |
| Lightweight access token | Keep | Enough protection for an assignment/demo without introducing accounts. |
| GitHub push plus Netlify/Vercel repo-based deploy flow | Defer | Valuable later, but unnecessary for the simplest public demo path. |
| Browser file upload into the hosted chat flow | Keep | First pass is text-first, bounded, workspace-backed upload that becomes next-turn context. Binary OCR/vision work is deferred. |
| Persistent workspace across provider redeploys | Keep | Start with a Railway volume mounted at `/app/workspace` so targets and `.shipyard/` state survive restarts and redeploys. |
| Object-storage sync and restore (S3, R2) | Defer, but leave room | Valuable for provider portability and multi-instance scaling, but not required for the first persistence story if the volume-backed contract stays clean. |
| GitHub-backed durability for generated projects | Defer | Still useful for longer-lived products, but not required for the first hosted persistence milestone. |

## Shared Constraints

- Reuse `shipyard/src/bin/shipyard.ts` and `shipyard/src/ui/server.ts`
  instead of adding a second web server or agent service.
- Reuse the typed tool registry for deployment work; do not hide deploy
  behavior inside ad hoc shell instructions.
- Keep current local CLI and local `--ui` flows backward compatible.
- Distinguish the hosted Shipyard URL from the deployed target URL. Do not
  imply the current preview panel automatically becomes a public cloud preview.
- Use environment variables for secrets such as `SHIPYARD_ACCESS_TOKEN` and
  `VERCEL_TOKEN`; never commit tokens or echo them in traces.
- Persistent hosted storage starts with a Railway volume mounted at
  `/app/workspace`; later object-storage sync should be able to layer on
  without rewriting the whole runtime.
- Reuse the existing context-injection and workbench-state model; do not stuff
  raw file blobs into the current JSON websocket instruction payload.
- Uploaded files should land inside the hosted workspace or a `.shipyard/`
  subdirectory that benefits from the same persistence contract, not a public
  static-web root.
- Keep the first upload pass honest and bounded: support text-first reference
  files, validate extensions and size, and fail clearly for unsupported binary
  formats instead of pretending the current tool surface can read everything.
- Vercel is the first required target deployment platform. Railway deployment
  of the generated target app is explicitly deferred.
- GitHub-backed production sync is out of scope for this first hosted pack.

## Planned Stories

| Story ID | Title | Purpose | Depends On |
|---|---|---|---|
| P9-S01 | Hosted UI Runtime and Railway Service Contract | Make the existing browser runtime boot cleanly on Railway with provider host/port handling, a predictable `/app/workspace` target path, and documented provider config. | Existing UI runtime, preview/session model |
| P9-S05 | Persistent Hosted Workspace Storage and Restore | Make hosted targets and `.shipyard/` runtime state survive Railway restarts and redeploys via a mounted volume-backed workspace path, while keeping room for later object-store sync. | P9-S01 |
| P9-S02 | Hosted Access Token Gate | Add a lightweight shared-secret gate so public Shipyard URLs require a token before the session state and agent loop become usable. | P9-S01 |
| P9-S06 | Browser File Upload and Shipyard Context Intake | Let hosted users attach local files in the chat flow, persist them into the hosted workspace, and feed safe references or previews into the next turn. | P9-S01, P9-S02, P9-S05 |
| P9-S03 | Target Deploy Tool and Vercel Delivery Contract | Add a typed deploy tool that can publish the current target to Vercel from inside the hosted or local workspace and return the production URL. | P9-S01 |
| P9-S04 | Deploy UX and Public URL Surfacing | Wire deploy into the browser workbench, persist the latest deploy result, and make the hosted Shipyard URL vs deployed app URL distinction obvious. | P9-S02, P9-S03, P9-S05 |

## Sequencing Rationale

- `P9-S01` lands first because the hosted runtime contract is the foundation
  for every other story in the pack.
- `P9-S05` follows the hosted baseline because durable storage changes the
  credibility of every later hosted flow: returning sessions, deploy recovery,
  and target reuse all depend on the workspace surviving restarts.
- `P9-S02` comes next because a public URL without even lightweight protection
  is too risky for shared demos.
- `P9-S06` lands once hosted storage and access control exist so browser-side
  uploads can be authenticated, stored durably, and attached to later turns
  without inventing a second transient blob path.
- `P9-S03` adds the actual publish step once the hosted workspace, persistent
  path, and env contract are defined.
- `P9-S04` comes last because the workbench UX should reflect the real hosted
  and deploy contracts rather than inventing them up front.

## Whole-Pack Success Signal

- A reviewer can open a public Railway URL and reach the Shipyard workbench.
- Hosted Shipyard writes generated files into a predictable server-side
  workspace instead of relying on a local machine path.
- Hosted Shipyard keeps target files and `.shipyard/` session/runtime artifacts
  across service restarts and Railway redeploys when the persistent volume is
  attached.
- The hosted service can require a simple access token before exposing the
  agent loop.
- A hosted user can upload a supported local file, see it attached in the chat
  flow, and have Shipyard receive a trustworthy stored-path reference plus a
  bounded preview for the next turn.
- A user can deploy the current target to Vercel and get a public production
  URL without leaving Shipyard.
- The hosted workbench keeps the deployed target-app URL primary, auto-publishes
  successful edited turns when Vercel is configured, and stays honest about
  localhost-only preview limitations.

## Implementation Evidence

### Code References

- Hosted runtime + Railway contract:
  - `shipyard/src/bin/shipyard.ts`
  - `shipyard/src/ui/server.ts`
  - `shipyard/package.json`
  - `shipyard/railway.json`
- Persistent hosted workspace:
  - `shipyard/src/hosting/workspace.ts`
  - `shipyard/src/bin/shipyard.ts`
  - `shipyard/tests/ui-runtime.test.ts`
- Hosted access gate:
  - `shipyard/src/ui/access.ts`
  - `shipyard/src/ui/server.ts`
  - `shipyard/ui/src/HostedAccessGate.tsx`
  - `shipyard/tests/ui-access.test.ts`
- Browser file upload intake:
  - `shipyard/src/ui/uploads.ts`
  - `shipyard/src/ui/contracts.ts`
  - `shipyard/src/ui/workbench-state.ts`
  - `shipyard/ui/src/panels/ComposerPanel.tsx`
  - `shipyard/tests/ui-runtime.test.ts`
- Typed Vercel deploy tool:
  - `shipyard/src/tools/deploy.ts`
  - `shipyard/src/tools/run-command.ts`
  - `shipyard/src/phases/code/prompts.ts`
  - `shipyard/tests/tooling.test.ts`
- Deploy UX and public URL surfacing:
  - `shipyard/src/ui/server.ts`
  - `shipyard/src/ui/workbench-state.ts`
  - `shipyard/ui/src/ShipyardWorkbench.tsx`
  - `shipyard/ui/src/TargetHeader.tsx`
  - `shipyard/src/tools/target-manager/scaffolds.ts`
  - `shipyard/tests/ui-workbench.test.ts`
  - `shipyard/tests/scaffold-bootstrap.test.ts`

### Representative Snippets

- Hosted workspace resolution and Railway-compatible host binding:

```ts
const envTargetsDirectory = process.env.SHIPYARD_TARGETS_DIR?.trim();
if (envTargetsDirectory) {
  return path.resolve(envTargetsDirectory);
}
```

- Railway now runs the nested app from its own root instead of hopping one
  directory too deep:

```json
"buildCommand": "pnpm install --frozen-lockfile && pnpm build",
"startCommand": "pnpm start -- --ui"
```

- Upload receipts become next-turn context instead of raw websocket blobs:

```ts
const uploadInjectedContext = createUploadInjectedContext(
  sessionState.workbenchState.pendingUploads,
);
```

- Deploy completion now persists a recoverable public URL for the active target:

```ts
summary: `Deploy completed. Public URL: ${data.productionUrl}`,
productionUrl: data.productionUrl,
```

- Successful edited turns now trigger the same deploy contract automatically:

```ts
if (turnResult.status === "success" && turnProducedEdits) {
  await runBrowserDeploy({ platform: "vercel" }, signal, { mode: "automatic" });
}
```

- New React/Vite targets ship with the CSS typing baseline Vercel builds need:

```ts
types: ["vite/client"],
```
