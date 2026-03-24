# Story Lookup Workflow (Mandatory)

**Purpose**: Before implementing any story, gather relevant project context, official documentation, and best-practice guidance from both local docs and targeted web sources.

---

## When To Run

Run after `agent-preflight` and before writing tests or implementation for:
- feature stories
- bug stories
- performance stories
- security stories
- deployment/ops stories

---

## Step 1: Define Lookup Scope

From the story, extract:
- problem to solve
- acceptance criteria
- integrations/providers involved
- non-functional constraints (security, performance, cost, observability)

Create a lookup scope list before searching.

---

## Step 2: Local Lookup (Required)

Read relevant internal docs first:
1. `.ai/docs/SINGLE_SOURCE_OF_TRUTH.md`
2. `.ai/memory/project/patterns.md`
3. `.ai/memory/project/anti-patterns.md`
4. `.ai/memory/project/edge-cases.md`
5. `.ai/memory/session/active-context.md`
6. Relevant provider references under `.ai/docs/references/`
7. Relevant research notes under `.ai/docs/research/`
8. SDD/TDD methodology reference: `.ai/docs/research/spec-driven-tdd-playbook.md`
9. For UI stories: design language reference `.ai/docs/design/DESIGN_PHILOSOPHY_AND_LANGUAGE.md`
10. For UI stories: frontend prompting skill `.ai/skills/frontend-design.md`
11. For UI stories: reusable prompt brief `.ai/templates/spec/UI_PROMPT_BRIEF_TEMPLATE.md`

Capture reusable patterns and constraints from local docs.

For AI-behavior stories, also identify:
- where nondeterminism enters the system,
- which behavior needs regression coverage,
- which evaluator types are most appropriate.

---

## Step 3: External Lookup (Required)

Search official docs and best-practice sources for the story scope.

Preferred source priority:
1. Official provider/framework docs
2. Primary standards/specifications
3. Reputable engineering references

Common official sources will vary by the chosen stack. During setup, record the primary sources for:
- language/runtime,
- framework(s),
- datastore(s),
- infrastructure/deployment provider(s),
- AI/model provider(s) if applicable.

Minimum external lookup output:
- at least 2 relevant external sources,
- at least 3 concrete best-practice takeaways tied to the story.

For AI-behavior stories, include best practices for:
- evaluator choice,
- dataset composition,
- regression/continuous-eval strategy.

For UI stories, include best practices for:
- translating vague aesthetic intent into concrete implementation constraints,
- typography hierarchy and pairing,
- whitespace/layout composition,
- semantic color/depth systems,
- when to use a short WIRE brief versus a fuller WIRE+FRAME brief.

---

## Step 4: Publish Lookup Brief (Required Before Coding)

Deliver a concise lookup brief before any code/test edits:

1. Story + scope summary
2. Local findings (paths + key constraints)
3. External findings (links + key practices)
4. Implementation implications
5. Risks/open questions
6. Initial test strategy derived from findings
7. Eval implications for AI behavior (objective, dataset, metrics, regression plan)
8. Spec implications (what to update in constitution/spec/plan/tasks artifacts)
9. For UI scope: design-ambiguity implications, selected principle tie-breakers, and prompt/spec constraints that prevent generic output
10. Story sizing recommendation: `lane: trivial` or `lane: standard`, plus the reason `.ai/workflows/story-sizing.md` should land there next

If lookup is incomplete, do not start implementation.

---

## Step 5: Persist Key Learnings

For durable findings:
- update appropriate files in `.ai/docs/references/` (or add concise notes),
- update relevant story spec artifacts under `.ai/templates/spec/` contract usage,
- for UI stories, add/update design decision precedent when meaningful,
- log important decisions in `.ai/memory/session/decisions-today.md`,
- add stable patterns/anti-patterns in project memory when warranted.

---

## Exit Criteria

- Local lookup completed
- External lookup completed
- Lookup brief shared before implementation
- Best-practice takeaways mapped to planned design/tests
