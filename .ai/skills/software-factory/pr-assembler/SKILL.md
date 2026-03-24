---
name: pr-assembler
description: >
  Assemble all generated files into a complete pull request with verification results,
  structured PR description, review guidance, and a human QA checklist. Use this skill when
  the user says "assemble PR", "create pull request", "finalize the feature", "package
  everything up", "submit for review", or when running the factory pipeline's final stage.
  Also trigger for "create a PR from the generated code", "prepare for review", or after all
  generation stages have completed and the user wants to ship the result.
---

# PR Assembler — Verify, Assemble, Review Guide, QA Checklist

## Purpose

The final stage. Assembles all generated artifacts onto a branch, runs the full CI
pipeline, performs an LLM-as-judge review, and produces a structured PR that tells the
human reviewer exactly what to focus on and what's safe to skip.

## Prerequisites

All generation stages must be complete. Check `.factory/current/generated/` for:
- Migration files
- Backend files (service, controller, DTO, model)
- Config files (flags, permissions, env)
- Frontend files (components, hooks, routes)
- Test files

Load from `.factory/current/`:
- `feature-model.json` — the approved spec
- `execution-plan.json` — what was planned
- `schema-contract.json` + `api-contract.json` — the contracts
- All verification results from individual stages

## Assembly Process

### Step 1: Create Feature Branch

```bash
# Branch naming from constitution (or default)
git checkout -b feature/add-[entity-kebab-case]

# Example:
git checkout -b feature/add-payment-methods
```

### Step 2: Copy Generated Files to Project

Move files from `.factory/current/generated/` to their correct project locations
(as specified in `feature-model.json`):

```bash
# Backend
cp generated/payment-method.service.ts src/modules/payment-method/
cp generated/payment-method.controller.ts src/modules/payment-method/
# ... etc

# Frontend
cp generated/PaymentMethodList.tsx src/components/payment-methods/
# ... etc

# Apply patches (config, routes, permissions)
# These modify existing files — apply carefully
```

### Step 3: Run Full CI Pipeline

Run the project's actual CI checks:

```bash
# Compilation
npx tsc --noEmit

# Linting
npx eslint . --ext .ts,.tsx

# All tests (not just new ones)
npm test

# Security scan (if available)
npx semgrep --config=auto src/modules/payment-method/

# Build (ensure nothing breaks the build)
npm run build
```

Record every result. If any fail, this is a **pipeline failure** — do not proceed.
Attempt to fix and retry (max 3 attempts).

### Step 4: Security Verification (for regulated products)

If the feature model indicates SOC 2 or HIPAA compliance requirements:

```bash
# No credential leaks — search for sensitive field names in logs
grep -rn "vault_ref\|credential\|secret\|token" src/modules/payment-method/ \
  | grep -v "\.test\." | grep -v "\.dto\." | grep "log\|console\|print"

# Auth enforcement — every controller route has a guard
# AST check or grep for unguarded routes
grep -n "Get\|Post\|Put\|Patch\|Delete" src/modules/payment-method/*.controller.ts \
  | grep -v "Guard\|guard\|@Auth\|@Permission"

# Audit completeness — every mutation calls audit
grep -n "create\|update\|delete\|remove" src/modules/payment-method/*.service.ts \
  | grep -v "audit\|Audit" | grep -v "test\|spec"

# Migration safety — no destructive operations
grep -in "DROP\|RENAME\|ALTER.*NOT NULL" .factory/current/migrations/*.sql
```

### Step 5: LLM-as-Judge Review

Using a fresh context (no prior generation context), review the generated code against
the feature model spec:

Prompt structure:
```
You are reviewing generated code for a [entity] feature.

Spec: [feature-model.json]
Files: [list of generated files with their contents]

Review for:
1. Does the code implement everything in the spec?
2. Are there any edge cases the spec implies but the code doesn't handle?
3. Are there any security concerns (unguarded routes, sensitive data exposure)?
4. Does the code follow the patterns shown in the exemplar?

Format findings as:
- CRITICAL: [must fix before merge]
- WARNING: [should review, might be intentional]
- INFO: [observation, no action needed]
```

### Step 6: Generate PR Description

Structure the PR following Google's code review research (97% dev satisfaction, <4hr
review latency):

```markdown
## [Entity Name] — [Pattern Type]

### Summary
[2-3 sentence description of what this feature adds]

### What to Focus During Review
[2-3 specific areas requiring human judgment]
- **Business logic**: [specific method/decision to validate]
- **Security**: [specific integration to verify]
- **LLM judge finding**: [any CRITICAL or WARNING findings]

### What Has Been Verified (Safe to Skim)
- ✅ TypeScript compilation — zero errors
- ✅ ESLint — zero warnings
- ✅ Convention consistency — [X]% match with [exemplar] exemplar
- ✅ Test suite — [N] tests passing, [X]% coverage
- ✅ Security scan — [result]
- ✅ Migration safety — expand-only, concurrent indexes

### Files Changed
| File | Type | Lines | Notes |
|------|------|-------|-------|
| migration.sql | New | +20 | Schema creation |
| payment-method.service.ts | New | +150 | CRUD + vault + audit |
| ... | | | |

### Testing
- [N] permission matrix tests
- [N] service unit tests
- [N] integration tests
- [N] frontend component tests
- [X]% line coverage

### How to Test Locally
```bash
# Run migration
npm run migrate

# Enable feature flag
export PAYMENT_METHODS_ENABLED=true

# Run tests
npm test -- --testPathPattern=payment-method

# Start dev server
npm run dev
# Navigate to /payment-methods
```

### Decision Log
[Decisions made during generation, with reasoning]
```

### Step 7: Generate QA Checklist

Human QA scenarios that can't be verified mechanically:

```markdown
## QA Checklist: [Entity]

### Functional Testing
- [ ] Create a new [entity] — verify all fields save correctly
- [ ] Edit an existing [entity] — verify changes persist
- [ ] Delete an [entity] — verify removal and confirmation dialog
- [ ] View list with pagination — verify sorting and filtering
- [ ] [Custom method] — verify [specific behavior]

### Permission Testing
- [ ] Access as admin — full CRUD available
- [ ] Access as viewer — read-only, no create/edit/delete buttons
- [ ] Access while unauthenticated — redirected to login

### Edge Cases
- [ ] Create with minimum required fields only
- [ ] Create with maximum-length strings
- [ ] Attempt duplicate [unique field] — verify error message
- [ ] Rapid successive saves — verify no duplicate creation
- [ ] [Any LLM judge findings requiring human verification]

### Integration Testing
- [ ] Vault integration — sensitive field stored as reference, not plaintext
- [ ] Audit log — verify entries appear for create/update/delete
- [ ] Feature flag — verify feature hidden when flag is off

### Visual / UX
- [ ] Responsive layout at mobile/tablet/desktop widths
- [ ] Loading states display correctly
- [ ] Error states display helpful messages
- [ ] Empty state displays when no records exist
```

### Step 8: Commit and Push

```bash
git add .
git commit -m "feat: add [entity] CRUD

- [list of main features]
- Generated by software factory pipeline
- [N] tests, [X]% coverage
- Exemplar: [exemplar-name]"

git push origin feature/add-[entity-kebab-case]
```

## Output Files

```
.factory/current/
├── pr-description.md
├── qa-checklist.md
├── verification-report.md
├── security-report.md (if regulated)
└── judge-findings.md  (LLM review results)
```

## Honest Assessment

Following Kelly Factory's experience: even with 9 shipped apps, human QA is still
required for every release. The PR tells the human what's been verified mechanically
and what still needs human eyes. The 80% CI target covers syntax + conventions.
Functional correctness — "does this feature do what the business actually needs?" —
requires the QA checklist.
