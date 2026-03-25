# Feature Spec

## Metadata
- Story ID: P9-S06
- Story Title: Browser File Upload and Shipyard Context Intake
- Author: Codex
- Date: 2026-03-25
- Related PRD/phase gate: Phase 9 hosted Shipyard and public deploy

## Problem Statement

The current browser workbench can only send plain-text instructions and plain-
text injected context. That is workable on a local machine where the operator
can point Shipyard at files that already exist in the same filesystem, but it
breaks down in a hosted Railway flow: a reviewer may have a local spec, sample
data file, or config snippet they want Shipyard to inspect, yet the hosted
runtime cannot see that browser-local path. Shipyard needs one first-class
story for uploading a local file through the chat flow, storing it safely in
the hosted workspace, and feeding the resulting reference into the next turn.

## Story Pack Objectives (for phase packs or multi-story planning)
- Objective 1: Run Shipyard's browser runtime as a public Railway service with
  a predictable server-side workspace.
- Objective 2: Protect the hosted Shipyard URL with a lightweight access gate.
- Objective 3: Let Shipyard deploy the current target project to a public URL
  from inside the target directory.
- Objective 4: Make the hosted Shipyard URL and deployed target-app URL
  clearly distinct in the UX.
- Objective 5: Persist hosted project files across sessions, service restarts,
  and Railway redeploys, starting with a mounted volume at `/app/workspace`.
- Objective 6: Let hosted users upload local reference files into the chat flow
  so Shipyard can inspect them without relying on browser-only filesystem
  paths.
- How this story or pack contributes to the overall objective set: This story
  closes a major hosted-workbench gap by giving the browser a safe path to hand
  local reference material to the agent.

## User Stories
- As a hosted Shipyard user, I want to attach a local text file to the chat so
  I do not have to paste long content manually into the context box.
- As a reviewer sharing a prompt pack, spec, or sample data file, I want the
  hosted agent to receive a durable stored-path reference for the next turn so
  it can inspect the upload with the existing tool surface.

## Acceptance Criteria
- [ ] AC-1: The browser workbench exposes an `Attach files` control in the chat
  flow that supports selecting one or more files, shows pending attachment
  badges, and lets the user remove an attachment before sending the next turn.
- [ ] AC-2: Uploads travel through a dedicated backend file-intake contract
  separate from the current JSON websocket instruction payload.
- [ ] AC-3: The server validates allowlisted file types, file-size limits,
  filename safety, and session ownership before persisting uploads under the
  hosted workspace or `target/.shipyard/uploads/` path outside the served web
  root.
- [ ] AC-4: Successful uploads return typed receipts that include the original
  filename, generated stored relative path, size, media type, and a bounded
  preview or extraction summary when the format is supported.
- [ ] AC-5: When the operator submits the next instruction, Shipyard
  automatically injects attachment references and previews into the turn so the
  agent can discover and read the uploaded files without the user manually
  pasting their contents.
- [ ] AC-6: Pending upload receipts survive refresh or reconnect for the active
  session and clear only after explicit removal or after the story-defined
  attach-to-turn handoff is complete.
- [ ] AC-7: Oversized, malformed, duplicate, or unsupported binary uploads fail
  clearly in the browser and do not create hidden partial state or leaked
  filesystem paths.
- [ ] AC-8: Upload activity is visible in session state and trace or activity
  surfaces without logging raw file bytes or secret-bearing absolute host
  paths.
- [ ] AC-9: Existing text-only context injection, local `--ui`, and terminal
  flows remain backward compatible when attachments are not used.

## Edge Cases
- The user uploads the same filename twice before sending the next turn.
- The uploaded file is empty, oversized, or only contains binary data.
- The browser disconnects or refreshes while an upload is in flight.
- The operator uploads files, then switches targets before using them.
- Access-token protection is enabled and an unauthenticated request hits the
  upload route.
- The persistent hosted workspace is missing or unwritable when the upload
  should be stored.

## Non-Functional Requirements
- Security: validate extensions, size, filename safety, and storage location;
  do not serve uploaded files directly from the web root or trust client MIME
  headers alone.
- Performance: keep upload previews bounded so one large file does not explode
  prompt size or block the UI for long periods.
- Observability: upload acceptance, rejection, and attach-to-turn handoff
  should appear in the same runtime evidence model as other browser actions.
- Reliability: uploaded references should survive refresh or reconnect for the
  active session when hosted persistence is configured.

## UI Requirements (if applicable)
- Required states: idle, selecting, uploading, attached, rejected, and
  disconnected-retry.
- Accessibility contract: the attach trigger, per-file remove action, and
  error or progress messaging remain keyboard and screen-reader accessible.
- Design token contract: attachment UI should reuse the current composer,
  notice, and badge patterns rather than introducing a second upload widget
  language.
- Visual-regression snapshot states: empty composer, uploading attachment,
  attached receipts ready for the next turn, and rejected attachment with a
  clear error.

## Out of Scope
- OCR, PDF parsing, image understanding, or other binary-file interpretation
  beyond the current text-oriented tool surface.
- A general file manager, download center, or public asset-hosting UI.
- Drag-and-drop polish if a standard file-picker control is enough for the
  first pass.
- Antivirus or CDR integration beyond baseline validation and safe storage.

## Done Definition
- A hosted user can attach a supported local file through the browser workbench.
- Shipyard stores the file safely in the hosted workspace and remembers the
  attachment through reconnect.
- The next turn receives a trustworthy stored-path reference plus bounded
  preview context instead of an ad hoc blob dump.
