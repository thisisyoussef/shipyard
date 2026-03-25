# Shipyard Claude Code Orchestrator

This file keeps Claude Code aligned with the same workflow contract used by Codex and other agents.

## How Claude Code Loads This Workspace

Claude Code reads `CLAUDE.md` files automatically. The primary entry point is `.claude/CLAUDE.md`, which contains:
- The full read order chain
- Workspace layout and validation commands
- Story rules and workflow routing table
- Memory system references
- Shipyard app architecture summary

This file (`.ai/agents/claude.md`) provides the **workflow contract** that `.claude/CLAUDE.md` references.

## Claude Code Native Extensions

### Skills (`.claude/skills/`)

| Skill | Invocation | Purpose |
|-------|-----------|---------|
| `story-workflow` | `/story-workflow` | Full story lifecycle (lookup → sizing → spec → TDD → handoff → finalize) |
| `validate` | `/validate` | Run test + typecheck + build + git diff check |
| `tdd` | `/tdd` | RED/GREEN/REFACTOR cycle with evidence |

### Subagents (`.claude/agents/`)

| Agent | Model | Role |
|-------|-------|------|
| `explorer` | sonnet | Read-only codebase search and context gathering |
| `verifier` | sonnet | Read-only test/typecheck/build validation |
| `architect` | opus | Architecture review and design decisions |

### Hooks (`.claude/settings.json`)

| Event | Trigger | Action |
|-------|---------|--------|
| PostToolUse | Edit or Write | Auto-typecheck after every file change |
| PreToolUse | Edit or Write | Block edits to `.env`, `.secret`, `.key` files |

## Required Workflow Contract

Claude Code should follow the same gates defined in `AGENTS.md` and `.ai/codex.md`:

1. **Preparation pass** — read context chain before edits
2. **Story lookup** — `.ai/workflows/story-lookup.md`
3. **Story sizing** — `.ai/workflows/story-sizing.md` (trivial vs standard)
4. **Spec-driven delivery** — `.ai/workflows/spec-driven-delivery.md` (standard lane only)
5. **TDD pipeline** — `.ai/workflows/tdd-pipeline.md` (behavior changes)
6. **Story handoff** — `.ai/workflows/story-handoff.md` (completion gate)
7. **Git finalization** — `.ai/workflows/git-finalization.md` (merge to main)
8. **Recovery** — `.ai/workflows/finalization-recovery.md` (if finalization fails)

Additional gates when applicable:
- `.ai/workflows/user-correction-triage.md` — handle user feedback
- `.ai/workflows/ui-qa-critic.md` — visible UI stories
- `.ai/workflows/ai-architecture-change.md` — harness/orchestrator changes
- `.ai/workflows/langsmith-finish-check.md` — traced AI behavior changes

## Using Subagents Effectively

Claude Code can spawn subagents for parallel work:

```
# Parallel reconnaissance while planning
Agent(explorer): "Find all tool implementations in shipyard/src/tools/ and their contracts"
Agent(explorer): "Search for how discovery.ts builds the context envelope"

# Parallel validation after changes
Agent(verifier): "Run full validation suite and report results"

# Architecture review for major changes
Agent(architect): "Review this proposed change against existing patterns"
```

## UI Skill Chain

When a story touches visible UI, Claude should follow the same skill chain defined in `.ai/codex.md`:

1. **Design Direction**: `frontend-design`, `emil-design-eng`, design philosophy, `baseline-ui`
2. **Build & Refine**: `typeset`, `colorize`, `arrange`, `animate`, `bolder`
3. **Quality Gate**: `critique`, `audit`, `fixing-accessibility`, `fixing-motion-performance`, `ui-qa-critic`
4. **Final Polish**: `polish`, `overdrive` (when ambitious)

Skills are in `.agents/skills/`. Not every story requires every skill — see codex.md for guidance.

**When to invoke during implementation (not just spec-building):**
- **Design (Step 3)**: Phase 1 skills set visual direction before coding
- **Implement (TDD Agent 2)**: Phase 2 skills guide CSS/component decisions during coding
- **Review (TDD Agent 3)**: Phase 3 skills evaluate quality and fix gaps during refactor
- **Validate (Step 9)**: Phase 3 skills run final audit; Phase 4 for pack-closing polish

## Compatibility Notes

- Product code lives under `shipyard/`
- `.ai/` is helper scaffolding only — never add product code here
- If repo-owned helper scripts exist, prefer them; otherwise follow workflow steps manually
- Validation commands work from both repo root (`pnpm --dir shipyard ...`) and inside `shipyard/` (`pnpm ...`)
- The `.ai/workflows/` files are the authoritative workflow definitions — read them when executing a gate
