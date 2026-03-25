# MVP Video Demo Script

This is a 3-5 minute presenter script for the current Shipyard MVP. It is
optimized for a short recorded walkthrough, not a cold live debug session.

## Goal

Prove the current MVP checklist in one pass:

- persistent loop without restarting
- surgical file editing
- runtime context injection
- submitted trace links for different execution paths
- checked-in `PRESEARCH.md`
- checked-in `CODEAGENT.md`
- GitHub-accessible, local-first repo with no deployment step

## Pre-Recording Setup

From the repo root:

```bash
pnpm --dir shipyard install
pnpm --dir shipyard build
pnpm --dir shipyard test-target:init
```

Recommended windows or tabs before recording:

- GitHub repo or local file tree at the repo root
- `shipyard/PRESEARCH.md`
- `shipyard/CODEAGENT.md`
- terminal at the repo root
- browser ready for the Shipyard UI

Live turns require `ANTHROPIC_API_KEY`. Fresh live LangSmith traces are
optional for this demo because `shipyard/CODEAGENT.md` already carries the two
submitted MVP trace links.

## Hook

### 00:00-00:15

Action:
- Start on the repo root and `shipyard/CODEAGENT.md`.

Narration:
> Most coding agents can answer one prompt. Shipyard is built to stay alive as
> a local session, accept the next instruction without restarting, edit files
> surgically instead of repainting them, take injected context from the
> operator, and leave behind trace evidence plus checked-in architecture notes.

## Run Of Show

### 00:15-00:45: GitHub + Architecture Artifacts

Action:
- Show the repo root in GitHub or the local clone.
- Open `shipyard/PRESEARCH.md`.
- Open `shipyard/CODEAGENT.md`.
- Pause on the `Agent Architecture`, `File Editing Strategy`, and `Trace Links`
  headings.

Narration:
> This is a local-first repo with no deployment requirement. The architecture
> recommendation is checked in as `PRESEARCH.md`, and the submission appendix is
> already filled in inside `CODEAGENT.md`, including the architecture, file
> editing strategy, and trace-link sections we need for MVP.

Proof callout:
- `PRESEARCH.md` exists and is filled in.
- `CODEAGENT.md` exists and its MVP sections are complete.
- The repo is accessible from GitHub and runs locally.

### 00:45-03:00: UI Session + Surgical Editing + Context Injection

Action:
- Start the UI runtime from the repo root:

```bash
SHIPYARD_UI_PORT=3211 pnpm --dir shipyard start -- --target ../test-targets/tic-tac-toe --ui --session mvp-demo-ui
```

- Open the printed browser URL.
- Submit this first instruction with an empty context box:

```text
Create src/game.ts exporting a function named nextMove that returns "todo". Do not modify any existing files.
```

- After the first turn finishes, paste this into the left context panel:

```text
Treat AGENTS.md and the current diff as the source of truth. Keep the next change surgical and call out where the injected context is preserved for this turn.
```

- Submit this second instruction in the same browser session:

```text
Read README.md and surgically update only the Current State section so it says src/game.ts now exists and Shipyard can keep iterating without restarting. Do not rewrite the whole file.
```

- Optional if the turn is quick:
  - click the status refresh control once
  - reload the page once to show the session and context receipt rehydrate

Narration:
> This is one long-lived agent session in the UI. I’m giving Shipyard one
> instruction, letting it finish, and then immediately giving it another
> without restarting anything. The second prompt is intentionally narrow: I
> want a surgical change to one section of `README.md`, not a rewrite of the
> whole file.

> I’m also injecting operator context at runtime before the second turn. The UI
> keeps that context visible as a receipt, and the file-activity panel shows
> the diff preview so the edit strategy is visible on screen.

Proof callout:
- Same UI session accepts multiple instructions without restarting.
- The second turn uses injected context from the sidebar.
- The README change is visibly surgical in the file-activity diff.
- The UI is a real operator surface over the shared runtime.

### 03:00-03:50: Trace Evidence

Action:
- Return to `shipyard/CODEAGENT.md`.
- Scroll to `Trace Links (MVP)`.
- Point at the two submitted links:
  - successful graph-mode file creation
  - fallback-mode missing-file error
- If you want one local artifact on screen too, mention
  `target/.shipyard/traces/<sessionId>.jsonl`.

Narration:
> Tracing is not just turned on in theory. The repo already carries two shared
> trace links showing different execution paths: one successful graph-mode run
> and one fallback error path. Every local run also writes JSONL traces under
> `.shipyard/traces`, so the local audit trail exists even without vendor
> credentials.

Proof callout:
- Two submitted trace links exist.
- They cover different execution paths.
- Local trace files exist for local runs.

### 03:50-04:20: Close

Action:
- End on the repo root or `shipyard/README.md`.

Narration:
> That is the MVP in one pass: a persistent agent loop, surgical edits, runtime
> context injection, trace evidence, and the architecture artifacts checked into
> the repo. Everything is local-first, visible in GitHub, and runnable without
> any deployment stage.

## Backup Path If A Live Turn Misbehaves

If a live model call stalls during recording, cut to checked-in evidence instead
of improvising:

- `shipyard/tests/manual/phase3-live-loop-smoke.ts` for live-loop and surgical
  edit intent
- `node shipyard/dist/bin/shipyard.js --target ./test-targets/tic-tac-toe` if
  you need to prove the persistent loop in terminal form instead of the UI
- `shipyard/docs/specs/phase-pre-2/pre2-s04-context-injection-rehydration-and-browser-verification/browser-verification.md`
  for the browser context-injection verification path
- `shipyard/tests/manual/phase4-langsmith-mvp.ts` for the successful and
  failing trace scenarios
- `shipyard/CODEAGENT.md` for the already-submitted trace links

Use that cut only as a fallback. The primary video should show the live UI
session, the context receipt, and the file-activity diff.
