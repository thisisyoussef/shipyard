# UI QA Critic Brief

## Story
- Story ID: UIR-S02
- Story Title: Activity and Diff Experience Overhaul
- Date: 2026-03-24

## Verification Evidence

- `pnpm --dir shipyard test`
- `pnpm --dir shipyard typecheck`
- `pnpm --dir shipyard build`
- Local runtime smoke: `SHIPYARD_UI_PORT=3212 pnpm --dir shipyard start -- --target ../test-targets/tic-tac-toe --ui --session critic-current-run`
- Route and surface: `http://127.0.0.1:3212`, center activity feed, left saved-runs sidebar
- Local Playwright screenshot pass against `http://127.0.0.1:3212`

## What Improved

- Tool activity now reads as grouped execution blocks instead of flat log rows.
- The feed uses plain-language step headlines such as `Reading package.json`
  and `Planning the next step` instead of raw transport wording.
- Failed tool steps surface their inline error detail in the same block as the originating tool.
- Diff previews now use explicit `ADD`, `DEL`, `CTX`, and `META` labels so color is not the only cue.
- The UI defaults to a latest-run focus and lets the operator switch to all runs when history matters.

## Findings

- No high-severity usability issues found in the local smoke pass.
- Low severity: when a latest turn has many grouped steps, the default expanded
  blocks can push the lower activity items below the fold quickly. The
  disclosure pattern is sound, but a future polish pass could collapse finished
  blocks more aggressively after first view.
- Low severity: long run and instruction titles wrap heavily in the left sidebar
  and make the saved-run cards tall on laptop-height viewports.

## Recommendation

- Accept the story as implemented.
- Suggested follow-on: clamp long saved-run titles to two lines in the sidebar
  while keeping the full instruction in the resume button tooltip.
- Suggested follow-on: experiment with auto-collapsing completed activity blocks
  after the newest block has been inspected once.
