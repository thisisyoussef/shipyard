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

- **Problem**: Stuffing raw spec bodies into rolling summaries or ad hoc prompt prose
- **Example**: Copying long `feature-spec.md` contents into `rollingSummary` or relying on manual paste-only context for spec-driven stories
- **Why it failed**: Prompt state becomes noisy, unstable, and hard for later plan/task flows to reference reliably.
- **Prevention rule**: Use named, bounded spec-loading paths and keep `rollingSummary` compact.

- **Problem**: Using `rollingSummary` or loose notes as the primary long-run reset state
- **Example**: Carrying recovery-heavy turn state in free-form summary lines instead of persisting a typed handoff artifact under `.shipyard/artifacts/`
- **Why it failed**: Resume behavior becomes lossy, hard to validate, and nearly impossible to inspect in traces when something goes wrong.
- **Prevention rule**: Persist typed handoff artifacts, keep only the active artifact path in session state, and inject structured handoff context on resume.
