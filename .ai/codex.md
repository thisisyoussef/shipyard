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
- Visible UI work: use `.ai/docs/design/DESIGN_PHILOSOPHY_AND_LANGUAGE.md`, `.ai/skills/frontend-design.md`, and `.ai/workflows/ui-qa-critic.md` when UI surfaces exist.
- Story finish: use `.ai/workflows/story-handoff.md`; only run git finalization after explicit user approval.

## Route By Task Type

- Feature implementation -> `.ai/workflows/feature-development.md`
- Bug fix -> `.ai/workflows/bug-fixing.md`
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
