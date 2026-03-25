# UI QA Critic Brief

## Story
- Story ID: UIR-S03
- Story Title: Context and Session UX Polish
- Date: 2026-03-24

## Verification Evidence

- `pnpm --dir shipyard test`
- `pnpm --dir shipyard typecheck`
- `pnpm --dir shipyard build`
- `git diff --check`
- `SHIPYARD_UI_PORT=3212 pnpm --dir shipyard start -- --target ../test-targets/tic-tac-toe --ui --session critic-current-run`
- Route and surface: `http://127.0.0.1:3212`, left sidebar session and saved-runs panels
- Local Playwright screenshot pass against `http://127.0.0.1:3212`

## What Improved

- Session state is surfaced immediately with a banner that distinguishes restored, reconnecting, steady, and attention-needed modes.
- Context handling is more trustworthy because queued notes, the last attached context, and recent injections are all visible in the same panel.
- Saved runs now live in a separate sidebar panel with a direct resume action, so
  reopening an earlier run no longer requires restarting the Shipyard process.
- Composer shortcuts and inline notices make it clearer how to submit, recover from empty input, and clear a queued context note without breaking flow.
- Error and reconnect states now explain the recovery path instead of leaving the operator to infer what happens next.

## Findings

- No high-severity usability issues found in the local smoke pass.
- Low severity: saved-run cards become tall quickly when the latest instruction
  wraps across several lines in the narrow sidebar.
- Low severity: the resume action is clear, but there is no inline hint yet that
  the action keeps the current Shipyard process alive and only swaps the active
  session state.

## Recommendation

- Accept the story as implemented.
- Suggested follow-on: add a short helper line or tooltip in the saved-runs
  panel explaining that resume switches sessions without restarting Shipyard.
- Suggested follow-on: clamp saved-run titles in the left sidebar while keeping
  the full text available on hover or focus.
