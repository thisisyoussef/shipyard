# Code Phase

This is Shipyard's active default phase for repository changes.

## Files

- `index.ts`: exports the phase definition, the enabled tool names, and helper
  functions for retrieving tool definitions in runtime-specific formats
- `prompts.ts`: the system prompt used for the coding loop

## Responsibilities

- expose the bounded tool surface available to the model
- describe the output artifact as a `task_plan`
- keep the default planning/editing guidance in one place

When the runtime grows more phases, this folder should remain the reference
shape for how a phase declares prompt text, tools, and exported helpers.
