---
name: config-gen
description: >
  Generate configuration artifacts: feature flags, permission entries, environment variables,
  and route registrations. Use this skill when the user says "set up feature flag", "add
  permissions", "configure feature toggle", "register routes", "add environment variables",
  or when running the factory pipeline's config stage. Also trigger for "set up the config
  for [feature]" or when adding a new feature that needs gating, permission control, or
  environment configuration. This skill runs in parallel with migration-gen since it has
  no data dependencies on the schema.
---

# Config Generator — Feature Flags, Permissions, Environment

## Purpose

Generate all configuration artifacts a new feature needs: feature flags for gradual
rollout, permission entries for access control, environment variable placeholders, and
route registrations. These are low-risk, high-value files that rarely need retries.

## Prerequisites

Load from `.factory/current/`:
- `feature-model.json` — config section with flag names, permissions, env vars

Load from `.factory/`:
- `CONSTITUTION.md` — how flags/permissions/env are structured in this project

## Generation Process

### Step 1: Feature Flag

Find how the project manages feature flags (from constitution):
- **Config file** (YAML/JSON): add entry to the flags file
- **LaunchDarkly/Unleash/Flagsmith**: generate the flag definition
- **Environment variable**: add to `.env.example`
- **Database-backed**: generate seed/migration

Generate the flag:
```yaml
# Example: YAML-based flags
payment_methods_enabled:
  description: "Enable payment methods CRUD and UI"
  default: false
  rollout:
    - environment: development
      enabled: true
    - environment: staging
      enabled: true
    - environment: production
      enabled: false
```

### Step 2: Permission Entry

Find the permission system (from constitution):
- **Database seeds**: generate insert statement
- **Config file**: add to permissions config
- **Code-defined**: add to permissions enum/constant

Generate the permission:
```typescript
// Example: Code-defined permissions
export const PERMISSIONS = {
  // ... existing permissions
  PAYMENT_METHODS_MANAGE: 'payment_methods:manage',
} as const;
```

Also generate role assignments (which roles get this permission):
```yaml
roles:
  admin:
    permissions:
      - payment_methods:manage  # new
  merchant_owner:
    permissions:
      - payment_methods:manage  # new
```

### Step 3: Environment Variables

For any new env vars the feature needs:

1. Add to `.env.example` with descriptive comments
2. Add to any env validation schema (zod? joi? dotenv-safe?)
3. Add to Docker compose / k8s config if those exist

```bash
# .env.example additions
# Payment Methods
# VAULT_PAYMENT_ENDPOINT=https://vault.example.com/v1/payment
```

### Step 4: Route Registration

If the project has a central route registry, add the new routes:

```typescript
// Follow the exemplar's exact registration pattern
import { PaymentMethodController } from './modules/payment-method/payment-method.controller';

// Add to route array / module imports / router config
```

### Step 5: Verify

```bash
# YAML validation (if flags are YAML)
python -c "import yaml; yaml.safe_load(open('config/flags.yaml'))"

# JSON validation (if flags are JSON)
python -c "import json; json.load(open('config/flags.json'))"

# Check permission key uniqueness
grep -r "payment_methods:manage" src/ | wc -l  # should be defined exactly once

# TypeScript compilation (if permissions are typed)
npx tsc --noEmit
```

## Output Files

```
.factory/current/
├── generated/
│   ├── config/
│   │   ├── feature-flag.[yaml|json|ts]  (or patch to existing file)
│   │   ├── permissions.[yaml|json|ts]   (or patch to existing file)
│   │   └── env.example.patch            (additions to .env.example)
│   └── routes/
│       └── route-registration.patch     (additions to route config)
└── config-verification.md
```

## Important Notes

- This stage has **zero dependencies** on migration-gen or api-gen. It runs in parallel.
- Config changes are usually **patches to existing files**, not new files. Be precise
  about where in the existing file the new entries should go (alphabetical? grouped?).
- Permission keys should follow the project's existing naming convention exactly.
- Feature flag names should follow the project's existing naming convention exactly.
- Never generate credentials or secrets — only placeholders.
