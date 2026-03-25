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
- Visible UI work: use the UI skill chain below and `.ai/workflows/ui-qa-critic.md` when UI surfaces exist.

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
- Story finish: use `.ai/workflows/story-handoff.md`; when the story changes traced AI/runtime behavior, run `.ai/workflows/langsmith-finish-check.md` before the completion gate; unless the user explicitly asks to pause or choose a different merge path, continue through `.ai/workflows/git-finalization.md` automatically after the completion gate, and treat the story as incomplete until it is merged to `main` on GitHub.

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
