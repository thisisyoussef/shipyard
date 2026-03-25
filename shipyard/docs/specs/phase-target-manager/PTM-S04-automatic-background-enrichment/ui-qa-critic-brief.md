# UI QA Critic Brief

## Story
- Story ID: PTM-S04
- Story Title: Automatic Background Enrichment
- Date: 2026-03-25

## Verification Evidence

- `pnpm --dir shipyard exec vitest run tests/target-auto-enrichment.test.ts tests/ui-view-models.test.ts tests/ui-workbench.test.ts tests/ui-runtime.test.ts`
- `pnpm --dir shipyard build`
- `SHIPYARD_UI_PORT=3213 pnpm --dir shipyard test-target:ui`
- Route and surface: `http://127.0.0.1:3213/?v=ptm-s04-rebased`, split-pane workbench target header plus preview workspace
- Browser session observed: `aDbo6IWcR2_rO8Rsq4ucY`
- Local trace evidence: `test-targets/tic-tac-toe/.shipyard/traces/aDbo6IWcR2_rO8Rsq4ucY.jsonl`
- Local screenshot artifact captured during the pass: `ptm-s04-target-header.png` (local artifact, not committed)

## What Improved

- The target now becomes usable immediately while enrichment runs in the background, so create/switch no longer feels like a two-step setup flow.
- The passive status badge keeps enrichment visible without competing with the primary target-switch action.
- The split-pane UI still reads clearly after the PTM-S04 change: target identity, status, and preview all remain visible in one scan path.
- The header no longer exposes `Enrich target` or `Retry enrichment`, which keeps the default workflow aligned with the story intent.

## Findings

- No blocking usability issues were found in the rebased UI pass.
- Low severity: on fast targets, the badge can move from idle to `Target profile saved.` quickly enough that operators may miss that automatic analysis happened at all unless they also notice the changed description or inspect the local trace.

## Recommendation

- Accept the story as implemented on the current split-pane workbench.
- Keep the fast-path badge transition as-is for now; it is trustworthy and non-blocking.

## Suggested Follow-On

1. Add an optional short-lived completion pulse or timestamp for target analysis so fast automatic enrichments remain noticeable without reintroducing a primary CTA.
