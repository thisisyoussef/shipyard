---
name: validate
description: Run the Shipyard validation suite (test, typecheck, build, git diff check). Use after making changes to verify nothing is broken.
---

# Validate Shipyard

Run the full validation suite for the Shipyard application.

## Steps

1. Run all validation commands from the repo root:

```bash
pnpm --dir shipyard test
pnpm --dir shipyard typecheck
pnpm --dir shipyard build
git diff --check
```

2. Report results clearly:
   - Tests: pass/fail count
   - Typecheck: clean or list errors
   - Build: success or failure
   - Git diff: clean or list issues

3. If any step fails, diagnose the root cause before suggesting fixes.

4. If all pass, confirm the workspace is clean.
