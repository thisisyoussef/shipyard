# Deployment Setup Workflow

**Purpose**: Configure deployment for the chosen stack and hosting providers without assuming a default platform.

---

## Phase 0: Setup and Research

### Step 0.1: Run Preflight
- Run `agent-preflight`
- Deliver a concise preflight brief before deployment changes

### Step 0.2: Run Story Lookup
- Run `.ai/workflows/story-lookup.md`
- Gather provider-specific guidance for the selected hosting/runtime platforms
- Publish the lookup brief before changes

### Step 0.3: Size the Story
- Run `.ai/workflows/story-sizing.md`
- Publish `lane: trivial` or `lane: standard`
- Deployment and infra stories usually remain `standard`; only one-file documentation/config clarifications should take the trivial lane

### Step 0.4: Standard-Lane Lock Only
If `lane: standard`:
- run `.ai/workflows/parallel-flight.md`
- claim a `deploy` or `infra` single writer lock before edits

### Step 0.5: Confirm the Real Provider Baseline
- Verify the active deployment contract from repo docs and scripts instead of guessing from neighboring repos or historical artifacts
- If the repo has no canonical deployment baseline yet, record that explicitly and treat the story as deploy-readiness work rather than as an implicit deploy.

### Step 0.6: Verify Deployment Access Early
- Before promising a deploy, verify the required provider access is available from the current machine/session
- If access is missing, do not imply the change was deployed
- Record the exact blocker and continue with deploy-readiness work only

---

## Phase 1: Choose the Deployment Shape

### Step 1: Record Deployment Decisions
- Production environments needed
- Preview environments needed
- Service topology
- Build/start commands
- Health checks
- Rollback strategy

### Step 2: Record Provider Choices
- Backend/runtime host
- Frontend/static host
- Data/service providers
- Secrets/config management mechanism

---

## Phase 2: Configure the Chosen Providers

### Step 3: Create Provider Config
- Add the minimum config required by the selected providers

### Step 4: Configure Secrets
- Environment variables only
- No secrets committed to the repo
- Keep `.env.example` current when applicable

### Step 5: Configure the Git-Based Deploy Flow
- Choose a single production deployment path
- Prefer Git-linked auto-deploy where the provider supports it
- If the repo owns deploy scripts, keep them current in the same story

---

## Phase 3: Validate the Deployment Path

### Step 6: Verify Required Checks Before Release
- Run the project-specific validation commands defined during setup

### Step 7: Verify Runtime Health
- Health or readiness endpoint
- Critical path smoke test
- Logs/metrics/traces visible
- Rollback path documented and tested if practical

### Step 8: Record Deployment Execution Status
- Explicitly capture one of:
  - `deployed` with environment and command evidence
  - `not deployed` with rationale
  - `blocked` with the missing credential/access/prerequisite
- For deploy-relevant stories, include both baseline review status and the explicit execution status of the touched surface

---

## Phase 4: Completion

### Step 9: Document the Final Deployment Contract
- Chosen providers
- Environments
- Required secrets
- Health-check method
- Rollback method
- Production vs preview behavior

### Step 10: Run the Combined Completion Gate
- Run `.ai/workflows/story-handoff.md`
- Include the finalization plan in the same packet as the user audit checklist
- Release the single writer lock if this story claimed it
- After user approval, run `.ai/workflows/git-finalization.md`

---

## Exit Criteria

- Deployment target(s) chosen and documented
- Config and secrets management are in place
- Validation and health checks pass
- Rollback path is documented
- Combined completion gate includes the runtime/deployment audit
- Deployment execution status is explicit
