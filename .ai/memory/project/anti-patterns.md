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

- **Problem**: Sending every instruction through the heavy planner path
- **Example**: Running planner mode for target-manager actions, greenfield
  bootstrap turns, or exact-path inspection/edit requests.
- **Why it failed**: It adds avoidable model hops, complicates cancellation
  flows, and makes narrow tasks more brittle without improving the result.
- **Prevention rule**: Reserve planner mode for broad non-trivial code-phase
  work, and keep lightweight execution as the default for narrow or non-code
  turns.

- **Problem**: Stuffing raw spec bodies into rolling summaries or ad hoc prompt prose
- **Example**: Copying long `feature-spec.md` contents into `rollingSummary` or relying on manual paste-only context for spec-driven stories
- **Why it failed**: Prompt state becomes noisy, unstable, and hard for later plan/task flows to reference reliably.
- **Prevention rule**: Use named, bounded spec-loading paths and keep `rollingSummary` compact.

- **Problem**: Using `rollingSummary` or loose notes as the primary long-run reset state
- **Example**: Carrying recovery-heavy turn state in free-form summary lines instead of persisting a typed handoff artifact under `.shipyard/artifacts/`
- **Why it failed**: Resume behavior becomes lossy, hard to validate, and nearly impossible to inspect in traces when something goes wrong.
- **Prevention rule**: Persist typed handoff artifacts, keep only the active artifact path in session state, and inject structured handoff context on resume.

- **Problem**: Replaying full historical tool payloads in long code-writing loops
- **Example**: Feeding old `write_file` bodies and raw `tool_result` payloads back into every Anthropic request even after the files already exist on disk
- **Why it failed**: Prompt size grows with every write-heavy turn, leading to slower requests, provider budget pressure, and follow-up turns dominated by stale history.
- **Prevention rule**: Compact completed older tool cycles into bounded summaries, keep only the protocol tail verbatim, and cap rolling-summary or serialized-session budgets.

- **Problem**: Routing Claude into later UI phases without preserving the Codex skill chain
- **Example**: Turning on a Claude bridge for UI implementation or QA but dropping the exact `typeset`/`colorize`/`arrange` or `critique`/`audit` skill contracts from the prompt
- **Why it failed**: Provider swaps changed the actual design process instead of only changing who executed it.
- **Prevention rule**: Any Claude UI phase bridge must carry the exact same phase skill chain Codex uses, and later-phase Claude routing must stay behind `SHIPYARD_ENABLE_CLAUDE_UI_PHASE_BRIDGES`.

- **Problem**: Adding a second greenfield scaffolder outside the shared target-manager catalog
- **Example**: Creating a new bootstrap toolchain that writes its own boilerplate templates instead of reusing `scaffolds.ts`
- **Why it failed**: Template drift appears immediately between target creation and empty-target bootstrap, and prompt guidance stops matching the actual generator.
- **Prevention rule**: Extend the shared scaffold catalog once and route both `create_target` and `bootstrap_target` through the same materialization helper.

- **Problem**: Escalating same-session follow-up turns into explorer or planner without checking recent local evidence first
- **Example**: Sending a continuation into read-only subagents even though the same session just bootstrapped or edited the relevant files
- **Why it failed**: Shipyard pays extra model hops, hides tool activity from the operator, and burns the same loop budget on work it already knows how to scope locally.
- **Prevention rule**: Reuse recent target-file evidence from bootstrap, edits, active tasks, and prior plans before escalating, and surface any remaining subagent work through the outer reporter path.

- **Problem**: Compacting away every recent write-heavy turn right after a large generation step
- **Example**: Letting raw-loop compaction drop the preserved write tail to zero after a big `write_file`, so the next turns fall back to `list_files` and re-read the files Shipyard just created.
- **Why it failed**: The runtime saves characters by deleting the only concrete memory of new files, so later turns spend budget rebuilding orientation instead of finishing the feature.
- **Prevention rule**: Store history-safe digests for completed write-heavy turns and always preserve at least one recent write-context tail within the compaction budget.

- **Problem**: Treating the acting-iteration threshold as a terminal failure instead of a continuation checkpoint
- **Example**: Throwing from the raw loop at 25 iterations and mapping that exception to `status: failed` even though a typed handoff contract already exists.
- **Why it failed**: Long greenfield work looks broken to the operator and discards the checkpoint/resume system at the exact moment it is most useful.
- **Prevention rule**: Emit a continuation or handoff result when the only issue is loop length, reserve `failed` for genuine runtime errors, and bound continuation with a higher-level wall-clock or turn budget.

- **Problem**: Letting discovery and bootstrap disagree about doc-seeded targets
- **Example**: `bootstrap_target` allows `AGENTS.md` or `README.md`, but discovery marks the same directory as non-greenfield and routes it into broad exploration loops.
- **Why it failed**: Near-empty targets pay the cost of existing-repo discovery without any real code to discover.
- **Prevention rule**: Use one shared bootstrap-ready rule or explicit flag across discovery, coordinator routing, and target bootstrap checks.

- **Problem**: Letting exact-path shortcuts override broad greenfield or continuation budget signals
- **Example**: A bootstrap or "continue the same app" instruction names `apps/web/src/App.tsx`, and the acting-loop budget drops to the narrow default before discovery, recent touched files, or handoff evidence are considered.
- **Why it failed**: Long construction turns checkpoint too early and the smoke only passes if the runtime burns extra reread loops to compensate.
- **Prevention rule**: Resolve broad greenfield and broad continuation intent before falling back to exact-path narrow defaults, and cover the distinction with both focused graph tests and a live smoke.
