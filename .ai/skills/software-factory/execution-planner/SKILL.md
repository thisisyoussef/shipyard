---
name: execution-planner
description: >
  Create an ordered execution plan (task DAG) from a Feature Model, determining which
  generation stages run in what order, what can parallelize, and where human gates are
  needed. Use this skill when the user says "plan this feature", "create execution plan",
  "what's the build order", "create task DAG", "plan the implementation", or after a
  feature model has been approved and the user wants to proceed to implementation. Also
  trigger when someone says "how should I build this" after providing a spec or feature model.
---

# Execution Planner — Feature Model → Task DAG

## Purpose

Not all features need all stages. Not all stages are sequential. The planner reads a
Feature Model and produces the minimal ordered plan — which stages run, in what order,
what can parallelize, and where humans must approve before proceeding.

## Prerequisites

Requires `.factory/current/feature-model.json`. If it doesn't exist, tell the user to
run the `feature-model` skill first.

## Planning Algorithm

### Step 1: Determine Required Stages

Read the feature model and check what's needed:

| Condition | Stage Required |
|-----------|---------------|
| `database.columns` is non-empty | `migration-gen` |
| `backend.files` is non-empty | `api-gen` |
| `config.feature_flag` exists OR `config.permission_entry` exists | `config-gen` |
| `frontend.files` is non-empty | `frontend-gen` |
| Always | `test-suite-gen` |
| Always | `pr-assembler` |

Research stage: include ONLY if the feature model references integrations that have NO
exemplar in `.factory/exemplars/`. If all integrations are exemplified, skip research.

### Step 2: Determine Dependencies and Parallelism

The dependency graph:

```
feature-model (input)
    │
    ├── migration-gen ──────┐
    │                       ├──→ api-gen ──→ frontend-gen ──┐
    ├── config-gen ─────────┘                               ├──→ test-suite-gen ──→ pr-assembler
    │                                                       │
    └── (research, if needed) ──────────────────────────────┘
```

Key rules:
- `migration-gen` produces a **Schema Contract** consumed by `api-gen`
- `api-gen` produces an **API Contract** consumed by `frontend-gen` and `test-suite-gen`
- `config-gen` has NO dependencies on migration or API — runs in parallel
- `test-suite-gen` needs ALL generated code before it can generate tests
- `pr-assembler` runs last, always

Parallel groups:
- **Group A** (no dependencies): `migration-gen` + `config-gen` (+ `research` if needed)
- **Group B** (depends on migration): `api-gen`
- **Group C** (depends on API): `frontend-gen`
- **Group D** (depends on all code): `test-suite-gen`
- **Group E** (final): `pr-assembler`

### Step 3: Insert Human Gates

Human gates are inserted based on:

| Gate | Condition | Rationale |
|------|-----------|-----------|
| After feature-model | Always (already done) | Architecture decisions need approval |
| After migration-gen | If regulated (SOC2/HIPAA) OR if schema has sensitive columns | Schema changes are hard to undo |
| After plan approval | Always | Human confirms the execution plan before spending compute |

### Step 4: Estimate Cost and Time

Per-stage estimates (adjust based on feature complexity):

| Stage | Typical Time | Typical Cost | Model Tier |
|-------|-------------|-------------|-----------|
| migration-gen | 30s | $0.08 | Tier 2 |
| api-gen | 90s | $0.60 | Tier 2 |
| config-gen | 20s | $0.06 | Tier 2 |
| frontend-gen | 90s | $0.68 | Tier 2 |
| test-suite-gen | 60s | $0.58 | Tier 2 |
| pr-assembler | 120s | $0.40 | Tier 1 (judge) |
| **Total (typical CRUD)** | **~7 min** | **~$2.40** | |

### Step 5: Produce the Execution Plan

Output `execution-plan.json` to `.factory/current/`:

```json
{
  "feature": "PaymentMethod",
  "stages": [
    {
      "id": "migrate",
      "skill": "migration-gen",
      "depends_on": [],
      "parallel_group": "A",
      "model_tier": 2,
      "human_gate": true,
      "gate_reason": "SOC 2 — schema changes require approval",
      "estimated_seconds": 30,
      "estimated_cost": 0.08,
      "inputs": ["feature-model.json"],
      "outputs": ["schema-contract.json", "migration.sql"]
    },
    {
      "id": "config",
      "skill": "config-gen",
      "depends_on": [],
      "parallel_group": "A",
      "model_tier": 2,
      "human_gate": false,
      "estimated_seconds": 20,
      "estimated_cost": 0.06,
      "inputs": ["feature-model.json"],
      "outputs": ["feature-flag.yaml", "permissions.yaml", ".env.example"]
    }
  ],
  "parallel_groups": {
    "A": ["migrate", "config"],
    "B": ["api"],
    "C": ["frontend"],
    "D": ["tests"],
    "E": ["pr-assemble"]
  },
  "total_estimated_seconds": 420,
  "total_estimated_cost": 2.40,
  "human_gates": ["migrate"],
  "skipped_stages": ["research"]
}
```

### Step 6: Present for Approval

Show a readable plan:

```markdown
## Execution Plan: [Entity]

### Pipeline
1. ✅ Feature Model (approved)
2. ⏳ [Group A — parallel]
   - migration-gen → Schema Contract ★ HUMAN GATE (SOC 2)
   - config-gen → flags + permissions
3. ⏳ api-gen → API Contract (depends on: migration)
4. ⏳ frontend-gen → Components (depends on: API)
5. ⏳ test-suite-gen → Test suite (depends on: all code)
6. ⏳ pr-assembler → PR + QA checklist

### Estimates
- Time: ~7 minutes compute
- Cost: ~$2.40
- Human gates: 1 (migration approval)
- Skipped: research (all integrations exemplified)

### Proceed?
```

## Failure Recovery Plan

Include in the execution plan:

For each stage, define:
1. **Retry strategy**: feed error back to agent, regenerate (max 3 retries)
2. **Exemplar swap**: if 3 retries fail, swap to fallback exemplar from feature model
3. **Human escalation**: preserve all upstream artifacts, present partial result

```json
"failure_recovery": {
  "max_retries_per_stage": 3,
  "on_retry_exhausted": "swap_exemplar",
  "on_swap_exhausted": "human_escalation",
  "preserves_upstream": true
}
```

## Saving State

```
.factory/current/
├── feature-model.json        (from previous step)
├── execution-plan.json       (this step's output)
└── execution-plan-summary.md (human-readable)
```
