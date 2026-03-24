# Anti-Patterns

Capture failures so they are not repeated.

## Seeded Anti-Patterns

- **Problem**: Treating `.ai/` as product code
- **Example**: Adding runtime features or app modules under `.ai/` instead of `shipyard/`
- **Why it failed**: It blurs the boundary between helper scaffolding and the actual application.
- **Prevention rule**: Product code lives under `shipyard/`; `.ai/` exists to help build it.

- **Problem**: Importing repo-specific history into the harness
- **Example**: Copying another project's backlog, deploy notes, or feature memory into `.ai/memory/`
- **Why it failed**: The helper harness starts giving the wrong instructions for this workspace.
- **Prevention rule**: Keep only generic workflows plus Shipyard-specific durable memory.

- **Problem**: Documenting commands that do not exist
- **Example**: Telling the harness to run `lint` or deploy commands that are not defined in `shipyard/package.json`
- **Why it failed**: Validation guidance becomes misleading and wastes time.
- **Prevention rule**: Align the harness with the commands that actually exist in `shipyard/`.

- **Problem**: Letting current-task notes become a backlog archive
- **Example**: Accumulating long story histories under `.ai/memory/session/`
- **Why it failed**: Current context becomes noisy and harder to trust.
- **Prevention rule**: Move only durable truths into project memory and keep session notes concise.
