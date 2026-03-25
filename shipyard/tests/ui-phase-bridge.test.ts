import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFile = promisify(execFileCallback);
const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testsDirectory, "..", "..");
const designBridgePath = path.join(repoRoot, "scripts", "generate-design-brief.mjs");
const uiPhaseBridgePath = path.join(repoRoot, "scripts", "run-ui-phase-bridge.mjs");
const storyId = "uiv2-s01";
const specPath =
  "shipyard/docs/specs/phase-ui-v2/uiv2-s01-design-system-foundation/feature-spec.md";

interface BridgeSkill {
  name: string;
  purpose: string;
}

interface DesignSkillStep {
  step: string;
  skills: [string, string][];
}

interface BridgeDryRunResult {
  attemptOrder: string[];
  readOnly?: boolean;
  outputPath?: string;
  skills?: BridgeSkill[];
  contextPaths?: string[];
  designSkillChain?: DesignSkillStep[];
}

async function runBridgeJson(
  scriptPath: string,
  args: string[],
  extraEnv: NodeJS.ProcessEnv = {},
): Promise<BridgeDryRunResult> {
  const result = await execFile("node", [scriptPath, ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...extraEnv,
    },
    maxBuffer: 10 * 1024 * 1024,
  });

  return JSON.parse(result.stdout);
}

describe("UI phase bridge scripts", () => {
  it("defaults later UI phase bridges to Codex when the Claude flag is disabled", async () => {
    const result = await runBridgeJson(uiPhaseBridgePath, [
      "--phase",
      "ui",
      "--story",
      storyId,
      "--spec",
      specPath,
      "--dry-run",
    ]);

    expect(result.attemptOrder).toEqual(["codex"]);
    expect(result.readOnly).toBe(false);
    expect(result.outputPath).toBe(".ai/state/ui-phase-bridge/uiv2-s01/ui-summary.md");
    expect(result.skills?.map((skill: BridgeSkill) => skill.name)).toEqual([
      "typeset",
      "colorize",
      "arrange",
      "animate",
      "bolder",
    ]);
  });

  it("switches scripted later UI phase bridges to Claude first when the flag is enabled", async () => {
    const result = await runBridgeJson(
      uiPhaseBridgePath,
      [
        "--phase",
        "qa",
        "--story",
        storyId,
        "--spec",
        specPath,
        "--dry-run",
      ],
      {
        SHIPYARD_ENABLE_CLAUDE_UI_PHASE_BRIDGES: "1",
      },
    );

    expect(result.attemptOrder).toEqual(["claude", "codex"]);
    expect(result.readOnly).toBe(false);
    expect(result.skills?.map((skill: BridgeSkill) => skill.name)).toEqual([
      "critique",
      "audit",
      "fixing-accessibility",
      "fixing-motion-performance",
    ]);
  });

  it("expands the design bridge with Claude workflow context and the imperative skill chain", async () => {
    const result = await runBridgeJson(designBridgePath, [
      "--story",
      storyId,
      "--spec",
      specPath,
      "--dry-run",
    ]);

    expect(result.contextPaths).toContain(".ai/agents/claude.md");
    expect(result.contextPaths).toContain(".claude/CLAUDE.md");
    expect(result.designSkillChain?.[0]?.step).toBe("Understand");
    expect(result.designSkillChain?.[0]?.skills[0]?.[0]).toBe("extract");
    expect(result.designSkillChain?.at(-1)?.skills[0]?.[0]).toBe("critique");
  });
});
