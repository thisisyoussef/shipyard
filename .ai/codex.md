# Shipyard Workspace Orchestrator (Codex)

`.ai/codex.md` is the canonical workspace orchestrator.
Keep startup context small, route quickly, and use the workflow files for detailed procedure.

## Read First

Always read:

- `AGENTS.md`
- `.ai/docs/SINGLE_SOURCE_OF_TRUTH.md`

Then use as needed:

- `.ai/agents/claude.md`
- `.ai/memory/project/patterns.md`
- `.ai/memory/project/anti-patterns.md`
- `.ai/memory/session/active-context.md`

## Required Gates

- New task preflight: run `agent-preflight`, publish the brief, and use a fresh `codex/` branch for non-trivial work before edits.
- Story lookup: use `.ai/workflows/story-lookup.md` when the task needs local/external reconnaissance before implementation.
- Story sizing: use `.ai/workflows/story-sizing.md` to classify `trivial` vs `standard`.
- Feature stories: use `.ai/workflows/spec-driven-delivery.md` and `.ai/skills/spec-driven-development.md`.
- AI or harness changes: use `.ai/workflows/ai-architecture-change.md` and keep `.ai/` aligned with the real repo layout.
- Behavior changes: use `.ai/workflows/tdd-pipeline.md`; if repo-owned helper scripts exist, use them, otherwise keep the same staged boundaries manually.
- Visible UI work: run `.ai/workflows/design-phase.md` between spec and TDD, then use `.ai/workflows/ui-qa-critic.md` after implementation. See the UI Skill Chain below for which skills fire at each step.

## UI Skill Chain (Design → Build → Critique → Polish)

When a story touches visible UI, invoke these skills in order:

### Phase 1: Design Direction
- `.agents/skills/frontend-design/SKILL.md` — set visual direction, avoid AI slop
- `.agents/skills/interface-design/SKILL.md` — dashboard/panel/tool interface patterns
- `.agents/skills/emil-design-eng/SKILL.md` — taste, unseen details, animation decisions
- `.ai/docs/design/DESIGN_PHILOSOPHY_AND_LANGUAGE.md` — tie-break ambiguity
- `.agents/skills/baseline-ui/SKILL.md` — enforce Tailwind/component baseline standards

### Phase 2: Build & Refine
- `.agents/skills/typeset/SKILL.md` — typography hierarchy and font loading
- `.agents/skills/colorize/SKILL.md` — strategic color introduction
- `.agents/skills/arrange/SKILL.md` — layout, spacing, visual rhythm
- `.agents/skills/animate/SKILL.md` — entrance, micro-interactions, state transitions
- `.agents/skills/bolder/SKILL.md` — amplify visual impact when design feels safe

### Phase 3: Quality Gate
- `.agents/skills/critique/SKILL.md` — structured design evaluation
- `.agents/skills/audit/SKILL.md` — accessibility, performance, theming, responsive audit
- `.agents/skills/fixing-accessibility/SKILL.md` — WCAG compliance fixes
- `.agents/skills/fixing-motion-performance/SKILL.md` — animation perf fixes
- `.ai/workflows/ui-qa-critic.md` — evidence-based critic pass

### Phase 4: Final Polish
- `.agents/skills/polish/SKILL.md` — alignment, spacing, consistency, edge cases
- `.agents/skills/overdrive/SKILL.md` — ambitious implementations (View Transitions, scroll-driven, etc.)

Not every story requires every skill. Use judgment:
- Token/style-only changes → Phase 1 + Phase 3
- New components/pages → Phase 1 + Phase 2 + Phase 3 + Phase 4
- Full UI overhaul → all phases, all skills

### When to invoke each phase in the workflow

| Workflow Step | Skills Invoked | Purpose |
|---|---|---|
| `design-phase.md` Step 1 (Understand) | `extract`, `normalize` | Catalog existing patterns |
| `design-phase.md` Step 2 (Define) | `frontend-design`, `interface-design`, `emil-design-eng`, `baseline-ui` | Set visual direction |
| `design-phase.md` Step 3 (Compose) | `clarify`, `distill`, `typeset`, `colorize`, `arrange`, `adapt` | Concrete design decisions |
| `design-phase.md` Step 4 (Animate) | `animate`, `delight`, `quieter` | Motion plan |
| `design-phase.md` Step 5 (Harden) | `harden`, `onboard` | Edge cases and first-run |
| `design-phase.md` Step 6 (Review) | `critique`, `normalize` | Self-critique before handoff |
| `tdd-pipeline.md` Agent 2 (Implement) | `typeset`, `colorize`, `arrange`, `animate`, `bolder` | Guide CSS/component coding |
| `tdd-pipeline.md` Agent 3 (Review) | `critique`, `audit`, `fixing-accessibility`, `fixing-motion-performance` | Quality gate |
| `feature-development.md` Step 9 (Validate) | `audit`, `fixing-accessibility`, `fixing-motion-performance` | Compliance |
| `ui-qa-critic.md` Step 2 (Critic) | `critique`, `audit`, `fixing-accessibility`, `fixing-motion-performance` | Evidence-based QA |
| `feature-development.md` Step 9 (pack-closing) | `polish`, `overdrive` | Final refinement |
| On-demand | `optimize`, `fixing-metadata` | Performance and SEO |

All 27 installed skills are now wired. The design phase (`design-phase.md`) is the primary invocation point — it runs between spec and TDD and produces a concrete design brief that the implementer and reviewer read.
- Story finish: use `.ai/workflows/story-handoff.md`; when a story or spec pack is complete, update the relevant `shipyard/docs/specs/**` files with `Code References` and short `Representative Snippets` (or explicit `N/A`); when the story changes traced AI/runtime behavior, run `.ai/workflows/langsmith-finish-check.md` before the completion gate; unless the user explicitly asks to pause or choose a different merge path, continue through `.ai/workflows/git-finalization.md` automatically after the completion gate, and treat the story as incomplete until it is merged to `main` on GitHub.

## Route By Task Type

- Feature implementation -> `.ai/workflows/feature-development.md`
- Bug fix -> `.ai/workflows/bug-fixes.md`
- Performance -> `.ai/workflows/performance-optimization.md`
- Security review -> `.ai/workflows/security-review.md`
- Deployment or release wiring -> `.ai/workflows/deployment-setup.md`
- TDD coordination -> `.ai/workflows/tdd-pipeline.md`
- Git finalization -> `.ai/workflows/git-finalization.md`
- Recovery after failed finalization -> `.ai/workflows/finalization-recovery.md`

## Implementation Defaults

- Product code, package manifests, and tests live under `shipyard/`.
- Root `.ai/` files are support material, not the product implementation.
- From the repo root, default validation commands are:
  - `pnpm --dir shipyard test`
  - `pnpm --dir shipyard typecheck`
  - `pnpm --dir shipyard build`
- Keep `.ai/memory/project/*` focused on durable repo truths.
- Keep `.ai/memory/session/*` focused on current work, not imported backlog history.

## Memory Update Set

- `.ai/docs/SINGLE_SOURCE_OF_TRUTH.md`
- `.ai/memory/project/architecture.md`
- `.ai/memory/project/patterns.md`
- `.ai/memory/project/anti-patterns.md`
- `.ai/memory/codex/README.md`
- `.ai/memory/session/decisions-today.md`
