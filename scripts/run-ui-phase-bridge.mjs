#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";

const execFile = promisify(execFileCallback);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, "..");
const maxBufferBytes = 10 * 1024 * 1024;
const defaultTimeoutMs = parsePositiveInteger(
  process.env.UI_PHASE_BRIDGE_TIMEOUT_MS,
  10 * 60 * 1_000,
);
const defaultClaudeModel =
  process.env.CLAUDE_UI_PHASE_MODEL?.trim() ||
  process.env.CLAUDE_DESIGN_MODEL?.trim() ||
  "sonnet";
const defaultCodexModel =
  process.env.CODEX_UI_PHASE_FALLBACK_MODEL?.trim() ||
  process.env.CODEX_DESIGN_FALLBACK_MODEL?.trim() ||
  "";

export const CLAUDE_UI_PHASE_BRIDGES_FLAG =
  "SHIPYARD_ENABLE_CLAUDE_UI_PHASE_BRIDGES";

const sharedContextPaths = [
  "AGENTS.md",
  ".ai/docs/SINGLE_SOURCE_OF_TRUTH.md",
  ".ai/codex.md",
  ".ai/agents/claude.md",
  ".claude/CLAUDE.md",
  ".ai/docs/design/DESIGN_PHILOSOPHY_AND_LANGUAGE.md",
  ".ai/skills/frontend-design.md",
  "shipyard/ui/README.md",
  "shipyard/ui/src/README.md",
  "shipyard/ui/src/primitives.tsx",
  "shipyard/ui/src/tokens/index.css",
];

const phaseDefinitions = {
  ui: {
    displayName: "UI implementation",
    stateFileName: "ui-summary.md",
    readOnly: false,
    workflowContextPaths: [
      ".ai/workflows/feature-development.md",
      ".ai/workflows/tdd-pipeline.md",
    ],
    dependentArtifacts: ["design"],
    skillGroupLabel: "Phase 2 Build and Refine skill chain",
    skills: [
      ["typeset", "apply typography hierarchy and font loading decisions"],
      ["colorize", "apply the semantic color direction from the brief"],
      ["arrange", "implement layout, spacing, and visual rhythm"],
      ["animate", "add meaningful motion, transitions, and micro-interactions"],
      ["bolder", "increase visual impact when the result feels too safe"],
    ],
    summarySections: [
      "Phase verdict",
      "Skills applied",
      "Repository changes",
      "Validation",
      "Remaining risks",
    ],
    instructions: [
      "Act as Shipyard's UI implementation bridge for this story.",
      "Read the design brief first and treat it as the primary visual contract.",
      "Implement the visible UI work in normal repo files while staying inside the current story.",
      "Do not modify tests unless the workflow explicitly allows it.",
      "Keep edits surgical and aligned with the existing Shipyard token and component system.",
      "Run the smallest relevant validation commands for the changed surface and report them.",
    ],
    rules: [
      "Treat the listed skills as imperative instructions, not optional inspiration.",
      "Prefer existing Shipyard patterns and token names over invention.",
      "If the design brief is missing or incomplete, continue with a clearly labeled assumption instead of silently inventing a new direction.",
      "Return Markdown only. No outer code fences.",
    ],
  },
  qa: {
    displayName: "UI QA and quality gate",
    stateFileName: "qa-summary.md",
    readOnly: false,
    workflowContextPaths: [
      ".ai/workflows/feature-development.md",
      ".ai/workflows/tdd-pipeline.md",
      ".ai/workflows/ui-qa-critic.md",
    ],
    dependentArtifacts: ["design", "ui"],
    skillGroupLabel: "Phase 3 Quality Gate skill chain",
    skills: [
      ["critique", "evaluate hierarchy, composition, typography, color, and states"],
      ["audit", "check accessibility, performance, theming, and responsive behavior"],
      ["fixing-accessibility", "fix WCAG issues without changing the story contract"],
      ["fixing-motion-performance", "fix motion or rendering performance issues"],
    ],
    summarySections: [
      "QA verdict",
      "Skills applied",
      "Issues fixed",
      "Validation",
      "Remaining follow-ups",
    ],
    instructions: [
      "Act as Shipyard's UI QA and refactor bridge for this story.",
      "Review the current UI implementation against the design brief and quality gate workflow.",
      "Fix the highest-severity quality, accessibility, responsive, and motion issues while keeping the suite green.",
      "Stay inside the current story instead of turning this into an open-ended redesign.",
      "List any non-blocking follow-ups that should remain outside the current story.",
    ],
    rules: [
      "Treat the listed skills as imperative instructions, not optional inspiration.",
      "Prioritize user-facing correctness, accessibility, and feedback trust over cosmetic nits.",
      "Keep edits narrowly scoped to quality issues supported by the current story and UI artifacts.",
      "Return Markdown only. No outer code fences.",
    ],
  },
  critic: {
    displayName: "UI critic",
    stateFileName: "critic-brief.md",
    readOnly: true,
    workflowContextPaths: [
      ".ai/workflows/feature-development.md",
      ".ai/workflows/ui-qa-critic.md",
    ],
    dependentArtifacts: ["design", "ui", "qa"],
    skillGroupLabel: "UI QA critic skill chain",
    skills: [
      ["critique", "evaluate hierarchy, composition, typography, color, and states"],
      ["audit", "check accessibility, performance, theming, and responsive behavior"],
      ["fixing-accessibility", "look for WCAG compliance gaps and disclosure issues"],
      ["fixing-motion-performance", "look for motion or rendering performance gaps"],
    ],
    summarySections: [
      "Story and evidence",
      "Strengths",
      "Findings",
      "Recommendation",
      "Suggested follow-ons",
    ],
    instructions: [
      "Act as Shipyard's evidence-based UI critic bridge for this story.",
      "Use the available local context, bridge artifacts, and visible-proof notes to produce a concise QA Critic Brief.",
      "Keep findings specific, bounded, and evidence-oriented.",
      "Do not edit repository files in this phase.",
    ],
    rules: [
      "Treat the listed skills as imperative evaluation instructions, not optional inspiration.",
      "Do not expand the current story or propose a full redesign.",
      "If visible proof is missing, say so explicitly and base the brief on the best local evidence available.",
      "Return Markdown only. No outer code fences.",
    ],
  },
  polish: {
    displayName: "UI final polish",
    stateFileName: "polish-summary.md",
    readOnly: false,
    workflowContextPaths: [
      ".ai/workflows/feature-development.md",
      ".ai/workflows/ui-qa-critic.md",
    ],
    dependentArtifacts: ["design", "ui", "qa", "critic"],
    skillGroupLabel: "Phase 4 Final Polish skill chain",
    skills: [
      ["polish", "fix alignment, spacing, consistency, and edge-case roughness"],
      ["overdrive", "use ambitious polish only when it clearly serves the story"],
    ],
    summarySections: [
      "Polish verdict",
      "Skills applied",
      "Repository changes",
      "Validation",
      "Remaining risks",
    ],
    instructions: [
      "Act as Shipyard's final UI polish bridge for this story.",
      "Apply the exact final polish skill chain without expanding into a new design or architecture pass.",
      "Prefer subtle clarity, spacing, alignment, and motion improvements before larger visual moves.",
      "Use overdrive only when the story clearly benefits from the extra ambition.",
      "Run the smallest relevant validation commands for the changed surface and report them.",
    ],
    rules: [
      "Treat the listed skills as imperative instructions, not optional inspiration.",
      "Keep the story scope narrow and preserve the existing design direction.",
      "Do not introduce unrelated cleanup or structural refactors in this phase.",
      "Return Markdown only. No outer code fences.",
    ],
  },
};

function parsePositiveInteger(value, fallback) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isTruthyEnvValue(value) {
  return /^(1|true|yes|on)$/iu.test((value ?? "").trim());
}

function isClaudeUiPhaseBridgesEnabled(env = process.env) {
  return isTruthyEnvValue(env[CLAUDE_UI_PHASE_BRIDGES_FLAG]);
}

function printUsage() {
  const lines = [
    "Usage:",
    "  node scripts/run-ui-phase-bridge.mjs --phase <ui|qa|critic|polish> --story <story-id> [options]",
    "",
    "Options:",
    "  --phase            Required bridge phase: ui, qa, critic, or polish",
    "  --story, -s        Story id used for output path and spec auto-discovery",
    "  --spec, -p         Path to the story's feature spec (auto-discovered when omitted)",
    "  --context-path, -c Extra file or directory to mention in the prompt (repeatable)",
    "  --output, -o       Output path for the phase summary artifact",
    "  --provider         auto (default), claude, or codex",
    "  --fallback         codex (default) or none",
    "  --claude-model     Claude model alias to use (default: env CLAUDE_UI_PHASE_MODEL or sonnet)",
    "  --codex-model      Codex fallback model alias (default: env CODEX_UI_PHASE_FALLBACK_MODEL)",
    "  --dry-run          Print resolved inputs without calling Claude or Codex",
    "  --help, -h         Show this help",
    "",
    `Flag: set ${CLAUDE_UI_PHASE_BRIDGES_FLAG}=1 to make auto-provider use Claude first for ui, qa, critic, and polish.`,
    "",
    "Examples:",
    "  node scripts/run-ui-phase-bridge.mjs --phase ui --story uiv3-s09",
    "  node scripts/run-ui-phase-bridge.mjs --phase qa --story uiv3-s09",
    "  node scripts/run-ui-phase-bridge.mjs --phase critic --story uiv3-s09 --output .ai/state/custom/critic.md",
    "  node scripts/run-ui-phase-bridge.mjs --phase polish --story uiv3-s09 --provider claude",
  ];

  console.log(lines.join("\n"));
}

function normalizePhase(value) {
  const normalized = (value ?? "").trim().toLowerCase();

  if (!normalized) {
    throw new Error("phase must not be blank.");
  }

  if (!(normalized in phaseDefinitions)) {
    throw new Error("phase must be one of: ui, qa, critic, polish.");
  }

  return normalized;
}

function normalizeProvider(value, fieldName, allowedValues) {
  const normalized = (value ?? "").trim().toLowerCase();

  if (!normalized) {
    throw new Error(`${fieldName} must not be blank.`);
  }

  if (!allowedValues.has(normalized)) {
    throw new Error(
      `${fieldName} must be one of: ${Array.from(allowedValues).join(", ")}.`,
    );
  }

  return normalized;
}

function asArray(value) {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function relativeToRepo(filePath) {
  return path.relative(repoRoot, filePath) || ".";
}

function normalizeOutput(value) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed
    .replace(/^```(?:markdown|md)?\s*/u, "")
    .replace(/\s*```$/u, "")
    .trim();
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findStoryDirectories(rootDirectory, storyId, matches = []) {
  let entries = [];
  const normalizedStoryId = storyId.toLowerCase();

  try {
    entries = await readdir(rootDirectory, { withFileTypes: true });
  } catch {
    return matches;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const fullPath = path.join(rootDirectory, entry.name);
    const normalizedEntryName = entry.name.toLowerCase();

    if (
      normalizedEntryName === normalizedStoryId ||
      normalizedEntryName.startsWith(`${normalizedStoryId}-`)
    ) {
      matches.push(fullPath);
      continue;
    }

    if (entry.name.startsWith(".")) {
      continue;
    }

    await findStoryDirectories(fullPath, storyId, matches);
  }

  return matches;
}

async function resolveSpecPath(storyId, specPathArgument) {
  if (specPathArgument) {
    const absolutePath = path.resolve(repoRoot, specPathArgument);

    if (!(await pathExists(absolutePath))) {
      throw new Error(`Spec path does not exist: ${specPathArgument}`);
    }

    return absolutePath;
  }

  const specsRoot = path.join(repoRoot, "shipyard", "docs", "specs");
  const storyDirectories = await findStoryDirectories(specsRoot, storyId);
  const specMatches = [];

  for (const storyDirectory of storyDirectories) {
    const featureSpecPath = path.join(storyDirectory, "feature-spec.md");

    if (await pathExists(featureSpecPath)) {
      specMatches.push(featureSpecPath);
    }
  }

  if (specMatches.length === 1) {
    return specMatches[0];
  }

  if (specMatches.length === 0) {
    throw new Error(
      `Could not auto-discover feature-spec.md for story "${storyId}". Pass --spec explicitly.`,
    );
  }

  throw new Error(
    `Found multiple feature specs for story "${storyId}". Pass --spec explicitly.\n${specMatches.map((match) => `- ${relativeToRepo(match)}`).join("\n")}`,
  );
}

function buildArtifactPaths(storyId) {
  const bridgeDirectory = path.join(
    repoRoot,
    ".ai",
    "state",
    "ui-phase-bridge",
    storyId,
  );

  return {
    design: path.join(
      repoRoot,
      ".ai",
      "state",
      "design-brief",
      storyId,
      "brief.md",
    ),
    ui: path.join(bridgeDirectory, phaseDefinitions.ui.stateFileName),
    qa: path.join(bridgeDirectory, phaseDefinitions.qa.stateFileName),
    critic: path.join(bridgeDirectory, phaseDefinitions.critic.stateFileName),
    polish: path.join(bridgeDirectory, phaseDefinitions.polish.stateFileName),
  };
}

function getDefaultOutputPath(phase, storyId) {
  return buildArtifactPaths(storyId)[phase];
}

async function buildContextPaths(
  phase,
  storyId,
  specPath,
  extraContextPathArguments,
) {
  const phaseConfig = phaseDefinitions[phase];
  const specDirectory = path.dirname(specPath);
  const artifactPaths = buildArtifactPaths(storyId);
  const relatedSpecPaths = [
    specPath,
    path.join(specDirectory, "technical-plan.md"),
    path.join(specDirectory, "task-breakdown.md"),
    path.join(specDirectory, "ui-component-spec.md"),
  ];
  const requestedPaths = [
    ...sharedContextPaths.map((value) => path.resolve(repoRoot, value)),
    ...phaseConfig.workflowContextPaths.map((value) => path.resolve(repoRoot, value)),
    ...relatedSpecPaths,
    ...phaseConfig.dependentArtifacts.map((artifactKey) => artifactPaths[artifactKey]),
    ...asArray(extraContextPathArguments).map((value) => path.resolve(repoRoot, value)),
  ];
  const uniquePaths = [];
  const seenPaths = new Set();

  for (const requestedPath of requestedPaths) {
    if (seenPaths.has(requestedPath) || !(await pathExists(requestedPath))) {
      continue;
    }

    seenPaths.add(requestedPath);
    uniquePaths.push(requestedPath);
  }

  return uniquePaths;
}

function renderSkillChain(phaseConfig) {
  return phaseConfig.skills
    .map(([skill, purpose]) => `- ${skill}: ${purpose}`)
    .join("\n");
}

function renderArtifactStatus(phaseConfig, artifactPaths, existingArtifactKeys) {
  if (phaseConfig.dependentArtifacts.length === 0) {
    return "- (none)";
  }

  return phaseConfig.dependentArtifacts
    .map((artifactKey) => {
      const artifactPath = artifactPaths[artifactKey];
      const status = existingArtifactKeys.has(artifactKey) ? "available" : "missing";
      return `- ${artifactKey}: ${relativeToRepo(artifactPath)} (${status})`;
    })
    .join("\n");
}

function buildPhasePrompt({
  phase,
  storyId,
  specPath,
  outputPath,
  contextPaths,
  artifactPaths,
  existingArtifactKeys,
}) {
  const phaseConfig = phaseDefinitions[phase];
  const contextBlock = contextPaths
    .map((value) => `- ${relativeToRepo(value)}`)
    .join("\n");
  const artifactStatusBlock = renderArtifactStatus(
    phaseConfig,
    artifactPaths,
    existingArtifactKeys,
  );
  const lines = [
    `Execute Shipyard's ${phaseConfig.displayName} bridge for story ${storyId}.`,
    "",
    "Before answering, read the listed files and inspect additional files only when they are directly needed to understand the current UI surface.",
    "Required local context:",
    contextBlock,
    "",
    `Primary feature spec: ${relativeToRepo(specPath)}`,
    `Bridge artifact path: ${relativeToRepo(outputPath)}`,
    "",
    "Related bridge artifacts:",
    artifactStatusBlock,
    "",
    "Exact skill contract:",
    `Follow the exact same ${phaseConfig.skillGroupLabel} Codex uses, as mapped in \`.ai/codex.md\` and \`.ai/agents/claude.md\`.`,
    renderSkillChain(phaseConfig),
    "",
    "Phase-specific instructions:",
    ...phaseConfig.instructions.map((instruction) => `- ${instruction}`),
    "",
    "Required final response sections:",
    ...phaseConfig.summarySections.map(
      (section, index) => `${index + 1}. ${section}`,
    ),
    "",
    "Rules:",
    ...phaseConfig.rules.map((rule) => `- ${rule}`),
    "- If a referenced artifact is missing, continue and call out the gap explicitly.",
  ];

  if (phaseConfig.readOnly) {
    lines.push("- Do not write code or patches in this phase.");
  } else {
    lines.push("- Edit repository files directly when the phase requires it.");
    lines.push("- Keep changes narrowly scoped to the current story and phase.");
  }

  return lines.join("\n");
}

function buildClaudeSystemPrompt(phase) {
  const phaseConfig = phaseDefinitions[phase];
  const promptParts = [
    `You are Shipyard's dedicated ${phaseConfig.displayName} delegate.`,
    "You must follow the exact same UI workflow contract and skill chain Codex uses for this phase.",
    "Treat the listed skills as imperative instructions, not optional inspiration.",
    "Prefer existing Shipyard patterns, token names, and workflow files over invention.",
    "When context is incomplete, make a reasonable assumption and label it clearly.",
    "Return Markdown only.",
  ];

  if (phaseConfig.readOnly) {
    promptParts.push("Do not write code or patches in this task.");
  } else {
    promptParts.push("You may edit repository files when the phase requires it.");
    promptParts.push("Keep repository edits surgical and phase-scoped.");
  }

  return promptParts.join(" ");
}

async function runClaude(phase, prompt, model, timeoutMs) {
  const phaseConfig = phaseDefinitions[phase];
  const allowedTools = phaseConfig.readOnly
    ? "Read,Glob,Grep"
    : "Read,Glob,Grep,Edit,Write,Bash";
  const args = [
    "-p",
    "--output-format",
    "text",
    "--permission-mode",
    "dontAsk",
    "--allowedTools",
    allowedTools,
    "--system-prompt",
    buildClaudeSystemPrompt(phase),
  ];

  if (model) {
    args.push("--model", model);
  }

  args.push(prompt);

  const result = await execFile("claude", args, {
    cwd: repoRoot,
    timeout: timeoutMs,
    maxBuffer: maxBufferBytes,
    env: process.env,
  });
  const output = normalizeOutput(result.stdout ?? "");

  if (!output) {
    const detail = result.stderr?.trim() ? ` ${result.stderr.trim()}` : "";
    throw new Error(`Claude returned no bridge summary.${detail}`);
  }

  return output;
}

async function runCodex(phase, prompt, model, timeoutMs, outputPath) {
  const phaseConfig = phaseDefinitions[phase];
  const args = [
    "exec",
    "-C",
    repoRoot,
    "-s",
    phaseConfig.readOnly ? "read-only" : "workspace-write",
    "-o",
    outputPath,
  ];

  if (model) {
    args.push("-m", model);
  }

  args.push(prompt);

  await execFile("codex", args, {
    cwd: repoRoot,
    timeout: timeoutMs,
    maxBuffer: maxBufferBytes,
  });

  const output = normalizeOutput(await readFile(outputPath, "utf8"));

  if (!output) {
    throw new Error("Codex bridge returned no summary.");
  }

  return output;
}

function buildAttemptOrder(phase, provider, fallback, env = process.env) {
  if (provider === "claude") {
    return fallback === "codex" ? ["claude", "codex"] : ["claude"];
  }

  if (provider === "codex") {
    return ["codex"];
  }

  const claudeFirst = isClaudeUiPhaseBridgesEnabled(env);

  if (claudeFirst) {
    return fallback === "codex" ? ["claude", "codex"] : ["claude"];
  }

  return ["codex"];
}

async function generateBridge({
  phase,
  prompt,
  outputPath,
  attemptOrder,
  claudeModel,
  codexModel,
  timeoutMs,
}) {
  const errors = [];

  for (const provider of attemptOrder) {
    try {
      const content =
        provider === "claude"
          ? await runClaude(phase, prompt, claudeModel, timeoutMs)
          : await runCodex(phase, prompt, codexModel, timeoutMs, outputPath);

      return {
        provider,
        content,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${provider}: ${message}`);
    }
  }

  throw new Error(
    `UI phase bridge failed.\n${errors.map((value) => `- ${value}`).join("\n")}`,
  );
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      phase: { type: "string" },
      story: { type: "string", short: "s" },
      spec: { type: "string", short: "p" },
      "context-path": { type: "string", short: "c", multiple: true },
      output: { type: "string", short: "o" },
      provider: { type: "string" },
      fallback: { type: "string" },
      "claude-model": { type: "string" },
      "codex-model": { type: "string" },
      "dry-run": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: false,
  });

  if (values.help) {
    printUsage();
    return;
  }

  const phase = normalizePhase(values.phase);
  const storyId = values.story?.trim();

  if (!storyId) {
    throw new Error("Missing required --story value.");
  }

  const provider = normalizeProvider(
    values.provider ?? "auto",
    "provider",
    new Set(["auto", "claude", "codex"]),
  );
  const fallback = normalizeProvider(
    values.fallback ?? "codex",
    "fallback",
    new Set(["codex", "none"]),
  );
  const specPath = await resolveSpecPath(storyId, values.spec);
  const outputPath = path.resolve(
    repoRoot,
    values.output ? values.output : getDefaultOutputPath(phase, storyId),
  );
  const artifactPaths = buildArtifactPaths(storyId);
  const existingArtifactKeys = new Set();

  for (const [artifactKey, artifactPath] of Object.entries(artifactPaths)) {
    if (await pathExists(artifactPath)) {
      existingArtifactKeys.add(artifactKey);
    }
  }

  const contextPaths = await buildContextPaths(
    phase,
    storyId,
    specPath,
    values["context-path"],
  );
  const prompt = buildPhasePrompt({
    phase,
    storyId,
    specPath,
    outputPath,
    contextPaths,
    artifactPaths,
    existingArtifactKeys,
  });
  const attemptOrder = buildAttemptOrder(phase, provider, fallback);
  const claudeModel = values["claude-model"]?.trim() || defaultClaudeModel;
  const codexModel = values["codex-model"]?.trim() || defaultCodexModel;
  const phaseConfig = phaseDefinitions[phase];

  if (values["dry-run"]) {
    console.log(
      JSON.stringify(
        {
          phase,
          displayName: phaseConfig.displayName,
          provider,
          fallback,
          attemptOrder,
          claudeUiPhaseBridgesFlag: CLAUDE_UI_PHASE_BRIDGES_FLAG,
          claudeUiPhaseBridgesEnabled: isClaudeUiPhaseBridgesEnabled(),
          specPath: relativeToRepo(specPath),
          outputPath: relativeToRepo(outputPath),
          claudeModel,
          codexModel: codexModel || null,
          readOnly: phaseConfig.readOnly,
          dependentArtifacts: phaseConfig.dependentArtifacts.map((artifactKey) => ({
            artifactKey,
            path: relativeToRepo(artifactPaths[artifactKey]),
            exists: existingArtifactKeys.has(artifactKey),
          })),
          skills: phaseConfig.skills.map(([name, purpose]) => ({ name, purpose })),
          contextPaths: contextPaths.map(relativeToRepo),
        },
        null,
        2,
      ),
    );
    return;
  }

  await mkdir(path.dirname(outputPath), { recursive: true });

  const { provider: usedProvider, content } = await generateBridge({
    phase,
    prompt,
    outputPath,
    attemptOrder,
    claudeModel,
    codexModel,
    timeoutMs: defaultTimeoutMs,
  });

  await writeFile(outputPath, `${content.trim()}\n`, "utf8");

  console.log(
    `Wrote ${relativeToRepo(outputPath)} using ${usedProvider}${usedProvider === "codex" && attemptOrder[0] === "claude" ? " fallback" : ""}. ${CLAUDE_UI_PHASE_BRIDGES_FLAG}=${isClaudeUiPhaseBridgesEnabled() ? "1" : "0"}.`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
