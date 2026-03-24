# Spec Template Pack

Use these templates to execute Spec-Driven Development before TDD implementation.

## Core Templates
- `CONSTITUTION_TEMPLATE.md`
- `FEATURE_SPEC_TEMPLATE.md`
- `TECHNICAL_PLAN_TEMPLATE.md`
- `TASK_BREAKDOWN_TEMPLATE.md`

## UI Template
- `UI_COMPONENT_SPEC_TEMPLATE.md`
- `UI_PROMPT_BRIEF_TEMPLATE.md`

## Recommended Story Artifact Layout

Create one folder per story:

```
docs/specs/<phase>/<story-id>/
  constitution-check.md
  feature-spec.md
  technical-plan.md
  task-breakdown.md
  ui-component-spec.md   # only when UI scope exists
  ui-prompt-brief.md     # when UI prompting needs structured direction/reuse
```

Keep these files aligned with implementation and tests throughout the story lifecycle.

When planning a story pack or phase pack, define the higher-level objectives first and draft the full story set together before implementation starts. That keeps the pack consistent, cohesive, holistic, and comprehensive instead of growing one disconnected story at a time.
