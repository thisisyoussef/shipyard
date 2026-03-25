# Technical Plan

## Metadata
- Story ID: P9-S06
- Story Title: Browser File Upload and Shipyard Context Intake
- Author: Codex
- Date: 2026-03-25

## Proposed Design
- Components/modules affected:
  - `shipyard/src/ui/server.ts`
  - `shipyard/src/ui/contracts.ts`
  - `shipyard/src/ui/events.ts`
  - `shipyard/src/ui/workbench-state.ts`
  - `shipyard/src/engine/state.ts`
  - `shipyard/src/context/envelope.ts`
  - `shipyard/ui/src/App.tsx`
  - `shipyard/ui/src/panels/ComposerPanel.tsx`
  - `shipyard/ui/src/context-ui.ts`
  - a small helper such as `shipyard/src/ui/uploads.ts` or
    `shipyard/src/uploads/hosted-upload-store.ts`
  - `shipyard/tests/ui-runtime.test.ts`
  - `shipyard/tests/ui-view-models.test.ts`
  - `shipyard/tests/ui-workbench.test.ts`
- Public interfaces/contracts:
  - dedicated browser upload request or response contract
  - upload receipt or pending-attachment view model in session state
  - next-turn injected-context synthesis for uploaded files
- Data flow summary: the browser selects files, posts them through a dedicated
  authenticated intake path, the server validates and stores them under a
  Shipyard-managed workspace location, typed receipts are persisted in
  workbench state, and the next submitted instruction converts those receipts
  into bounded injected-context references that the agent can follow with the
  existing file-reading tools.

## Pack Cohesion and Sequencing (for phase packs or multi-story planning)
- Higher-level pack objectives:
  - hosted Railway runtime
  - durable hosted workspace
  - lightweight access token gate
  - typed production deploy flow
  - trustworthy two-URL UX
  - browser file upload into the hosted chat flow
- Story ordering rationale: this story should land after `P9-S01`,
  `P9-S02`, and `P9-S05` because uploads need a real hosted runtime, an
  authenticated public surface, and durable storage before the browser can rely
  on them.
- Gaps/overlap check: this story owns intake, safe storage, session hydration,
  and attach-to-turn context synthesis. It does not attempt OCR, binary
  parsing, or deploy behavior.
- Whole-pack success signal: a hosted user can hand Shipyard a browser-local
  text file and watch that material become durable, inspectable next-turn
  context.

## Architecture Decisions
- Decision: use a dedicated HTTP multipart upload path instead of overloading
  the existing websocket `instruction` message with base64 or binary blobs.
- Alternatives considered:
  - embed file bytes in the websocket JSON payload
  - use websocket binary frames and invent a second message protocol
  - require the user to paste file contents manually
- Rationale: the current browser contract is text-oriented and session-scoped;
  a separate intake path keeps uploads bounded, explicit, and easier to
  validate.
- Decision: store uploads under a Shipyard-managed workspace location such as
  `target/.shipyard/uploads/<sessionId>/` with generated filenames.
- Alternatives considered:
  - write files directly into the project root
  - keep uploads only in browser memory or local storage
  - expose uploads from the same static directory that serves the UI
- Rationale: Shipyard needs durable server-side storage that remains accessible
  to its existing file tools without turning uploads into a public asset host.
- Decision: first pass stays text-first and injects stored-path references plus
  bounded previews, not raw full-file contents for every upload.
- Alternatives considered:
  - inline full file contents into the prompt
  - promise immediate support for PDFs, images, and other binary formats
  - require the agent to discover uploads with no hint in the next turn
- Rationale: prompt size and current tool capability both argue for an honest,
  bounded, text-oriented handoff.

## Data Model / API Contracts
- Request shape:
  - authenticated `POST /api/uploads` (name illustrative) using multipart form
    data with one or more files and the current session identifier
- Response shape:
  - typed upload receipts with stable receipt id, original filename, generated
    relative path, size in bytes, client or server media-type hint, preview
    text when supported, and any validation failure details
  - `session:state` hydration extended with pending uploaded attachments for
    reconnect recovery
- Storage/index changes:
  - add a Shipyard-managed upload directory under the target workspace
  - persist pending attachment receipts in `workbenchState` or adjacent session
    metadata so refresh and reconnect can recover them cleanly

## Dependency Plan
- Existing dependencies used:
  - current Node HTTP server and websocket runtime
  - session persistence and workbench-state hydration
  - current injected-context and trace or event surfaces
- New dependencies proposed (if any):
  - ideally none; if native multipart parsing on the current Node HTTP surface
    proves awkward, allow one lightweight multipart parser rather than a full
    framework or upload stack
- Risk and mitigation:
  - Risk: uploads bloat prompts or traces.
  - Mitigation: persist the file, inject only a bounded preview plus path, and
    never log raw file bytes.
  - Risk: unsafe filenames or public serving create security issues.
  - Mitigation: generate stored filenames, allowlist file types, bound size,
    and store outside the UI asset root.
  - Risk: users expect binary or PDF or image understanding the runtime does
    not yet have.
  - Mitigation: keep the first pass text-first and fail unsupported formats
    clearly in the browser.

## Test Strategy
- Unit tests:
  - upload receipt validation and filename normalization
  - pending-attachment persistence and hydration helpers
  - injected-context synthesis from upload receipts
- Integration tests:
  - successful upload route storing a file and returning a receipt
  - reconnect recovering pending attachments from session state
  - next instruction submission carrying attachment references into the runtime
- E2E or smoke tests:
  - hosted browser flow: attach file, refresh, submit, and confirm the agent
    can read the stored upload through normal file tools
- Edge-case coverage mapping:
  - duplicate filename
  - oversized or unsupported upload
  - upload while disconnected or unauthenticated
  - target switch before attachment handoff

## UI Implementation Plan (if applicable)
- Behavior logic modules:
  - App-level upload lifecycle, retry or remove handling, and attach-to-turn
    submission rules
- Component structure:
  - add an attach control and receipt badges to `ComposerPanel`
  - surface upload failures through existing composer notices or activity UI
- Accessibility implementation plan:
  - keyboard-triggered file picker, per-file remove controls, and live-region
    announcements for upload success or failure
- Visual regression capture plan:
  - ready-to-attach composer
  - uploading state
  - attached receipts
  - rejected attachment with error detail

## Rollout and Risk Mitigation
- Rollback strategy: keep text-only context injection as the stable fallback if
  the upload route or persistence needs to be disabled.
- Feature flags/toggles: if rollout caution is needed, gate the attach control
  behind a hosted-upload capability flag while keeping the backend route off by
  default locally.
- Observability checks: trace upload acceptance or rejection, session hydration
  of pending receipts, and the exact moment attachments are converted into
  next-turn context.

## Validation Commands
```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```
