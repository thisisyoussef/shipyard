# Current Video Demo Script

This is a 3-5 minute presenter script for the current Shipyard product flow. It
is optimized for a short recorded walkthrough, not a cold live debug session.

## Goal

Prove the current product surface in one pass:

- target-manager startup without a preselected target
- creating a fresh project target from the browser
- target profile + project summary visible in the workbench
- local preview auto-start with a direct `Open preview` link
- same-session iteration, including mid-turn interruption, without restarting
  Shipyard
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

## Script

1. Cold open and frame the story
[Open on the repo root with `test-targets/` visible]

"What if a local coding agent could start with no locked-in target, create the
project from the browser, build the first visible feature, and still let me
interrupt a bad turn mid-flight without losing the session? That is the whole
story of this Shipyard demo."

"I’m not going to tour every panel one by one. I’m going to follow one demo
target from creation to visible preview, then through an interrupted live turn,
and finally to the saved-run and trace surfaces that prove the session stayed
truthful."

2. Start in target-manager mode
[Run the UI without `--target`]

```bash
SHIPYARD_UI_PORT=3211 pnpm --dir shipyard start -- --targets-dir ../test-targets --ui --session current-demo-ui
```

[Open the printed browser URL]

"I’m starting without `--target` on purpose. Shipyard comes up in
target-manager mode, points at the local `test-targets` directory, and gives me
a browser-first way to choose what I want to build."

"That matters because the session is not hard-coded to one repo before the demo
even begins. The operator chooses the project from inside the workbench."

3. Create the demo target
[In the browser, click `Browse targets`, then `New Target`]
[Fill the dialog]
- Name: `tic-tac-toe-demo`
- Description: `Build a browser-based tic-tac-toe game from scratch.`
- Scaffold type: `React + TypeScript`
[Click `Create target`]
[Switch to the `Local preview` tab and wait for it to reach `Running`]
[Click `Open preview` once, then return to the `Chat` tab]

"For this story I’m creating a fresh `tic-tac-toe-demo` target inside the
browser. Shipyard scaffolds the React + TypeScript project, switches into code
phase, and brings up the local preview automatically."

"Now I have visible ground truth. The target exists, the preview is live in its
own workbench tab, and I can verify every change on camera."

4. Land the first visible result
[Submit the first instruction]

```text
Turn this starter React app into a simple 3x3 tic-tac-toe board. Show a heading, a status line that starts with "Current player: X", and nine clickable squares laid out in a grid. Keep the first version self-contained in src/App.tsx and a small src/App.css file if needed.
```

[After the turn finishes, point at the `Chat`, `Local preview`, and `Live
view` tabs plus the file/output sidebars]

"The first turn turns a blank scaffold into a visible 3x3 board. What matters
here is not just that Shipyard answered a prompt. The preview shows the result
in the app itself, Chat shows the conversation, Live view shows the step-by-step
execution, and the sidebars show which files changed."

5. Set up the interrupt story
[Paste this into the left context panel]

```text
Keep the next change small. Build on the current board instead of rewriting it, and tell me exactly which files changed.
```

[Switch to `Live view`]
[Submit the broader second instruction]

```text
Read the current app and outline the next edits you would make to turn it into a polished playable version with alternating turns, occupied-square protection, win/draw detection, and a Reset Game button. Do not edit files yet.
```

"Now I’m going to show the operator-control part of the story. I inject one
piece of context to keep the change small, then I start a broader second
request on purpose so we can interrupt it while the session is still live."

6. Interrupt the in-flight turn
[As soon as the live steps start updating, replace the composer text with the
follow-up instruction below]
[Click `Cancel turn`]
[Leave the `Stopping current turn` notice visible until the session returns to
ready]

"This is the key moment. Shipyard is already working, but I can still stop the
active turn from the same composer. The session does not die, the workbench
returns to ready, and the replacement draft stays in place instead of
disappearing."

"That is the difference between a one-shot agent and a real operator surface. I
can change course mid-run without throwing away the session."

7. Send the redirected follow-up and show the result
[Once cancellation finishes, submit the replacement instruction from the same
composer]

```text
Finish the first playable loop: alternate X and O when squares are clicked, prevent clicking an occupied square, detect a winner or draw, and add a Reset Game button. Keep the change small and tell me exactly which files changed.
```

[Point at the updated preview and the file/output sidebars]
[Optional if the turn is quick: reload once to show session rehydration, or
click `Open preview` again in a separate tab]

"Now I send the narrower follow-up in the same session. The playable loop lands,
the preview updates, and the file/output evidence stays surgical instead of
looking like a full rewrite."

"If I want to narrate the run, I can read the conversation in Chat. If I want
to inspect the execution path, I can stay on Live view. The important part is
that both surfaces stay truthful even across the cancelled turn."

8. Show saved runs and trace proof
[Open the `Previous runs` panel in the left sidebar]
[Point at the current run entry and, if available, an earlier saved run]
[Click the `Open trace` link from the finished turn or selected live step]

"Now I widen out from the current page to the saved-run surface. Shipyard keeps
the session history local to this target, and the trace link gives me the exact
run behind what I just watched."

"The cancelled turn and the successful follow-up are part of the same real
runtime story, not separate demos stitched together."

9. Wrap up
[Stay on the updated board or the run history view]

"So that’s the full story: Shipyard starts without a locked-in target, creates
the project from the browser, shows visible progress in the preview, lets me
interrupt bad work without restarting, and leaves behind a truthful session
history and trace."

"This is not a one-off trick. It is the same local-first system working across
target selection, live execution, interruption, and inspection."

## Backup Path If A Live Turn Misbehaves

If a live model call or preview refresh misbehaves during recording, cut to
checked-in evidence instead of improvising:

- `shipyard/tests/cli-loop.test.ts` for target-manager startup and project
  creation without restarting
- `shipyard/tests/loop-runtime.test.ts` and `shipyard/tests/ui-runtime.test.ts`
  for terminal/browser interruption coverage plus successful follow-up work in
  the same session
- `shipyard/tests/ui-live-view.test.ts` and
  `shipyard/tests/ui-chat-workspace.test.ts` for the new browser chat and
  step-by-step playback surfaces
- `shipyard/tests/ui-workbench.test.ts` for the visible `Local preview` and
  `Open preview` workbench surface
- `shipyard/docs/specs/phase-4/p4-s05-operator-interrupts-and-turn-cancellation/feature-spec.md`
  for the operator-interrupt and cancelled-turn contract
- `shipyard/docs/specs/phase-target-manager/README.md` for the target-selection
  story scope
- `shipyard/docs/specs/phase-5/p5-s01-local-preview-runtime-and-auto-refresh/feature-spec.md`
  for the preview-runtime and preview-panel scope

Use that cut only as a fallback. The primary video should still show the live
browser flow: target selection, preview startup, one visible change, an
interrupted turn, and a successful redirected follow-up in the same session.
