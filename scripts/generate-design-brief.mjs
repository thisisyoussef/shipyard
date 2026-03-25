#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";

const execFile = promisify(execFileCallback);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, "..");
const projectMcpConfigPath = path.join(repoRoot, ".mcp.json");
const maxBufferBytes = 10 * 1024 * 1024;
const defaultTimeoutMs = parsePositiveInteger(
  process.env.DESIGN_BRIDGE_TIMEOUT_MS,
  10 * 60 * 1_000,
);
const defaultClaudeModel = process.env.CLAUDE_DESIGN_MODEL?.trim() || "sonnet";
const defaultCodexModel = process.env.CODEX_DESIGN_FALLBACK_MODEL?.trim() || "";
const defaultReferoUrl = process.env.REFERO_MCP_URL?.trim() || "https://api.refero.design/mcp";

const baseContextPaths = [
  "AGENTS.md",
  ".ai/docs/SINGLE_SOURCE_OF_TRUTH.md",
  ".ai/codex.md",
  ".ai/agents/claude.md",
  ".claude/CLAUDE.md",
  ".ai/workflows/design-phase.md",
  ".ai/docs/design/DESIGN_PHILOSOPHY_AND_LANGUAGE.md",
  ".ai/skills/frontend-design.md",
  ".ai/templates/spec/UI_PROMPT_BRIEF_TEMPLATE.md",
  "shipyard/ui/README.md",
  "shipyard/ui/src/README.md",
  "shipyard/ui/src/primitives.tsx",
  "shipyard/ui/src/tokens/index.css",
];

const designSkillChain = [
  {
    step: "Understand",
    skills: [
      ["extract", "catalog reusable patterns, components, and tokens"],
      ["normalize", "identify design drift and consistency gaps"],
    ],
  },
  {
    step: "Define",
    skills: [
      ["frontend-design", "set the visual direction and avoid generic output"],
      ["interface-design", "apply tool and dashboard interaction patterns"],
      ["emil-design-eng", "surface taste, unseen details, and motion judgment"],
      ["baseline-ui", "keep the direction inside the baseline component standards"],
    ],
  },
  {
    step: "Compose",
    skills: [
      ["clarify", "define user-facing copy, labels, and empty or error states"],
      ["distill", "remove non-essential structure and reduce noise"],
      ["typeset", "assign explicit type scale, weights, and spacing"],
      ["colorize", "apply semantic color decisions and new tones only when needed"],
      ["arrange", "define grid, spacing, rhythm, and hierarchy"],
      ["adapt", "define responsive behavior across the required breakpoints"],
    ],
  },
  {
    step: "Animate",
    skills: [
      ["animate", "define entry motion, transitions, and micro-interactions"],
      ["delight", "add 1-2 small moments of personality when warranted"],
      ["quieter", "tone down motion if it becomes too loud for Shipyard"],
    ],
  },
  {
    step: "Harden",
    skills: [
      ["harden", "cover overflow, missing data, error, and resilience cases"],
      ["onboard", "improve first-run and empty states"],
    ],
  },
  {
    step: "Review",
    skills: [
      ["critique", "score the design across the required quality dimensions"],
      ["normalize", "confirm the brief still matches the system and token names"],
    ],
  },
];

function formatDesignSkillChain() {
  return designSkillChain
    .map(({ step, skills }) => [
      `- ${step}:`,
      ...skills.map(([skill, purpose]) => `  - ${skill} - ${purpose}`),
    ].join("\n"))
    .join("\n");
}

const claudeSystemPrompt = [
  "You are Shipyard's dedicated design-phase delegate.",
  "Your job is to create implementation-ready UI design briefs for visible UI stories.",
  "You are not writing code or patches in this task.",
  "You must follow the exact same design-phase skill chain Codex uses for this phase.",
  "Treat those skills as imperative instructions, not optional inspiration.",
  "Inspect the requested local files, synthesize the strongest design direction that still fits the repo, and return only Markdown.",
  "When Refero MCP is available, use it for design research before you draft the brief.",
  "Study shipped product references first, then decide what Shipyard should borrow, adapt, or avoid.",
  "Prefer existing Shipyard patterns and token names when available.",
  "Avoid generic AI-safe design language, vague taste words, and filler prose.",
  "When context is incomplete, make a reasonable assumption and label it.",
].join(" ");

function parsePositiveInteger(value, fallback) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function printUsage() {
  const lines = [
    "Usage:",
    "  node scripts/generate-design-brief.mjs --story <story-id> [options]",
    "",
    "Options:",
    "  --story, -s         Story id used for output path and spec auto-discovery",
    "  --spec, -p          Path to the story's feature spec (auto-discovered when omitted)",
    "  --context-path, -c  Extra file or directory to mention in the prompt (repeatable)",
    "  --output, -o        Output path for the generated brief",
    "  --provider          auto (default), claude, or codex",
    "  --fallback          codex (default) or none",
    "  --skip-refero       Disable Refero-backed design research for this run",
    "  --claude-model      Claude model alias to use (default: env CLAUDE_DESIGN_MODEL or sonnet)",
    "  --codex-model       Codex fallback model alias (default: env CODEX_DESIGN_FALLBACK_MODEL)",
    "  --dry-run           Print resolved inputs without calling Claude or Codex",
    "  --help, -h          Show this help",
    "",
    "Examples:",
    "  node scripts/generate-design-brief.mjs --story uiv3-s01",
    "  node scripts/generate-design-brief.mjs --story uiv3-s09 --spec shipyard/docs/specs/phase-ui-v3/uiv3-s09/feature-spec.md",
    "  node scripts/generate-design-brief.mjs --story uiv3-s09 --context-path shipyard/ui/src/panels/ComposerPanel.tsx",
  ];

  console.log(lines.join("\n"));
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

function normalizeBriefOutput(value) {
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

async function buildContextPaths(specPath, extraContextPathArguments) {
  const specDirectory = path.dirname(specPath);
  const relatedSpecPaths = [
    specPath,
    path.join(specDirectory, "technical-plan.md"),
    path.join(specDirectory, "task-breakdown.md"),
    path.join(specDirectory, "ui-component-spec.md"),
  ];
  const requestedPaths = [
    ...baseContextPaths.map((value) => path.resolve(repoRoot, value)),
    ...relatedSpecPaths,
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

async function loadProjectMcpConfig() {
  if (!(await pathExists(projectMcpConfigPath))) {
    return null;
  }

  try {
    const contents = await readFile(projectMcpConfigPath, "utf8");
    return JSON.parse(contents);
  } catch {
    return null;
  }
}

async function createReferoMcpConfig() {
  const referoToken = process.env.REFERO_MCP_TOKEN?.trim();

  if (!referoToken) {
    return {
      configPaths: [],
      referoEnabled: false,
      referoSource: "none",
      cleanup: async () => {},
    };
  }

  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "shipyard-refero-mcp-"),
  );
  const temporaryConfigPath = path.join(temporaryDirectory, "refero.mcp.json");
  const config = {
    mcpServers: {
      refero: {
        type: "http",
        url: defaultReferoUrl,
        headers: {
          Authorization: `Bearer ${referoToken}`,
        },
      },
    },
  };

  await writeFile(temporaryConfigPath, JSON.stringify(config, null, 2), "utf8");

  return {
    configPaths: [temporaryConfigPath],
    referoEnabled: true,
    referoSource: "env-token",
    cleanup: async () => {
      await rm(temporaryDirectory, { recursive: true, force: true });
    },
  };
}

async function resolveClaudeMcpConfig(skipRefero) {
  if (skipRefero) {
    return {
      configPaths: [],
      referoEnabled: false,
      referoSource: "disabled",
      cleanup: async () => {},
    };
  }

  const projectConfig = await loadProjectMcpConfig();
  const hasProjectRefero = Boolean(projectConfig?.mcpServers?.refero);

  if (hasProjectRefero) {
    return {
      configPaths: [projectMcpConfigPath],
      referoEnabled: true,
      referoSource: "project-mcp",
      cleanup: async () => {},
    };
  }

  const envConfig = await createReferoMcpConfig();

  if (envConfig.referoEnabled) {
    return envConfig;
  }

  return {
    configPaths: [],
    referoEnabled: true,
    referoSource: "auto-detect",
    cleanup: async () => {},
  };
}

function buildDesignPrompt({
  storyId,
  specPath,
  outputPath,
  contextPaths,
  referoEnabled,
}) {
  const contextBlock = contextPaths.map((value) => `- ${relativeToRepo(value)}`).join("\n");
  const referoInstructions = referoEnabled
    ? [
        "Refero MCP should be used for this run when it is available in the Claude session.",
        "Before you draft the design, use Refero to study 3-6 highly relevant screens and 1-2 matching flows.",
        "Prefer the closest matches by product type, user task, and UI state.",
        "Extract concrete layout, hierarchy, copy, state-handling, and motion lessons from those references.",
        "Include product names, page or flow types, and reference handles or URLs when Refero provides them.",
        "If Refero is unexpectedly unavailable at runtime, note that clearly in assumptions rather than inventing reference research.",
      ].join(" ")
    : [
        "Refero MCP is not available for this run.",
        "Use only the local repo context and clearly note the missing external reference research in assumptions.",
      ].join(" ");

  return [
    `Generate the Shipyard design-phase brief for story ${storyId}.`,
    "",
    "Before answering, read the listed files and inspect additional files only when they are directly needed to understand the current UI surface.",
    "Required local context:",
    contextBlock,
    "",
    `Primary feature spec: ${relativeToRepo(specPath)}`,
    `Target brief path: ${relativeToRepo(outputPath)}`,
    "",
    "The output must satisfy the contract in `.ai/workflows/design-phase.md` and be concrete enough that a Codex implementer can build from it without inventing major visual decisions.",
    "Follow the exact same design-phase skill chain Codex uses, as mapped in `.ai/codex.md` and `.ai/agents/claude.md`.",
    "Treat these skills as imperative, and apply them in the same step order and for the same purposes:",
    formatDesignSkillChain(),
    referoInstructions,
    "",
    "Required sections:",
    "1. Title and metadata",
    "2. Reference research",
    "3. Visual direction and mood",
    "4. Component inventory",
    "5. Token selections",
    "6. Layout decisions",
    "7. Typography decisions",
    "8. Color decisions",
    "9. Motion plan",
    "10. Copy direction",
    "11. Accessibility requirements",
    "12. Anti-patterns to avoid",
    "13. Responsive behavior",
    "14. Critique scores (1-10) with brief rationale",
    "15. Assumptions and open questions",
    "",
    "Rules:",
    "- Return Markdown only. No outer code fences.",
    "- Do not write code, diffs, or implementation steps.",
    "- Keep the brief scoped to the story. Narrow story, narrow brief.",
    "- Tie decisions back to existing Shipyard tokens, components, and design philosophy whenever possible.",
    "- The Reference research section must include what to borrow and what to avoid from each reference.",
    "- If an expected file does not exist, continue and note the gap in assumptions.",
    "- Avoid generic design filler like 'make it clean' or 'modern'. Be explicit and operational.",
  ].join("\n");
}

async function runClaude(prompt, model, timeoutMs, mcpConfig) {
  const args = [
    "-p",
    "--output-format",
    "text",
    "--permission-mode",
    "dontAsk",
    "--allowedTools",
    mcpConfig.referoEnabled
      ? "Read,Glob,Grep,MCPSearch,mcp__refero__*"
      : "Read,Glob,Grep",
    "--system-prompt",
    claudeSystemPrompt,
  ];

  for (const configPath of mcpConfig.configPaths) {
    args.push("--mcp-config", configPath);
  }

  if (model) {
    args.push("--model", model);
  }

  args.push(prompt);

  const result = await execFile("claude", args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      ENABLE_TOOL_SEARCH: mcpConfig.referoEnabled
        ? process.env.ENABLE_TOOL_SEARCH ?? "true"
        : process.env.ENABLE_TOOL_SEARCH,
      MAX_MCP_OUTPUT_TOKENS: mcpConfig.referoEnabled
        ? process.env.MAX_MCP_OUTPUT_TOKENS ?? "50000"
        : process.env.MAX_MCP_OUTPUT_TOKENS,
    },
    timeout: timeoutMs,
    maxBuffer: maxBufferBytes,
  });
  const output = normalizeBriefOutput(result.stdout ?? "");

  if (!output) {
    const detail = result.stderr?.trim() ? ` ${result.stderr.trim()}` : "";
    throw new Error(`Claude returned no design brief.${detail}`);
  }

  return output;
}

async function runCodex(prompt, model, timeoutMs) {
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "shipyard-design-bridge-"),
  );
  const outputPath = path.join(temporaryDirectory, "brief.md");

  try {
    const args = [
      "exec",
      "-C",
      repoRoot,
      "-s",
      "read-only",
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

    const output = normalizeBriefOutput(await readFile(outputPath, "utf8"));

    if (!output) {
      throw new Error("Codex fallback returned no design brief.");
    }

    return output;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function buildAttemptOrder(provider, fallback) {
  if (provider === "claude") {
    return fallback === "codex" ? ["claude", "codex"] : ["claude"];
  }

  if (provider === "codex") {
    return ["codex"];
  }

  return fallback === "codex" ? ["claude", "codex"] : ["claude"];
}

async function generateBrief(
  attemptOrder,
  prompt,
  claudeModel,
  codexModel,
  timeoutMs,
  mcpConfig,
) {
  const errors = [];

  for (const provider of attemptOrder) {
    try {
      const content = provider === "claude"
        ? await runClaude(prompt, claudeModel, timeoutMs, mcpConfig)
        : await runCodex(prompt, codexModel, timeoutMs);

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
    `Design bridge failed.\n${errors.map((value) => `- ${value}`).join("\n")}`,
  );
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      story: { type: "string", short: "s" },
      spec: { type: "string", short: "p" },
      "context-path": { type: "string", short: "c", multiple: true },
      output: { type: "string", short: "o" },
      provider: { type: "string" },
      fallback: { type: "string" },
      "skip-refero": { type: "boolean" },
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
    values.output
      ? values.output
      : path.join(".ai", "state", "design-brief", storyId, "brief.md"),
  );
  const contextPaths = await buildContextPaths(specPath, values["context-path"]);
  const mcpConfig = await resolveClaudeMcpConfig(Boolean(values["skip-refero"]));
  const prompt = buildDesignPrompt({
    storyId,
    specPath,
    outputPath,
    contextPaths,
    referoEnabled: mcpConfig.referoEnabled,
  });
  const attemptOrder = buildAttemptOrder(provider, fallback);
  const claudeModel = values["claude-model"]?.trim() || defaultClaudeModel;
  const codexModel = values["codex-model"]?.trim() || defaultCodexModel;

  try {
    if (values["dry-run"]) {
      console.log(
        JSON.stringify(
          {
            storyId,
            provider,
            fallback,
            attemptOrder,
            specPath: relativeToRepo(specPath),
            outputPath: relativeToRepo(outputPath),
            claudeModel,
            codexModel: codexModel || null,
            designSkillChain,
            contextPaths: contextPaths.map(relativeToRepo),
            referoEnabled: mcpConfig.referoEnabled,
            referoSource: mcpConfig.referoSource,
            mcpConfigPaths: mcpConfig.configPaths.map(relativeToRepo),
          },
          null,
          2,
        ),
      );
      return;
    }

    const { provider: usedProvider, content } = await generateBrief(
      attemptOrder,
      prompt,
      claudeModel,
      codexModel,
      defaultTimeoutMs,
      mcpConfig,
    );

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${content.trim()}\n`, "utf8");

    console.log(
      `Wrote ${relativeToRepo(outputPath)} using ${usedProvider}${usedProvider === "codex" && attemptOrder[0] === "claude" ? " fallback" : ""}. Refero: ${mcpConfig.referoEnabled ? mcpConfig.referoSource : "disabled"}.`,
    );
  } finally {
    await mcpConfig.cleanup();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
