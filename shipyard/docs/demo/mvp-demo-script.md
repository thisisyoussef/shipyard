# Current Video Demo Script

This is a 3-5 minute presenter script for the current Shipyard product flow. It
is optimized for a short recorded walkthrough, not a cold live debug session.

## Goal

Prove the current product surface in one pass:

- target-manager startup without a preselected target
- creating a fresh project target from the browser
- target profile + project summary visible in the workbench
- local preview auto-start with a direct `Open preview` link
- same-session iteration without restarting Shipyard
- chat transcript plus live step playback in the browser workbench
- building a simple tic-tac-toe app from a greenfield scaffold

## Pre-Recording Setup

From the repo root:

```bash
pnpm --dir shipyard install
pnpm --dir shipyard build
```

Recommended windows or tabs before recording:

- local file tree at the repo root
- terminal at the repo root
- browser ready for the Shipyard UI
- optional second browser tab for the direct preview URL

Demo target to create:

- `tic-tac-toe-demo` (or any fresh variant such as `tic-tac-toe-demo-2`)

Why this demo target:

- shows the browser target-creation flow, not just switching
- starts from a clean React + TypeScript scaffold
- Vite preview comes up immediately after creation
- the first visible gameplay changes are easy to verify on camera

Live turns require `ANTHROPIC_API_KEY`. Use a fresh `--session` name for each
recording if you do not want to resume an earlier run. Use a fresh target name
if you are recording more than once and do not want to delete the old demo
directory.

## Hook

### 00:00-00:15

Action:
- Start on the repo root with `test-targets/` visible.

Narration:
> Shipyard is a local-first coding agent that can start without a locked-in
> project, let me choose a target from the browser, and then keep iterating on
> that project in one long-lived session with a live preview.

## Run Of Show

### 00:15-00:45: Launch Into Target Manager Mode

Action:
- Start the UI runtime from the repo root without `--target`:

```bash
SHIPYARD_UI_PORT=3211 pnpm --dir shipyard start -- --targets-dir ../test-targets --ui --session current-demo-ui
```

- Open the printed browser URL.
- Leave the terminal visible long enough to show that Shipyard started in
  target-manager mode.

Narration:
> I’m not preloading a target here. Shipyard starts in target-manager mode,
> points at the local `test-targets` directory, and gives me a browser-first
> way to pick what I want to work on.

Proof callout:
- No `--target` was required at startup.
- The terminal shows target-manager mode and the active targets directory.
- The browser is connected to the same live session.

### 00:45-01:15: Create The Demo Target

Action:
- In the browser, click `Browse targets`, then `New Target`.
- Fill the dialog with:
  - Name: `tic-tac-toe-demo`
  - Description: `Build a browser-based tic-tac-toe game from scratch.`
  - Scaffold type: `React + TypeScript`
- Click `Create target`.
- Pause on the target header and wait for the preview panel to reach
  `Running`.
- Click `Open preview` once to show the direct navigation path, then return to
  the main workbench tab.

Narration:
> For the demo I’m creating a fresh `tic-tac-toe-demo` target from inside the
> browser. Shipyard scaffolds a new React + TypeScript project, switches it into
> code phase, starts the local preview automatically, and gives me both an
> inline preview and a direct URL I can open in another tab.

Proof callout:
- The new target is created from the browser rather than pre-created in the
  terminal.
- The target summary/header updates after creation and phase switch.
- The preview panel shows a loopback URL and the direct `Open preview` link.

### 01:15-03:25: Two Live Turns In One Session

Action:
- Submit this first instruction with an empty context box:

```text
Turn this starter React app into a simple 3x3 tic-tac-toe board. Show a heading, a status line that starts with "Current player: X", and nine clickable squares laid out in a grid. Keep the first version self-contained in src/App.tsx and a small src/App.css file if needed.
```

- After the first turn finishes, point at:
  - the `Chat` tab
  - the `Live view` tab
  - the file/output sidebars
  - the preview panel refreshing

- Then paste this into the left context panel:

```text
Keep the next change small. Build on the current board instead of rewriting it, and tell me exactly which files changed.
```

- Switch to `Live view` before sending the second instruction so the step
  timeline is visible while the run is active.

- Submit this second instruction in the same browser session:

```text
Finish the first playable loop: alternate X and O when squares are clicked, prevent clicking an occupied square, detect a winner or draw, and add a Reset Game button.
```

- Optional if the turn is quick:
  - reload the page once to show the session and context receipt rehydrate
  - click `Open preview` again after the second edit to show the updated result
    in a separate tab

Narration:
> This is one long-lived Shipyard session. I’m starting from a fresh scaffold,
> getting the first visible board on screen, and then layering in the first
> playable loop without restarting the agent or the app.

> I’m also injecting operator context at runtime before the second turn. The UI
> keeps that context visible as a receipt. I can read the conversation in the
> `Chat` view, then flip to `Live view` to watch the read, edit, and result
> steps land one by one while the run is still executing.

Proof callout:
- Same session accepts multiple turns without restarting Shipyard.
- The second turn clearly uses injected context from the sidebar.
- The `Live view` tab shows sequential step updates before the turn is fully
  complete.
- The file/output sidebars show a narrow edit surface rather than a full-file
  rewrite, including before/after evidence for the edit step.
- The preview updates live from scaffold to board to playable game, and can
  also be opened directly in its own tab.

### 03:25-03:45: Show Saved Runs And Trace Proof

Action:
- Open the `Previous runs` panel in the left sidebar.
- Point at the current run entry and at least one earlier saved run.
- Click the `Open trace` link from the finished turn or selected live step.

Narration:
> The browser also keeps the session history local to this target, so I can
> reopen older runs without restarting Shipyard. And for deeper inspection, each
> completed run can expose its LangSmith trace right from the workbench.

Proof callout:
- Saved runs are visible in the browser for the current target.
- A completed run exposes a direct trace link without leaving the workbench.

### 03:45-04:00: Close

Action:
- End on the Shipyard workbench with the finished `tic-tac-toe-demo` board
  visible.

Narration:
> That is the current Shipyard flow in one pass: start without a target,
> create a fresh project from the browser, build a real feature in the same
> session, inspect the run through chat plus live playback, and verify it
> through the built-in preview without restarting the agent or leaving the local
> workflow.

## Backup Path If A Live Turn Misbehaves

If a live model call or preview refresh misbehaves during recording, cut to
checked-in evidence instead of improvising:

- `shipyard/tests/cli-loop.test.ts` for target-manager startup and project
  creation without restarting
- `shipyard/tests/ui-runtime.test.ts` for browser target switching and preview
  lifecycle coverage
- `shipyard/tests/ui-live-view.test.ts` and
  `shipyard/tests/ui-chat-workspace.test.ts` for the new browser chat and
  step-by-step playback surfaces
- `shipyard/tests/ui-workbench.test.ts` for the visible `Local preview` and
  `Open preview` workbench surface
- `shipyard/docs/specs/phase-target-manager/README.md` for the target-selection
  story scope
- `shipyard/docs/specs/phase-5/p5-s01-local-preview-runtime-and-auto-refresh/feature-spec.md`
  for the preview-runtime and preview-panel scope

Use that cut only as a fallback. The primary video should still show the live
browser flow: target selection, preview startup, one visible change, and a
second turn in the same session.
