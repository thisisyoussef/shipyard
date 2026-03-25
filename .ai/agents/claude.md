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
5. **Design phase** — `.ai/workflows/design-phase.md` (visible UI stories, between spec and TDD)
6. **TDD pipeline** — `.ai/workflows/tdd-pipeline.md` (behavior changes)
7. **Story handoff** — `.ai/workflows/story-handoff.md` (completion gate)
8. **Git finalization** — `.ai/workflows/git-finalization.md` (merge to main)
9. **Recovery** — `.ai/workflows/finalization-recovery.md` (if finalization fails)

For non-trivial work, use a fresh `codex/` branch/worktree. If the current worktree already has unrelated WIP, move the story into a clean worktree instead of sharing the dirty tree.
During git finalization, unrelated dirty state is not a valid stop condition: preserve it, isolate the story diff, rerun validation there, and continue through merge unless safe disentangling is impossible.

Additional gates when applicable:
- `.ai/workflows/user-correction-triage.md` — handle user feedback
- `.ai/workflows/design-phase.md` — visible UI stories (between spec and TDD)
- `.ai/workflows/ui-qa-critic.md` — visible UI stories (after implementation)
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

When a story touches visible UI, run `.ai/workflows/design-phase.md` between spec and TDD.

The design phase uses all 27 installed skills across 6 steps:

| Step | Skills | Output |
|---|---|---|
| 1. Understand | `extract`, `normalize` | Landscape assessment |
| 2. Define | `frontend-design`, `interface-design`, `emil-design-eng`, `baseline-ui` | Visual direction |
| 3. Compose | `clarify`, `distill`, `typeset`, `colorize`, `arrange`, `adapt` | Concrete decisions |
| 4. Animate | `animate`, `delight`, `quieter` | Motion plan |
| 5. Harden | `harden`, `onboard` | Edge cases |
| 6. Review | `critique`, `normalize` | Self-critique |

Then during TDD and validation:

| Workflow Step | Skills |
|---|---|
| TDD Agent 2 (implement) | `typeset`, `colorize`, `arrange`, `animate`, `bolder` |
| TDD Agent 3 (review) | `critique`, `audit`, `fixing-accessibility`, `fixing-motion-performance` |
| Validation | `audit`, `fixing-accessibility`, `fixing-motion-performance` |
| Pack-closing polish | `polish`, `overdrive` |
| On-demand | `optimize`, `fixing-metadata` |

Skills are in `.agents/skills/`. See `.ai/codex.md` for the full mapping.

When the repo uses the scripted UI phase bridges:
- `node scripts/generate-design-brief.mjs --story <story-id>` remains the design-phase entrypoint and must use the same design skill chain Codex follows.
- Set `SHIPYARD_ENABLE_CLAUDE_UI_PHASE_BRIDGES=1` to make `node scripts/run-ui-phase-bridge.mjs --phase <ui|qa|critic|polish> --story <story-id>` use Claude first for later UI phases.
- Keep the flag unset to leave those scripted later-phase bridges Codex-first.
- The scripted bridges must preserve the exact same phase skill chains from `.ai/codex.md`; they are not allowed to substitute a Claude-specific variant.

## Compatibility Notes

- Product code lives under `shipyard/`
- `.ai/` is helper scaffolding only — never add product code here
- If repo-owned helper scripts exist, prefer them; otherwise follow workflow steps manually
- Validation commands work from both repo root (`pnpm --dir shipyard ...`) and inside `shipyard/` (`pnpm ...`)
- The `.ai/workflows/` files are the authoritative workflow definitions — read them when executing a gate
