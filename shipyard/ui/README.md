# UI Frontend

`ui/` contains the React and Vite frontend for Shipyard's browser workbench.

## Key Files

- `src/main.tsx`: frontend bootstrap
- `src/App.tsx`: app root
- `src/ShipyardWorkbench.tsx`: main workbench composition
- `src/panels/RunHistoryPanel.tsx`: saved-run browser and resume controls
- `src/view-models.ts`: frontend-side view shaping
- `src/primitives.tsx`: shared UI primitives
- `src/styles.css` and `src/tokens.css`: styling and design tokens
- `index.html`: Vite entry document

## Workbench Highlights

- The left sidebar shows the active session, saved runs for the current target,
  and injected-context history in separate panels.
- The center activity feed groups raw tool events into plain-language steps and
  can focus on the latest run or expand to all recorded turns.
- The right sidebar keeps diff previews and file-level change evidence visible
  while the center feed explains what Shipyard is doing in human language.

## Build Contract

- Vite uses `ui/` as the frontend root.
- Production assets build into `dist/ui`.
- The backend server in `src/ui/server.ts` serves the built shell when present
  and falls back to a simple contract view when it is not.

See [`src/README.md`](./src/README.md) for the source-level guide.

## Diagram

```mermaid
flowchart LR
  Vite["Vite root"]
  Src["src/"]
  Html["index.html"]
  Build["dist/ui"]
  Backend["../src/ui/server.ts"]

  Vite --> Src
  Vite --> Html
  Src --> Build
  Html --> Build
  Backend --> Build
```
