# Comparative Analysis

This analysis compares the real Ship application in
`/Users/youss/Development/gauntlet/ship` with the agent-built remake in
`/Users/youss/Development/gauntlet/ship-promptpack-ultimate`. The comparison is
based on the rebuild session `feXVo-pa-Pb-LXYgUNEEh`, the local trace,
watchdog/deploy logs, and the archived refresh snapshots.

## Executive Summary

I used Shipyard's browser workbench and `ultimate` loop to push a generated Vite
target toward Ship feature parity, then repeatedly had to step in when the
agent got stuck on long-run supervision, malformed edits, type-contract drift,
and missing rollback safety. The rebuild succeeded at producing a believable
single-page Ship-like experience across dashboard, docs, document detail, team,
weeks, settings, admin, and feedback, but it did not reach true parity with the
original product. The best parts were speed of visible UI generation and the
ability to keep iterating with checkpoints and archived refreshes. The worst
parts were architectural flattening, type-unsound output, supervision fragility,
and the amount of human intervention required to keep the loop building instead
of spinning.

## Architectural Comparison

The original Ship app is a real multi-surface product. It runs as a monorepo,
uses separate API and web packages, leans on React Query plus multiple domain
contexts, wires in auth, realtime events, uploads, review queues, and lazy
loads most page surfaces from `web/src/main.tsx`. The agent-built remake
collapsed that structure into a single local Vite SPA with one in-memory
`StoreProvider`, seeded data, and a handful of large page files such as
`src/pages/DocumentDetail.tsx`, `src/pages/MyWeek.tsx`, and `src/pages/Team.tsx`.

That collapse was not random. It is exactly the kind of choice an agent makes
when optimizing for visible parity under uncertainty:

- It chose one local reducer over API-backed domain boundaries because that was
  the fastest way to make many routes clickable.
- It over-concentrated behavior into large page files instead of preserving the
  original app's provider and component boundaries.
- It reused the canonical detail-route idea aggressively, but it underbuilt the
  supporting systems that make the real product feel durable: auth state,
  realtime sync, uploads, review queues, search APIs, and collaboration safety.
- It preferred seeded relationships and fallback-derived activity over true
  persistence. That made the target demoable, but not trustworthy in the same
  way as the original.

The most agent-specific structural tell is that the remake optimized first for
surface coverage, then tried to backfill correctness. A human developer would
almost certainly have locked the document model, week contract, and settings
surface boundaries earlier instead of allowing `DocumentDetail.tsx`,
`MyWeek.tsx`, `Team.tsx`, and `store.ts` to become the main pressure valves.

## Performance Benchmarks

The most useful benchmarks here are structural and behavioral, not just bundle
speed:

| Metric | Original Ship | Agent-built remake | What it means |
| --- | --- | --- | --- |
| TS/TSX source files | `236` in `ship/web/src` | `22` in `ship-promptpack-ultimate/src` | The remake is dramatically flatter and less modular. |
| TS/TSX source lines | `55,119` | `7,109` | The agent rebuilt only a thin slice of the original system depth. |
| Component files | `137` | `3` | The original has a real component system; the remake keeps behavior in pages. |
| Page files | `29` | `12` | Several real Ship surfaces never became first-class pages in the remake. |
| Test files in app source | `34` | `0` | The target has no test safety net. |
| E2E specs in original repo | `78` | `0` in target | The original product has wide behavioral coverage; the remake does not. |
| Strict build status | original app designed for full package builds | target `npm run build` fails | The remake is previewable, not contract-clean. |
| Fallback production bundle | not measured here | `751.83 kB` JS, `56.01 kB` CSS, built in `1.96s` with `npx vite build` | The submission deploy works only because the automation bypasses the TypeScript gate. |
| Recoverable long-run session activity | not applicable | `4` non-empty sessions, `268` top-level turns, `17` `ultimate` activations, `211` internal cycles, `10` archived refreshes | The rebuild was a long autonomous run with repeated intervention. |

The strict target build failure is especially important. At the time of writing,
`npm run build` in the target fails with cross-file type errors in
`src/pages/DocumentDetail.tsx`, `src/pages/MyWeek.tsx`, `src/pages/Team.tsx`,
and `src/store.ts`, while `npx vite build` still emits a production bundle. In
other words, the rebuild reached "deployable demo" before it reached "correct
application contract."

The original Ship app also clearly outperforms the remake on route-loading
strategy. `web/src/main.tsx` lazy-loads most pages. The remake ships as one
large production chunk, which is the predictable output of an agent that keeps
adding route behavior without going back to introduce chunk boundaries.

## Shortcomings

These are the concrete failure modes from the rebuild log, plus what each one
revealed about the agent:

1. The first long `ultimate` run stopped after `40` cycles with a timeout from
   the OpenAI Responses path. This revealed that long-lived coordination still
   depended on brittle request/replay budgets rather than robust bounded turns.
2. The human simulator repeatedly crashed with `Human simulator exceeded its
   bounded review loop budget.` This was a Shipyard bug, not a target-app bug,
   and it required a runtime patch in [PR #137](https://github.com/thisisyoussef/shipyard/pull/137).
   It revealed that the self-review layer could deadlock the whole loop.
3. Several `ultimate` restarts failed immediately because the
   `subagent:human-simulator` route was missing `OPENAI_API_KEY`. This revealed
   that multi-route provider configuration was not operationally sealed.
4. A live turn failed on malformed `edit_block` JSON with an unterminated
   string. That revealed the agent was still trying to push oversized single-file
   edits through a tool contract that wanted smaller anchors.
5. The Team story got blocked after repeated failed verification attempts and
   Shipyard restored the latest checkpoint instead of shipping the broken file.
   That was the right safety behavior, but it also revealed that the agent could
   thrash on the same file without actually changing strategy.
6. The mission watchdog spiraled up to restart `1889` before the supervision
   stack was rebuilt. That revealed that "keep running forever" needed a real
   ops architecture, not just a loop flag.
7. The target repo had no native git history, so rollback safety was weaker
   than it looked until sidecar target archiving shipped in
   [PR #151](https://github.com/thisisyoussef/shipyard/pull/151). This revealed
   that the runtime had assumed a healthier target source-control baseline than
   the rebuild actually had.
8. The submission deploy only became stable after falling back from
   `npm run build` to `npx vite build` in the Vercel sync script. That revealed
   a classic agent weakness: shipping visible progress while leaving type debt
   behind.

The deeper product shortfalls are equally clear when compared with the original
Ship repo:

- The original has first-class surfaces like `ConvertedDocuments`,
  `ReviewsPage`, `StatusOverviewPage`, `TeamMode`, `WorkspaceSettings`,
  `PublicFeedback`, and `InviteAccept`. The remake either collapsed these into
  thinner substitutes or omitted the deeper workflow logic entirely.
- The original tests real features such as backlinks, mentions, inline
  comments, file attachments, image uploads, tables, toggles, issue estimates,
  bulk operations, pending invites, session timeout, and week/accountability
  behavior. The remake still lags meaningfully on those interaction contracts.
- The original app keeps operational state in providers, query caches, and
  server-backed APIs. The remake still relies on seeded local state for too many
  flows that need durable behavior.

## Advances

The agent still outperformed a manual build in a few important ways:

- It generated a broad visible surface area fast. In one long run, it stood up
  a believable shell plus dashboard, docs, issues, projects, programs, weeks,
  team, auth, admin, settings, and feedback routes quickly enough to keep the
  comparison concrete instead of hypothetical.
- It made checkpoint-backed continuation practical. Even when the loop failed,
  Shipyard could often resume from a persisted handoff instead of losing the
  whole story.
- It improved its own harness under pressure. The rebuild did not just create a
  target app; it forced runtime fixes for human-simulator recovery, long-run
  supervision, and release archiving.
- It was especially strong at turning high-level product prompts into tangible
  UI slices. That is where it most clearly beat manual development speed.

## Trade-off Analysis

| Decision | Why the agent made it | Was it the right call? | What I would change |
| --- | --- | --- | --- |
| Collapse the target into one local seeded store | Fastest way to make many routes and tabs work without backend dependencies | Partly. Good for momentum, bad for fidelity. | Keep the seeded store for MVP, but split it into domain modules much earlier. |
| Use one generic detail page for many entity types | Reuse was cheaper than building dedicated editors for every mode | Mostly. The route pattern was right, but the page became too large and too stateful. | Preserve the shared shell, but break week, issue, project, and collaboration tabs into dedicated modules sooner. |
| Let `ultimate` run indefinitely | The task genuinely benefited from long autonomous iteration | Yes, but only after supervision was hardened. | Start with bounded multi-hour windows, automatic handoffs, and restart-safe mission control from day one. |
| Ship archived refresh snapshots outside the target repo | The live target had no usable git baseline | Yes. This was one of the best runtime fixes of the run. | Make sidecar archiving default for all long-lived targets, not an after-the-fact recovery feature. |
| Deploy with a Vite-only fallback | Needed a live submission URL even while strict build stayed red | Acceptable for submission, wrong for product quality | Keep the fallback for demos, but never count it as feature completion. |
| Keep the default runtime on Opus-class models | Better planning and better long-turn resilience | Reasonable for development | In production, route routine work to Sonnet and reserve Opus for hard planning/debug lanes. |

## If You Built It Again

I would change both the runtime architecture and the operating method:

- Persist provider `usage` into `.shipyard` from day one so cost analysis is not
  reconstructed after the fact.
- Treat long autonomy as an ops problem up front: mission control, watchdogs,
  release archiving, preview supervision, and deploy sync should be first-class
  before asking the loop to run for a day.
- Lock the data contracts earlier. The week workflow and document collaboration
  work suffered because the agent was allowed to widen UI scope before the types
  were stable.
- Break stories into smaller file-budgeted slices. The worst failures happened
  when the agent tried to rework large pages in one shot.
- Build against the real Ship repo earlier. The parity prompt pack derived from
  `ship/web/src/**` and `ship/e2e/**` was high leverage, but it arrived after
  the target had already drifted into a flatter architecture.
- Split model routing by task economics. Keep a stronger planner/coordinator
  model, but downshift routine execution and verification to cheaper routes.
- Require a clean strict build at the end of every completed story. Preview
  readiness alone was too forgiving and let type debt pile up.
