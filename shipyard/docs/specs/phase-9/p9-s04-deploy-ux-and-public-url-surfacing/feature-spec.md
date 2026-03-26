# Feature Spec

## Metadata
- Story ID: P9-S04
- Story Title: Deploy UX and Public URL Surfacing
- Author: Codex
- Date: 2026-03-25
- Related PRD/phase gate: Phase 9 hosted Shipyard and public deploy

## Problem Statement

Even with a deploy tool, hosted operators still need a trustworthy browser
experience that publishes shareable URLs automatically after successful edits,
reports status clearly, and keeps the public production URL distinct from any
localhost-only runtime surface. Right now the workbench still leans on a
manual deploy-first mental model and shows preview UI that is not actually
shareable in hosted mode.

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
- How this story or pack contributes to the overall objective set: This story
  turns the hosted runtime and deploy primitive into a clear, trustworthy
  operator experience.

## User Stories
- As a hosted Shipyard user, I want Shipyard to publish successful code edits
  automatically so I do not have to ask for deploys explicitly every time I
  need a public URL.
- As a reviewer, I want the workbench to show the latest deployed target-app
  URL directly in the target header so I can open or share the live app
  without seeing misleading localhost preview UI.

## Acceptance Criteria
- [ ] AC-1: When a code target is active and `VERCEL_TOKEN` is configured,
  successful edited turns automatically publish the current target to Vercel.
- [ ] AC-2: Automatic publishes and explicit deploy requests both travel
  through the same first-class backend contract and surface in activity/live
  status without requiring the model to invent all UI copy.
- [ ] AC-3: The UI shows explicit deploy states: idle, deploying, success, and
  error.
- [ ] AC-4: On success, the latest production URL is shown in the target header
  and clearly labeled as the deployed target-app URL.
- [ ] AC-5: The latest deploy result survives refresh/reconnect for the active
  target so the operator can recover the share link later.
- [ ] AC-6: Failure states surface provider output excerpts and next-step
  guidance without leaking secrets.
- [ ] AC-7: The hosted workbench removes localhost preview UI and does not
  imply the current preview surface is automatically a public cloud preview.
- [ ] AC-8: CLI and natural-language deploy flows continue to work via the
  underlying tool surface even if automatic publish becomes the primary UX.

## Edge Cases
- A deploy is requested while the agent is already busy on another turn.
- No target is selected yet.
- `VERCEL_TOKEN` is missing even though a hosted target is active.
- The operator switches targets after a successful deploy.
- Multiple deploys happen in one session and the latest URL must win.
- A turn reads files only and should not trigger an unnecessary publish.
- Preview is unavailable or local-only while production deploy still succeeds.

## Non-Functional Requirements
- Accessibility: publish status, error excerpts, and resulting links must be
  keyboard and screen-reader accessible.
- Reliability: deploy state must survive refresh/reconnect for the active
  target.
- Observability: deploy progress and failure summaries should appear in the
  same evidence surfaces as other Shipyard work.
- Truthfulness: URL labels and copy must not overpromise public preview
  behavior.

## UI Requirements (if applicable)
- Required states: idle, prerequisites missing, deploying, success, and error.
- Accessibility contract: status text, error excerpts, and the production URL
  link are all reachable by keyboard and announced clearly.
- Design token contract: deploy surfaces should reuse the current workbench
  tokens and shell patterns.
- Visual-regression snapshot states: disabled deploy, deploying, successful
  deploy with URL, failed deploy with error text.

## Out of Scope
- Automatic publish after read-only or failed turns.
- Cross-session deployment history dashboards.
- Environment management UI for multiple platforms.
- Replacing the local preview panel with a hosted sandbox preview.

## Done Definition
- The browser workbench has a trustworthy deploy surface.
- The latest production URL is recoverable after refresh/reconnect.
- Hosted Shipyard makes the difference between editor URL and deployed app URL
  obvious.

## Implementation Evidence

### Code References

- Automatic publish trigger and persisted deploy recovery:
  - `shipyard/src/ui/server.ts`
  - `shipyard/tests/ui-runtime.test.ts`
- Hosted workbench public-link surface:
  - `shipyard/ui/src/ShipyardWorkbench.tsx`
  - `shipyard/ui/src/TargetHeader.tsx`
  - `shipyard/tests/ui-workbench.test.ts`
- React/Vite deployability baseline for new hosted targets:
  - `shipyard/src/tools/target-manager/scaffolds.ts`
  - `shipyard/tests/scaffold-bootstrap.test.ts`
- Hosted edit handling keeps preview refresh asynchronous so it cannot block
  deploy completion:
  - `shipyard/src/ui/server.ts`
  - `shipyard/tests/ui-runtime.test.ts`

### Representative Snippets

```ts
if (
  turnResult.status === "success" &&
  turnProducedEdits &&
  turnResult.selectedTargetPath === null &&
  sessionState.activePhase === "code"
) {
  await runBrowserDeploy({ platform: "vercel" }, signal, { mode: "automatic" });
}
```

```tsx
{hasPublicApp ? (
  <a className="target-primary-action" href={props.latestDeploy.productionUrl ?? undefined}>
    Open app
  </a>
) : null}
```

```ts
types: ["vite/client"],
```

```ts
void (async () => {
  await previewSupervisor.refresh(event.path);
})();
```
