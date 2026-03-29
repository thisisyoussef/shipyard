# Paper + Codex

Use Paper Desktop as live design context when Shipyard runs visible UI stories through Codex.

## Why This Exists

Refero gives Shipyard external precedent. Paper gives Codex direct access to the actual design file we are iterating on. Together they let the design brief and later UI work start from real references plus the real in-flight screen instead of vague prose.

## Where It Fits

For visible UI stories, use Paper in three places:

1. `story-lookup.md`
   Capture which Paper frames or breakpoints the story will use for critique, redesign, or responsive checks.
2. `design-phase.md`
   When Paper is available and we want live design iteration, run the design brief bridge with Codex instead of the Claude-first auto path.
3. `feature-development.md`
   Keep later scripted UI phase bridges Codex-first unless there is an explicit reason to turn the Claude bridge flag back on.

## Setup

Run this once per machine:

```bash
node scripts/setup-paper-codex.mjs
```

This updates the user Codex config at `~/.codex/config.toml` so Codex can reach the Paper MCP server at `http://127.0.0.1:29979/mcp`.

Paper Desktop requirements:

- Paper Desktop must be installed and signed in.
- Keep the relevant Paper file open.
- Select the frame or frames you want Codex to inspect before prompting.

Keep `SHIPYARD_ENABLE_CLAUDE_UI_PHASE_BRIDGES` unset while using this Codex-first Paper path.

## Recommended Workflow

1. Use Refero for external precedent when the story benefits from real-product comparisons.
2. Open the relevant screen in Paper and select the target frame.
3. Generate or refresh the design brief with:

```bash
node scripts/generate-design-brief.mjs --story <story-id> --provider codex
```

4. Use short Codex prompts against the selected Paper frame to critique, duplicate, and vary the design before locking the brief.
5. Keep later UI phase bridges on the default Codex-first path unless the story explicitly wants a Claude experiment.

## Bootstrap From Live UI

If there is no Shipyard Paper file yet, use the preview harness plus Codex to
seed one from the current UI surfaces:

```bash
node scripts/import-ui-to-paper.mjs --paper-file-name "Shipyard UI"
```

What this does:

- starts the mock-backed preview harness at `/preview.html`
- captures the current dashboard, editor, board, and human-feedback surfaces
- feeds those screenshots to Codex with Paper MCP access
- creates new Paper artboards for each captured screen in the currently open
  Paper file

Useful flags:

- `--dry-run` to inspect the exact surface catalog and output paths
- `--capture-only` to save screenshots without touching Paper
- `--surface <id>` to limit the run to one or more screens
- `--allow-any-paper-file` when you intentionally want to seed whatever Paper
  file is open instead of requiring an exact file name

The importer is safest when you open a blank Paper file first and pass its exact
file name with `--paper-file-name`.

## Prompting Guidance

Good Paper prompts are frame-specific and revision-oriented.

Good examples:

- `Critique the selected Paper frame. Keep the information architecture, but call out hierarchy, spacing, typography, and CTA problems.`
- `Duplicate the selected Paper frame and produce three stronger variants: calmer premium, sharper conversion-focused, and more editorial.`
- `Use the selected Paper breakpoints to define responsive constraints for this story before updating the design brief.`

Avoid prompts that describe the whole app at once. Smaller, well-structured Paper frames produce better Codex iterations.

## Troubleshooting

- If Codex says Paper tools are missing, start a fresh Codex session or restart the app.
- If the local Paper endpoint is down, reopen Paper Desktop and keep a file open.
- Verify the connection with: `create a red rectangle in Paper`
