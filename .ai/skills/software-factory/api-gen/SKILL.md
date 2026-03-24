---
name: api-gen
description: >
  Generate backend API code (service, controller, DTOs, model) by copying the structure of
  the selected exemplar and adapting it for the new entity. Produces a typed API Contract
  consumed by frontend and test generators. Use this skill when the user says "generate API",
  "create service", "create controller", "build the backend", "generate endpoints", "create
  CRUD API", or when running the factory pipeline's API stage. Also trigger for "create the
  backend for [entity]", "add API endpoints for [feature]", or any request to generate
  server-side code following existing project conventions.
---

# API Generator — Exemplar-Driven Backend Code + API Contract

## Purpose

Generate backend code (service, controller, DTOs) by structurally copying the primary
exemplar and adapting it for the new entity. The key insight: 9–17% of all code in
software systems are clones. Senior engineers copy-paste from existing code and modify.
This skill does that systematically.

## Prerequisites

Load from `.factory/current/`:
- `feature-model.json` — file paths, integrations, field definitions
- `schema-contract.json` — typed column definitions, DTO inclusion flags

Load from `.factory/`:
- `CONSTITUTION.md` — import conventions, error handling patterns
- `exemplars/[primary-exemplar].md` — the template to copy from

## Generation Strategy: Copy-Modify, Not Generate

This is the most important concept. Do NOT generate code from scratch.

1. **Read the exemplar's actual source files** (service, controller, DTO)
2. **Identify the structural skeleton** — imports, class structure, method signatures,
   decorator patterns, integration wiring
3. **Substitute** the exemplar's entity name, fields, and types with the new entity's
4. **Add/remove integrations** as specified in the feature model
5. **Preserve everything else** — error handling, response format, logging, comments style

This produces code that looks like it was written by the same engineer who wrote the
exemplar, because structurally, it was.

## Generation Process

### Step 1: Load Exemplar Source

Read the actual files of the primary exemplar. For each file in the feature model's
`backend.files`, find the corresponding exemplar file:

```
feature-model.backend.files.service  →  exemplar's service file
feature-model.backend.files.controller  →  exemplar's controller file
feature-model.backend.files.dto  →  exemplar's DTO file
```

### Step 2: Generate DTOs (from Schema Contract)

Using `schema-contract.json`, create DTOs:

**CreateDTO**: include columns where `in_create_dto: true`
**UpdateDTO**: include columns where `in_update_dto: true` (all optional/Partial)
**ResponseDTO**: include columns where `in_response_dto: true` (excludes sensitive)

Follow the exemplar's exact DTO structure:
- Same decorator library (class-validator? zod? io-ts?)
- Same validation patterns
- Same export style

### Step 3: Generate Model/Entity

From the schema contract, create the ORM model/entity file matching the exemplar's
pattern (TypeORM entity? Prisma model? Sequelize model? Drizzle schema?).

### Step 4: Generate Service

Copy the exemplar's service structure. For each CRUD operation:

```
create():
  - validate input (from DTO)
  - [if vault integration] tokenize sensitive fields via VaultClient
  - persist to database
  - [if audit integration] log creation event
  - return response DTO

findAll():
  - apply pagination (copy exemplar's pattern)
  - apply filters (from query params)
  - [if sensitive fields] exclude from projection
  - return paginated response

findOne():
  - fetch by ID
  - throw NotFoundException if not found (copy exemplar's error pattern)
  - return response DTO

update():
  - fetch existing (throw if not found)
  - apply changes
  - [if audit] log update event with diff
  - return response DTO

delete():
  - fetch existing (throw if not found)
  - [if soft-delete] set deleted_at
  - [if hard-delete] remove
  - [if audit] log deletion event
  - return void/confirmation
```

For any custom methods in the feature model (e.g., `setDefault()`):
- Check if the exemplar has a similar method
- If not, generate following the service's established patterns

### Step 5: Generate Controller

Copy the exemplar's controller structure:
- Same route prefix pattern (`/api/v1/[entity-plural]`)
- Same decorator patterns (permission guards, validation pipes)
- Same response wrapping
- Same error handling

Every route MUST have:
- Permission guard (from feature model's `permissions`)
- Input validation (from DTOs)
- Audit logging on mutations (if `audit: true`)

### Step 6: Wire Integrations

For each integration in `feature-model.backend.integrations`:
1. Copy the **exact import statement** from the exemplar
2. Copy the **exact initialization pattern** (DI? singleton? constructor param?)
3. Copy the **exact usage pattern** in service methods

If the exemplar has integrations the new entity doesn't need, **remove them**.
If the new entity needs integrations the exemplar doesn't have, check other exemplars
or the constitution's integration patterns.

### Step 7: Generate API Contract

The API Contract is consumed by `frontend-gen` and `test-suite-gen`.
Save as `.factory/current/api-contract.json`:

```json
{
  "base_path": "/api/v1/payment-methods",
  "endpoints": [
    {
      "method": "GET",
      "path": "/",
      "permission": "payment_methods:manage",
      "query_params": ["page", "limit", "sort", "filter[type]"],
      "response": { "type": "PaginatedResponse<PaymentMethodResponseDto>" },
      "description": "List payment methods with pagination and filtering"
    },
    {
      "method": "POST",
      "path": "/",
      "permission": "payment_methods:manage",
      "body": "CreatePaymentMethodDto",
      "response": { "type": "PaymentMethodResponseDto" },
      "audit_event": "payment_method.created"
    },
    {
      "method": "GET",
      "path": "/:id",
      "permission": "payment_methods:manage",
      "response": { "type": "PaymentMethodResponseDto" }
    },
    {
      "method": "PATCH",
      "path": "/:id",
      "permission": "payment_methods:manage",
      "body": "UpdatePaymentMethodDto",
      "response": { "type": "PaymentMethodResponseDto" },
      "audit_event": "payment_method.updated"
    },
    {
      "method": "DELETE",
      "path": "/:id",
      "permission": "payment_methods:manage",
      "audit_event": "payment_method.deleted"
    }
  ],
  "dto_types": {
    "CreatePaymentMethodDto": { "fields": [] },
    "UpdatePaymentMethodDto": { "fields": [] },
    "PaymentMethodResponseDto": { "fields": [] }
  }
}
```

### Step 8: Verify

Run the project's actual toolchain:

```bash
# TypeScript compilation
npx tsc --noEmit 2>&1

# Linting
npx eslint src/modules/payment-method/ 2>&1

# Convention diff (structural comparison with exemplar)
# Compare: import count, method count, decorator usage, error handling patterns
```

If verification fails:
1. Parse the error message
2. Fix the specific issue (usually an import path or type mismatch)
3. Re-verify
4. Max 3 retries before escalating

## Output Files

```
.factory/current/
├── api-contract.json
├── generated/
│   ├── [entity].service.ts
│   ├── [entity].controller.ts
│   ├── [entity].dto.ts
│   ├── [entity].model.ts
│   └── [entity].module.ts  (if framework uses modules)
└── api-verification.md
```

## Convention Diff Score

After generation, compute a structural similarity score against the exemplar:
- Import structure match: /25
- Method signatures match: /25
- Decorator patterns match: /25
- Error handling match: /25

Score ≥90: pass. Score 70–89: flag differences for review. Score <70: consider exemplar swap.
