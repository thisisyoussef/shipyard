# QA Critic Brief

## Story
- Story ID: P5-S01
- Story Title: Local Preview Runtime and Auto Refresh
- Date: 2026-03-24

## Verification Evidence

- Local runtime route observed during the browser pass: `http://127.0.0.1:58441`
- Preview loopback URL observed in the running panel: `http://127.0.0.1:4177/`
- Local screenshot artifact captured during the pass: `p5-s01-preview-panel.png` (not committed)
- `pnpm --dir shipyard exec tsx tests/manual/phase5-local-preview-smoke.ts`
- `pnpm --dir shipyard test`
- `pnpm --dir shipyard typecheck`
- `pnpm --dir shipyard build`
- `git diff --check`

## Strengths

- The new preview panel makes runtime state legible at a glance: status, loopback URL, last refresh reason, and live iframe all sit in one place.
- The running state feels trustworthy because the iframe shows the actual local preview instead of a guessed or mocked placeholder.
- Recent logs stay behind a disclosure control, so diagnostics remain available without overwhelming the main workbench surface.
- Unsupported targets still read cleanly because the panel explains why preview is unavailable instead of implying a hidden failure.

## Findings

- No blocking usability issues remained after the footer status copy fix landed in the same story.
- Low severity: the instruction composer can retain a stale draft across a persistent browser session, which makes the next action feel less clean than the rest of the flow.

## Recommendation

- Accept the story as implemented.
- Track the stale composer draft as a follow-on polish item rather than reopening this story.

## Suggested Follow-On

1. Add explicit composer reset rules for restored or long-lived browser sessions so old draft text does not leak into a new instruction cycle.
