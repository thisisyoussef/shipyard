# Runtime Skill Registry

`src/skills/` holds the runtime-native skill contracts and registry.

- `contracts.ts`: manifest and loaded-skill contracts
- `registry.ts`: discovery, load/unload, prompt assembly, and phase loadout resolution

Built-in skills live in `shipyard/skills/`. Target-local skills can live under
`<target>/.shipyard/skills/`.
