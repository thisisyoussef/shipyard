# Feature Spec

## Metadata
- Story ID: UII-S06
- Story Title: Cross-View Resilience, Polish, and Release Gate
- Author: Codex
- Date: 2026-03-28
- Related PRD/phase gate: Phase UI Integration

## Problem Statement

A multi-view UI can be fully wired and still feel unreliable if loading states,
route fallbacks, reconnect behavior, preview-harness parity, and docs are left
to the end or skipped entirely. This pack is explicitly about making the new UI
seamless, which means the final story must close the gaps between “integrated”
and “trustworthy.” Shipyard needs one finishing gate for resilience, UX polish,
validation, and docs sync.

## Story Pack Objectives
- Objective 1: make every major route and system state explicit and readable.
- Objective 2: preserve local state and operator trust across reloads,
  reconnects, and missing-runtime cases.
- Objective 3: close the pack with validation, docs, and a reusable audit path.
- How this story contributes to the overall objective set: it turns the pack
  from a set of connected stories into a release candidate.

## User Stories
- As an operator, I want every route to explain what is happening when data is
  loading, unavailable, stale, or unauthorized.
- As an operator, I want my active product and UI preferences to come back
  after reload instead of feeling random.
- As a maintainer, I want docs and QA artifacts that explain how to validate the
  new experience end to end.

## Acceptance Criteria
- [x] AC-1: Dashboard, editor, board, hosted-access, and human-feedback routes
  all have explicit loading, empty, error, reconnect, and missing-target states
  where applicable.
- [x] AC-2: Local UI memory restores active product, dashboard preferences,
  editor layout/tab state, and board filters after reload when possible.
- [x] AC-3: `/human-feedback`, hosted access gating, preview harness, and any
  legacy bookmarks used by operators still work after the pack lands.
- [x] AC-4: The pack’s docs, spec index, and user audit checklist are updated
  to reflect the shipped experience and any intentional deferred work.
- [x] AC-5: Build, typecheck, focused tests, and a final `git diff --check`
  pass; high-severity UX/a11y/perf issues are fixed or explicitly documented.

## Edge Cases
- Empty/null inputs: no target selected, empty board, no recent product history.
- Boundary values: reconnect during active turn or during active ultimate mode.
- Invalid/malformed data: stale route params or missing stored UI prefs are
  ignored safely.
- External-service failures: access check failures, preview failures, or file
  API failures surface explicit next-step guidance.

## Non-Functional Requirements
- Reliability: operators should never need to infer hidden state.
- Accessibility: all critical routes and state notices stay keyboard and
  screen-reader accessible.
- Performance: polish must not add expensive effects or regress interaction
  speed.
- Maintainability: final docs and audit guidance make future regression checks
  repeatable.

## UI Requirements
- Required states: loading, reconnecting, unauthorized, missing target, preview
  unavailable, stale board, empty dashboard, empty editor panes.
- Accessibility contract: state notices, retry actions, filters, and route
  fallbacks remain keyboard reachable and clearly labeled.
- Design token contract: polish uses existing tokens, motion limits, and
  semantic colors only.
- Visual-regression snapshot states: one final matrix across dashboard, editor,
  ultimate active, board stale, and access gate.

## Out of Scope
- New net-new product features beyond resilience/polish.
- Expanding Phase 11 runtime foundations.
- Visual redesign beyond what is needed to finish the integrated experience.

## Done Definition
- The integrated multi-view Shipyard UI is resilient, documented, auditable,
  and ready for implementation validation instead of feeling like a partial demo.

## Implementation Evidence

- AC-1 landed in `shipyard/ui/src/App.tsx`,
  `shipyard/ui/src/views/BoardView.tsx`,
  `shipyard/ui/src/board-view-model.ts`,
  `shipyard/ui/src/dashboard-system-notice.ts`,
  `shipyard/ui/src/HostedAccessGate.tsx`,
  `shipyard/ui/src/HumanFeedbackPage.tsx`,
  `shipyard/ui/src/views/KanbanView.tsx`, and the focused coverage in
  `shipyard/tests/ui-board-view-model.test.ts`,
  `shipyard/tests/ui-dashboard-system-notice.test.ts`,
  `shipyard/tests/ui-access.test.ts`, and
  `shipyard/tests/ui-human-feedback-page.test.ts`. Representative snippet:
  ```ts
  if (board.status === "loading") {
    return (
      <RoutePlaceholderView
        kicker="Board"
        title={board.emptyState?.title ?? "Loading board"}
        description={board.emptyState?.detail ?? "..."}
      />
    );
  }
  ```
- AC-2 landed in `shipyard/ui/src/board-preferences.ts`,
  `shipyard/ui/src/board-view-model.ts`,
  `shipyard/ui/src/target-selection.ts`,
  `shipyard/ui/src/App.tsx`,
  `shipyard/ui/src/dashboard-preferences.ts`,
  `shipyard/ui/src/editor-preferences.ts`, and
  `shipyard/tests/ui-board-preferences.test.ts`. The board now persists its
  selected story filter per target path, while editor and dashboard preference
  restore behavior stays intact.
- AC-3 landed in `shipyard/ui/src/views/KanbanView.tsx`,
  `shipyard/ui/src/views/BoardView.tsx`,
  `shipyard/ui/src/preview-harness.tsx`,
  `shipyard/ui/src/HostedAccessGate.tsx`, and
  `shipyard/ui/src/HumanFeedbackPage.tsx`. The preview harness still renders
  mock board data because `KanbanView` keeps a prop-optional mock fallback,
  while the production app now passes live board state through `BoardView`.
- AC-4 landed in `shipyard/docs/specs/phase-ui-integration/README.md`,
  `shipyard/docs/specs/phase-ui-integration/user-audit-checklist.md`,
  `shipyard/docs/specs/phase-ui-integration/uii-s06-cross-view-resilience-polish-and-release-gate/task-breakdown.md`,
  and `shipyard/ui/src/README.md`.
- Post-ship editor polish extended the same resilience/polish lane into
  `shipyard/ui/src/styles.css`, `shipyard/ui/src/shell/shell.css`,
  `shipyard/ui/src/panels/panels.css`, and
  `shipyard/ui/src/panels/FormattedMessage.tsx` so the editor shell fills the
  full available viewport and assistant replies stay readable when they contain
  structured markdown-like content.
- Post-ship hosted preview hardening extended the same resilience lane into
  `shipyard/ui/src/preview-surface.ts`,
  `shipyard/ui/src/dashboard-catalog.ts`,
  `shipyard/ui/src/panels/PreviewPanel.tsx`,
  `shipyard/ui/src/views/EditorView.tsx`, and
  `shipyard/ui/src/App.tsx` so hosted sessions stop surfacing unreachable
  `127.0.0.1` preview URLs and instead prefer the latest public deployment or
  hosted-editor fallback.
- AC-5 is covered by the required validation matrix for this story:
  `pnpm --dir shipyard test`, `pnpm --dir shipyard typecheck`,
  `pnpm --dir shipyard build`, and `git diff --check`, plus the preview-harness
  smoke verification at `/preview.html`.
