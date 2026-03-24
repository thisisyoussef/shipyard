---
name: factory-orchestrator
description: >
  Run the full software factory pipeline end-to-end: from a feature spec to a complete,
  tested, PR-ready implementation. Coordinates all factory skills in the correct order with
  proper contracts between stages. Use this skill when the user says "run the factory",
  "build this feature end-to-end", "full pipeline", "generate everything for [entity]",
  "ship this feature", or provides a complete feature spec and wants the full pipeline
  executed. Also trigger for "factory mode", "build [entity] from spec to PR", or any
  request that implies running the complete generation pipeline rather than individual stages.
  This is the top-level orchestrator — it calls all other factory skills in sequence.
---

# Factory Orchestrator — Spec to PR Pipeline

## Purpose

Coordinates the full pipeline: spec → feature model → plan → generate → test → PR.
Manages the typed contracts between stages, handles human approval gates, and implements
the failure recovery strategy. This is the single entry point for end-to-end feature
generation.

## The Pipeline

```
INPUT: Feature Spec (JSON or natural language)
  │
  ▼
[1] CONSTITUTION CHECK — Is this repo indexed?
  │  No → run repo-constitution skill
  │  Yes → continue
  ▼
[2] PARSE — feature-model skill
  │  Output: feature-model.json
  │  ★ HUMAN GATE: approve feature model
  ▼
[3] PLAN — execution-planner skill
  │  Output: execution-plan.json
  │  ★ HUMAN GATE: approve execution plan
  ▼
[4] GENERATE — run stages per execution plan
  │  ├── [parallel] migration-gen → schema-contract.json
  │  │   ★ HUMAN GATE (if regulated)
  │  ├── [parallel] config-gen → config files
  │  ├── [sequential] api-gen → api-contract.json (needs schema-contract)
  │  ├── [sequential] frontend-gen → components (needs api-contract)
  │  └── [sequential] test-suite-gen → test files (needs all code)
  ▼
[5] ASSEMBLE — pr-assembler skill
  │  Output: PR + QA checklist
  ▼
OUTPUT: Feature branch with PR description + QA checklist
```

## Running the Pipeline

### Mode: Gated (Default)

In Gated mode, the pipeline pauses for human approval at:
1. Feature Model approval
2. Execution Plan approval
3. Migration approval (if regulated product)

Between gates, the pipeline runs autonomously.

### Mode: Supervised

In Supervised mode, the pipeline pauses after EVERY stage. Use this for the first
5-10 runs on a new repo, or when learning the system.

### Mode: Step-by-Step (Manual)

The user can also run individual skills manually. In this case, the orchestrator
just ensures prerequisites exist before each skill runs.

## Execution Protocol

### Step 0: Initialize

```bash
# Create factory workspace
mkdir -p .factory/current/generated
mkdir -p .factory/current/migrations

# Check for existing constitution
if [ ! -f .factory/CONSTITUTION.md ]; then
  echo "⚠️ No constitution found. Run repo-constitution first."
  # Trigger repo-constitution skill
fi
```

### Step 1: Parse Spec → Feature Model

Read the user's spec. Invoke the `feature-model` skill.

**Contract out:** `feature-model.json`

Present the Feature Model summary to the user. Wait for approval.

If the user requests changes:
- Update the feature model
- Re-present for approval
- Loop until approved

### Step 2: Plan → Execution DAG

Invoke the `execution-planner` skill with the approved feature model.

**Contract out:** `execution-plan.json`

Present the execution plan. Wait for approval.

### Step 3: Execute Generation Stages

Follow the execution plan's stage ordering and parallel groups.

For each stage:
1. Check prerequisites (input contracts exist)
2. Run the skill
3. Verify output (each skill does its own verification)
4. If verification fails → retry (max 3)
5. If retries exhausted → attempt exemplar swap
6. If swap fails → human escalation (preserve all artifacts, explain what failed)
7. If human gate → present output, wait for approval
8. Save output contracts for downstream stages

**Stage execution tracking:**
```
Stage: migration-gen
  Status: ✅ PASSED (attempt 1)
  Time: 28s
  Cost: $0.08
  Output: schema-contract.json, migration.sql
  Verification: sql-validate ✅, squawk ✅

Stage: api-gen
  Status: ✅ PASSED (attempt 2)
  Time: 94s (attempt 1: 45s fail, attempt 2: 49s pass)
  Cost: $0.72
  Output: api-contract.json, 4 source files
  Verification: typecheck ✅, lint ✅, convention-diff 96%
  Retry reason: VaultClient import path incorrect

Stage: config-gen
  Status: ✅ PASSED (attempt 1)
  Time: 18s
  Cost: $0.06
  ...
```

### Step 4: Assemble PR

After all generation stages pass, invoke the `pr-assembler` skill.

Present the final result:

```markdown
## 🏭 Factory Run Complete

### Pipeline Summary
| Stage | Status | Time | Cost | Retries |
|-------|--------|------|------|---------|
| feature-model | ✅ Approved | — | $0.15 | 0 |
| execution-plan | ✅ Approved | — | $0.10 | 0 |
| migration-gen | ✅ Passed | 28s | $0.08 | 0 |
| config-gen | ✅ Passed | 18s | $0.06 | 0 |
| api-gen | ✅ Passed | 94s | $0.72 | 1 |
| frontend-gen | ✅ Passed | 85s | $0.68 | 0 |
| test-suite-gen | ✅ Passed | 62s | $0.58 | 0 |
| pr-assembler | ✅ Complete | 110s | $0.40 | 0 |

### Totals
- **Compute time**: ~6.5 minutes
- **Estimated cost**: ~$2.77
- **Files generated**: 14
- **Tests generated**: 43
- **Retries**: 1 (api-gen: import path fix)
- **Human gates**: 2 (feature model + plan)
- **LLM judge findings**: [count]

### Outputs
- 📋 PR description: `.factory/current/pr-description.md`
- ✅ QA checklist: `.factory/current/qa-checklist.md`
- 📊 Verification report: `.factory/current/verification-report.md`
- 🔒 Security report: `.factory/current/security-report.md`

### Next Steps
1. Review the PR description
2. Run through the QA checklist
3. Push and open the PR
```

## Failure Recovery

### Level 1: Retry
- Trigger: verification fails (lint error, type error, test failure)
- Action: feed error output back, regenerate the stage
- Cost: seconds, ~$0.05

### Level 2: Exemplar Swap
- Trigger: 3 retries exhausted
- Action: swap to fallback exemplar from feature model, rerun stage
- Cost: minutes, ~$0.50

### Level 3: Human Escalation
- Trigger: structural error persists after exemplar swap
- Action: preserve ALL upstream artifacts, present partial result with detailed error
- The human fixes one stage, then resumes the pipeline from that point

### Resuming After Failure

The pipeline is resumable. All state is in `.factory/current/`. To resume:
1. Check which stages completed (look for output contracts)
2. Start from the first incomplete stage
3. All upstream contracts are still valid

## Context Management

Each stage gets a FRESH context. Do not carry generation context from one stage to
the next. The contracts (feature-model.json, schema-contract.json, api-contract.json)
are the ONLY communication channel between stages.

Why: Context overflow kills agents silently. By the time you've generated a migration,
service, controller, DTOs, and tests, the context is full of generation artifacts that
pollute future stages. Fresh context + typed contracts = reliable multi-stage pipelines.

In practice with Claude Code or Codex: after each stage completes and writes its output
contract, explicitly state that the next stage should read ONLY from the contract files,
not from conversation history.

## Feedback Loop

After each factory run, automatically update:

1. **Exemplar scores**: did this exemplar produce first-pass success? Update
   `.factory/exemplars/[name].md` with success/failure count
2. **Error catalog**: if a retry was needed, what was the error? Add to
   `.factory/error-patterns.json` for future prevention
3. **Convention refinements**: if the human edited generated code, what did they change?
   Flag for potential constitution update

## Adding a New Product

To onboard a new codebase to the factory:
1. Run `repo-constitution` skill on the new repo (~20-30 min)
2. Human validates the constitution (~15 min)
3. Run the factory on a simple CRUD feature in supervised mode
4. Fix any issues, update constitution
5. Run 3-5 more features in gated mode
6. Promote to standard gated operation

Expected cold start: ~2 hours for a well-structured repo.
