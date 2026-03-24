---
name: feature-model
description: >
  Parse a feature specification and enrich it into a complete Feature Model by resolving
  conventions, selecting exemplars, and surfacing decisions that need human input. Use this
  skill when the user provides a feature spec (JSON, markdown, or natural language) and wants
  it enriched with codebase context before implementation. Trigger on phrases like "parse this
  spec", "create feature model", "enrich this feature", "what would this feature look like in
  our codebase", "plan this feature", or when the user provides a JSON spec with fields like
  "entity", "pattern", "fields". Also trigger when the user says "I want to add [entity] to
  [project]" — that's a natural language spec that needs parsing.
---

# Feature Model — Spec → Enriched Implementation Blueprint

## Purpose

A feature spec says WHAT to build. A Feature Model says HOW it maps to THIS codebase.
The gap between them is filled by decisions a senior engineer makes implicitly — naming
conventions, file paths, integration patterns, exemplar selection. This skill makes those
decisions explicit and reviewable.

## Prerequisites

This skill requires a constitution. Check for `.factory/CONSTITUTION.md` in the project.
If it doesn't exist, tell the user: "I need to index this repo's conventions first. Want
me to run the repo-constitution skill?" Then run it.

## Input Formats

Accept any of these:

**Structured JSON spec:**
```json
{
  "product": "project-name",
  "pattern": "crud_ui",
  "entity": "PaymentMethod",
  "fields": [
    {"name": "type", "kind": "enum", "values": ["credit_card", "ach", "wire"]},
    {"name": "label", "kind": "string"},
    {"name": "is_default", "kind": "boolean"},
    {"name": "vault_ref", "kind": "string", "sensitive": true}
  ],
  "permissions": "payment_methods:manage",
  "audit": true,
  "integrations": ["vault"],
  "ui": {"list": true, "detail": true, "form": true}
}
```

**Natural language:** "Add a PaymentMethod entity with type (enum: credit_card/ach/wire),
label, is_default flag, and a sensitive vault reference. Needs CRUD UI, audit logging,
vault integration, and permission-gated access."

**Markdown spec:** Any structured description of a feature.

## Feature Model Generation Process

### Step 1: Resolve Against Constitution

Load `.factory/CONSTITUTION.md` and `.factory/repo-manifest.json`. For each aspect of
the spec, resolve to concrete codebase conventions:

| Spec Element | Resolution |
|-------------|-----------|
| Entity name | → table name (constitution's naming: plural snake_case?), model class name, file names |
| Each field | → DB column type, TypeScript type, validation rules, DTO inclusion |
| `sensitive: true` fields | → storage pattern (vault ref? encrypted column? redacted in logs?) |
| `permissions` | → guard decorator, permission table entry, role assignments |
| `audit: true` | → which audit service, what events, what payload shape |
| `integrations` | → exact import paths and initialization patterns from exemplar |
| `ui` components | → which component patterns from the frontend exemplar |

### Step 2: Select Exemplar

From `.factory/exemplars/`, score each exemplar against this spec:

- **Integration overlap**: how many integrations match? (weight: 3x)
- **Field count similarity**: similar complexity? (weight: 1x)
- **Pattern match**: same CRUD pattern? (weight: 2x)
- **Recency**: newer exemplar preferred (weight: 1x)

Select the top-scoring exemplar as primary. Note the runner-up as fallback.

### Step 3: Surface Decisions

For every decision that ISN'T obvious from the constitution + exemplar, create a
decision entry:

```markdown
### Decision: [short title]
**Context**: [why this needs a decision]
**Default**: [what the factory would do based on exemplar]
**Alternative**: [other reasonable choice]
**Impact**: [what changes if the alternative is chosen]
```

Common decisions to surface:
- Table name (if naming is ambiguous)
- Sensitive field storage strategy
- Unique constraints beyond what's explicit
- Default values
- Soft delete vs hard delete
- Cascade behavior on foreign keys
- UI-specific: which fields in list view vs detail view

### Step 4: Produce the Feature Model

Output a `feature-model.json` (save to `.factory/current/`):

```json
{
  "meta": {
    "entity": "PaymentMethod",
    "pattern": "crud_ui",
    "exemplar": { "primary": "Invoice", "score": 0.92, "fallback": "Customer" },
    "estimated_files": 14,
    "estimated_tests": 43
  },
  "database": {
    "table": "payment_methods",
    "columns": [
      { "name": "id", "type": "UUID", "constraints": ["PRIMARY KEY", "DEFAULT gen_random_uuid()"] },
      { "name": "...", "type": "...", "constraints": [] }
    ],
    "indexes": [],
    "migration_strategy": "expand-and-contract"
  },
  "backend": {
    "files": {
      "service": "src/modules/payment-method/payment-method.service.ts",
      "controller": "src/modules/payment-method/payment-method.controller.ts",
      "dto": "src/modules/payment-method/payment-method.dto.ts",
      "model": "src/modules/payment-method/payment-method.model.ts"
    },
    "integrations": {
      "vault": { "import": "src/integrations/vault.client.ts", "pattern": "singleton" },
      "audit": { "import": "src/services/audit.service.ts", "events": ["create","update","delete"] },
      "permissions": { "guard": "PermissionGuard", "permission": "payment_methods:manage" }
    }
  },
  "frontend": {
    "files": {
      "list": "src/components/payment-methods/PaymentMethodList.tsx",
      "form": "src/components/payment-methods/PaymentMethodForm.tsx",
      "detail": "src/components/payment-methods/PaymentMethodDetail.tsx"
    },
    "route_registration": "src/routes/index.tsx"
  },
  "config": {
    "feature_flag": "payment_methods_enabled",
    "permission_entry": "payment_methods:manage",
    "env_vars": []
  },
  "decisions": [],
  "contracts": {
    "schema_contract": "produced by migration-gen, consumed by api-gen",
    "api_contract": "produced by api-gen, consumed by frontend-gen and test-suite-gen"
  }
}
```

### Step 5: Present for Approval

Show the human a readable summary:

```markdown
## Feature Model: [Entity]

**Primary Exemplar**: [Name] (score: X) — [why it was selected]
**Files to generate**: [count]
**Estimated tests**: [count]

### File Map
[list every file that will be created, grouped by layer]

### Integration Wiring
[for each integration: what gets imported, how it's used]

### Decisions Requiring Input
[list decisions with defaults — human can accept defaults or override]

### What's Inherited (no decisions needed)
[naming, structure, error handling — all from exemplar]
```

## Critical Rules

- **The Feature Model is the single source of truth for all downstream stages.** Every
  downstream skill reads from this model. If it's wrong here, it's wrong everywhere.
- **Never add integrations not in the spec.** If the spec doesn't mention audit logging,
  don't add it just because the exemplar has it. Surface it as a decision instead.
- **Sensitive fields get special treatment.** Any field marked sensitive: vault_ref patterns,
  log redaction, DTO exclusion from list endpoints.
- **File paths must match the constitution exactly.** Don't invent a path structure.
  Copy the exemplar's path pattern with the new entity name substituted.

## Saving State

Save all outputs to `.factory/current/`:
```
.factory/current/
├── feature-model.json
├── feature-model-summary.md  (human-readable version)
└── decisions.md              (if any decisions need human input)
```
