# AI Development Log

## Tools and Workflow

The primary tool was Shipyard itself running in browser workbench mode with the
`ultimate` loop enabled. That gave me a live preview, transcript, target-local
state, checkpoint-backed handoffs, and a human-simulator continuation layer on
top of a mixed-provider runtime: Anthropic-backed target enrichment and early
turns, then later OpenAI `gpt-5.4` mission-control and human-simulator routes
once the long-run session was rewired. Around that core loop, I used:

- `gh` for runtime-fix PRs and merges back to `main`
- LangSmith trace links emitted by Shipyard for normal and failure paths
- launchd plus watchdog scripts to keep the live target, preview, and mission
  control stack alive over long runs
- Vercel CLI to publish the submission target and then refresh it on a schedule
- the sidecar release-archive repo to snapshot target states after preview
  refreshes

The workflow was iterative and intervention-heavy:

1. Let `ultimate` run on the target until it either shipped visible product
   work or got stuck.
2. Inspect the preview, trace, and filesystem evidence instead of trusting the
   model's completion text.
3. Feed back a narrower product story when the loop drifted.
4. Patch Shipyard itself when the loop failure was infrastructural rather than
   product-specific.
5. Resume the same saved session from the latest handoff instead of starting
   clean.

## Effective Prompts

These are the actual prompt styles that worked best during the rebuild:

1. `ultimate start Continue building the Ship remake from the prompt-pack-only target using the current generated app as the starting point. Review the live preview, inspect the code, compare progress against the Ship prompt pack, choose the next highest-leverage missing product capability, implement it, visually review the result, reinstruct yourself with precise feedback, and keep iterating indefinitely until an actual human interrupt.`
2. `Continue building the Ship remake from the prompt-pack-only target using the current generated app as the starting point. Resume from the persisted handoff for the in-flight /team/:id person detail work before widening scope. Use the current disk state and live preview as source of truth, finish the real person profile experience backed by store relationships, visually review it, then continue the normal highest-leverage Ship loop until a real human interrupts.`
3. `Implement the weekly workflow end to end now and do not touch any unrelated feature. You must make real code changes in exactly these files: src/store.ts, src/pages/MyWeek.tsx, and src/pages/DocumentDetail.tsx, using src/types.ts as the fixed contract.`
4. `Implement the collaboration pass now with actual code edits in src/pages/DocumentDetail.tsx, and make sure that file changes on disk this turn. Replace the current TabPlaceholder handling for Comments and Activity with real UI in that file only.`
5. `Derived from the real product at /Users/youss/Development/gauntlet/ship, focusing on actual user-facing behavior across web/src/pages/** and the user-story coverage encoded in the E2E suite under e2e/**. Goal: recreate the visible Ship product experience in this target app, not the harness or infrastructure.`

What made these work was not style alone. The strongest prompts all did three
things:

- pointed the model at real evidence, not just intent
- constrained scope to a product story or a very small file set
- required visual or build verification before the next story

## Code Analysis

Roughly `90%` to `95%` of the target-app code was AI-generated. The human-written
share was concentrated in:

- prompt engineering and intervention prompts
- runtime fixes inside Shipyard itself
- long-run supervision scripts and launchd plumbing
- submission/deployment automation
- the final written analysis

If I separate the target app from the supporting runtime work, the target
frontend is closer to `95%+` AI-generated, while the Shipyard recovery and ops
hardening work had a noticeably larger human share because those fixes were
driven by concrete failure diagnosis rather than feature synthesis.

## Strengths and Limitations

Strengths on this project:

- very fast generation of credible UI surface area
- good at turning product-language prompts into visible route/page work
- strong willingness to keep iterating when paired with checkpoints and
  persisted handoffs
- useful self-improvement pressure on the runtime itself

Limitations on this project:

- weak self-policing on type contracts and strict build health
- repeated drift toward huge single-file edits
- susceptibility to malformed tool payloads when asked to rewrite too much at
  once
- long-run supervision failures that required nontrivial human ops work
- expensive tendency to keep exploring while not actually changing disk state

## Key Learnings

- Instrument cost and usage before the run starts. Reconstructing spend later is
  avoidable pain, especially once OpenAI and Anthropic are both in play.
- Long-run autonomy needs mission control, not optimism.
- Smaller file budgets produce better edits than broad "finish this whole mode"
  prompts.
- The best prompt is usually the one that names the evidence source, the exact
  file scope, and the verification gate.
- When rebuilding a product, derive backlog prompts from the real app and its
  tests earlier. The parity pack based on `ship/web/src/**` and `ship/e2e/**`
  arrived later than it should have.
