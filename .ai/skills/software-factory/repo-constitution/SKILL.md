---
name: repo-constitution
description: >
  Analyze and index a codebase's conventions, patterns, and architecture into a structured
  "constitution" document and convention index. Use this skill whenever the user asks to
  index a repo, extract conventions, create a project constitution, analyze codebase patterns,
  set up a new project for the factory pipeline, onboard a new codebase, or says things like
  "learn this repo", "understand this codebase", "extract the patterns", "what conventions
  does this project use". Also trigger when the user mentions "golden paths", "exemplars",
  "codebase intelligence", or wants to prepare a repo for automated code generation.
---

# Repo Constitution — Codebase Intelligence Extractor

## Purpose

Senior engineers don't read docs to build features — they grep the repo, find a similar
entity, and use it as a template. This skill externalizes that mental playbook by extracting
a 5-layer convention taxonomy from any codebase.

The output is a `CONSTITUTION.md` file and a set of convention artifacts that downstream
factory skills consume. Think of it as teaching the AI what a senior engineer on this team
already knows implicitly.

## The 5-Layer Convention Taxonomy

Extract conventions in this exact order. Each layer builds on the previous.

### L1: Structural Conventions (deterministic — no guessing)

Analyze the repo and document:

1. **Directory tree** — run `find . -type f | head -200` and `tree -L 3 -I node_modules`
2. **File naming** — kebab-case? PascalCase? `.service.ts` / `.controller.ts` suffixes?
3. **Module organization** — feature-based folders? layer-based? hybrid?
4. **Import conventions** — absolute paths? `@/` aliases? barrel exports?
5. **Config file inventory** — list every config file (tsconfig, eslint, prettier, docker, CI)

Output: `repo-manifest.json` with this structure:
```json
{
  "name": "project-name",
  "stack": { "language": "", "framework": "", "orm": "", "test_framework": "" },
  "structure": { "src_root": "", "naming_convention": "", "module_pattern": "" },
  "config_files": [],
  "key_directories": {}
}
```

### L2: Exemplar Catalog (the most important layer)

Find complete pattern instances — the "templates" a senior would copy from.

For each entity type in the codebase (e.g., User, Invoice, Product):
1. List all files that make up one complete entity (model, service, controller, DTO, tests, migration, frontend component)
2. Score each entity by completeness (how many layers does it cover?)
3. Mark the highest-scoring entity as the **primary exemplar**
4. Note which integrations each entity uses (auth, audit, vault, caching, etc.)

Output format per exemplar:
```markdown
### Exemplar: [EntityName] (Score: X/10)
- **Files**: list every file path
- **Integrations**: [auth, audit, vault, ...]
- **Patterns demonstrated**: [CRUD, soft-delete, pagination, ...]
- **Complexity**: simple | moderate | complex
```

### L3: Integration Patterns

For each cross-cutting concern found in exemplars:
1. **Authentication/Authorization** — how are routes protected? decorators? middleware? guards?
2. **Audit logging** — is there a service? what gets logged? format?
3. **Error handling** — custom error classes? error middleware? response format?
4. **Database patterns** — ORM usage, transaction patterns, migration conventions
5. **External services** — how are API clients structured? singleton? DI?
6. **Feature flags** — what system? how are they checked?
7. **Permissions** — RBAC? ABAC? where are permissions defined?

For each integration, extract the **exact import path, initialization pattern, and usage
pattern** from the primary exemplar. This is what downstream generators will copy.

### L4: Quality Profile

Read config files directly (no LLM interpretation needed):
- Linter rules and overrides
- TypeScript strictness settings
- Test framework config and conventions (describe/it? test()? fixtures?)
- CI pipeline steps
- Pre-commit hooks

Output: `quality-profile.json`

### L5: Evolution Layer

Check recent history for context:
```bash
git log --oneline -30
git log --diff-filter=D --name-only -10  # recently deleted files
grep -r "deprecated" --include="*.ts" -l  # deprecation markers
grep -r "@deprecated" --include="*.ts" -l
grep -r "TODO.*migrat" --include="*.ts" -l  # active migrations
```

Note any active migrations, deprecated patterns, or recent architectural shifts.

## Output: The Constitution Document

Assemble findings into `CONSTITUTION.md` with this structure:

```markdown
# [Project Name] Constitution
Generated: [date]
Primary Exemplar: [EntityName]

## Stack
[From L1]

## Structural Rules
- File naming: [convention]
- Module pattern: [pattern]
- Import style: [convention]

## Exemplar Catalog
[From L2 — ranked by score]

## Integration Patterns
[From L3 — each with exact code snippets]

## Quality Requirements
[From L4 — the rules code must pass]

## Evolution Notes
[From L5 — what's changing]

## Anti-Patterns (things NOT to do)
[Inferred from exemplars — patterns that exist in older code but not newer code]
```

## Critical Rules

- **Never invent conventions.** If you can't find evidence of a pattern in the codebase,
  don't add it. The constitution documents what IS, not what should be.
- **Prefer newer code over older code.** If file A (modified last week) and file B
  (modified 2 years ago) show different patterns, A wins.
- **Include exact code snippets.** "Uses dependency injection" is useless. Show the actual
  import and initialization code from the exemplar.
- **Flag ambiguity.** If you find conflicting patterns (two different error handling
  approaches), flag it and ask the human which is canonical.

## Usage with Other Factory Skills

The constitution is consumed by:
- `feature-model` — resolves naming, file paths, integration patterns
- `api-gen` — copies integration wiring from exemplar
- `frontend-gen` — copies component structure from exemplar
- `test-suite-gen` — follows test framework conventions
- `migration-gen` — follows migration naming and safety patterns

When running this skill, save all outputs to `.factory/` in the project root:
```
.factory/
├── CONSTITUTION.md
├── repo-manifest.json
├── quality-profile.json
└── exemplars/
    ├── [entity-name].md  (one per exemplar)
    └── ...
```
