# Templates

This directory contains scaffolds used by spec-driven delivery workflows.

## Current Template Area

- `spec/README.md`: template pack overview
- `spec/*_TEMPLATE.md`: feature spec, technical plan, task breakdown,
  constitution check, and UI-specific templates

## Diagram

```mermaid
flowchart LR
  Templates["template files"]
  Workflows["../workflows/spec-driven-delivery.md"]
  Specs["shipyard/docs/specs/*"]

  Templates --> Workflows
  Workflows --> Specs
```
