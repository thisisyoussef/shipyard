# UI QA Critic Brief

## Story
- Story ID: UIR-S02
- Story Title: Activity and Diff Experience Overhaul
- Date: 2026-03-24

## Verification Evidence

- `pnpm --dir shipyard test`
- `pnpm --dir shipyard typecheck`
- `pnpm --dir shipyard build`
- `curl -I http://127.0.0.1:3210`
- Local runtime smoke: `pnpm --dir shipyard start -- --target . --ui --session uir-s02-smoke`

## What Improved

- Tool activity now reads as grouped execution blocks instead of flat log rows.
- Failed tool steps surface their inline error detail in the same block as the originating tool.
- Diff previews now use explicit `ADD`, `DEL`, `CTX`, and `META` labels so color is not the only cue.
- The UI defaults to a latest-run focus and lets the operator switch to all runs when history matters.

## Findings

- No high-severity usability issues found in the local smoke pass.
- Low severity: the footer still shows the raw trace path as plain text, which is accurate but visually noisy.
- Low severity: the file sidebar still relies on turn IDs like `turn-2`; a friendlier label would improve polish in a later story.

## Recommendation

- Accept the story as implemented.
- Consider using `UIR-S03` to refine trace/session copy and turn labeling now that the core activity and diff trust surfaces are stronger.
