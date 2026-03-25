import readline from "node:readline";

import { saveSessionState, switchTarget, type SessionState } from "./state.js";
import type { InstructionRuntimeState } from "./turn.js";
import {
  hasAutomaticTargetEnrichmentCapability,
  planAutomaticEnrichment,
} from "./target-enrichment.js";
import {
  createTargetTool,
  enrichTargetTool,
  SCAFFOLD_TYPES,
  type ScaffoldType,
} from "../tools/target-manager/index.js";
import { listTargetsTool } from "../tools/target-manager/list-targets.js";

export interface HandleTargetCommandOptions {
  rl: readline.Interface;
  state: SessionState;
  runtimeState: InstructionRuntimeState;
  writeLine?: (line: string) => void;
}

export interface HandleTargetCommandResult {
  nextState?: SessionState;
}

interface TargetEnrichmentExecutionOptions {
  trigger: "automatic" | "manual";
  userDescription?: string;
}

function writeLine(
  options: HandleTargetCommandOptions,
  line: string,
): void {
  (options.writeLine ?? console.log)(line);
}

function prompt(
  rl: readline.Interface,
  question: string,
): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

function formatProfileSummary(state: SessionState): string {
  if (!state.targetProfile) {
    return "Profile: not enriched yet";
  }

  return `Profile: ${state.targetProfile.description}`;
}

function hasSelectedCodeTarget(state: SessionState): boolean {
  return state.activePhase === "code";
}

function parseScaffoldType(input: string): ScaffoldType {
  const normalized = input.trim();
  return SCAFFOLD_TYPES.includes(normalized as ScaffoldType)
    ? normalized as ScaffoldType
    : "empty";
}

function formatTargetList(
  targets: Awaited<ReturnType<typeof listTargetsTool>>,
  currentTargetDirectory: string,
): string[] {
  return targets.map((target, index) => {
    const isCurrent = target.path === currentTargetDirectory;
    return `${isCurrent ? "*" : " "} ${String(index + 1)}. ${target.name} (${target.discoverySummary})${target.hasProfile ? " [enriched]" : ""}`;
  });
}

async function handleTargetStatus(
  options: HandleTargetCommandOptions,
): Promise<void> {
  writeLine(options, `Active phase: ${options.state.activePhase}`);
  writeLine(options, `Targets directory: ${options.state.targetsDirectory}`);

  if (!hasSelectedCodeTarget(options.state)) {
    writeLine(options, "Target: none selected yet");
    writeLine(
      options,
      "Discovery: target manager mode is active. Select or create a target to begin code work.",
    );
    return;
  }

  writeLine(options, `Target: ${options.state.targetDirectory}`);
  writeLine(
    options,
    `Discovery: ${options.state.discovery.projectName ?? "unknown project"}`,
  );
  writeLine(options, formatProfileSummary(options.state));
}

async function handleTargetSwitch(
  options: HandleTargetCommandOptions,
): Promise<HandleTargetCommandResult> {
  const targets = await listTargetsTool({
    targetsDir: options.state.targetsDirectory,
  });

  if (targets.length === 0) {
    writeLine(options, "No targets are available yet. Use `target create` first.");
    return {};
  }

  for (const line of formatTargetList(targets, options.state.targetDirectory)) {
    writeLine(options, line);
  }

  const answer = await prompt(options.rl, "Select target number: ");
  const selection = Number.parseInt(answer, 10);

  if (
    Number.isNaN(selection) ||
    selection < 1 ||
    selection > targets.length
  ) {
    writeLine(options, "Target switch cancelled.");
    return {};
  }

  const selectedTarget = targets[selection - 1];

  if (!selectedTarget) {
    writeLine(options, "Target switch cancelled.");
    return {};
  }

  if (
    options.state.activePhase === "code" &&
    selectedTarget.path === options.state.targetDirectory
  ) {
    writeLine(options, `Already on target ${selectedTarget.name}.`);
    return {};
  }

  const nextState = await switchTarget(options.state, selectedTarget.path);
  writeLine(options, `Switched to ${selectedTarget.name}.`);
  await maybeAutoEnrichTarget(options, nextState);
  return {
    nextState,
  };
}

async function handleTargetCreate(
  options: HandleTargetCommandOptions,
): Promise<HandleTargetCommandResult> {
  const name = await prompt(options.rl, "Target name: ");

  if (!name) {
    writeLine(options, "Target creation cancelled.");
    return {};
  }

  const description = await prompt(options.rl, "Description: ");

  if (!description) {
    writeLine(options, "Target creation cancelled.");
    return {};
  }

  const scaffoldInput = await prompt(
    options.rl,
    `Scaffold type [${SCAFFOLD_TYPES.join(", ")}] (default: empty): `,
  );
  const scaffoldType = parseScaffoldType(scaffoldInput);
  const createdTarget = await createTargetTool({
    name,
    description,
    targetsDir: options.state.targetsDirectory,
    scaffoldType,
  });
  const nextState = await switchTarget(options.state, createdTarget.path);
  writeLine(options, `Created and selected ${name}.`);
  await maybeAutoEnrichTarget(options, nextState, {
    creationDescription: description,
  });
  return {
    nextState,
  };
}

async function runTargetEnrichment(
  options: HandleTargetCommandOptions,
  state: SessionState,
  execution: TargetEnrichmentExecutionOptions,
): Promise<void> {
  writeLine(
    options,
    execution.trigger === "automatic"
      ? "Starting automatic target enrichment."
      : "Starting manual target enrichment.",
  );

  const targetProfile = await enrichTargetTool(
    {
      targetPath: state.targetDirectory,
      userDescription: execution.userDescription,
    },
    {
      invokeModel: options.runtimeState.targetEnrichmentInvoker,
      onProgress(event) {
        writeLine(options, event.message);
      },
    },
  );
  state.targetProfile = targetProfile;
  await saveSessionState(state);
  writeLine(options, `Enriched target: ${targetProfile.description}`);
}

export async function maybeAutoEnrichTarget(
  options: HandleTargetCommandOptions,
  state: SessionState,
  context: {
    creationDescription?: string;
  } = {},
): Promise<void> {
  if (!hasSelectedCodeTarget(state)) {
    return;
  }

  if (
    !hasAutomaticTargetEnrichmentCapability(
      options.runtimeState.targetEnrichmentInvoker,
    )
  ) {
    return;
  }

  const plan = planAutomaticEnrichment({
    discovery: state.discovery,
    targetProfile: state.targetProfile,
    creationDescription: context.creationDescription,
  });

  if (plan.kind === "skip-existing-profile") {
    return;
  }

  if (plan.kind === "needs-description") {
    const userDescription = await prompt(
      options.rl,
      "Describe this greenfield target: ",
    );

    if (!userDescription) {
      writeLine(options, plan.message);
      return;
    }

    await runTargetEnrichment(options, state, {
      trigger: "automatic",
      userDescription,
    });
    return;
  }

  await runTargetEnrichment(options, state, {
    trigger: "automatic",
    userDescription: plan.userDescription,
  });
}

async function handleTargetEnrich(
  options: HandleTargetCommandOptions,
): Promise<void> {
  if (!hasSelectedCodeTarget(options.state)) {
    writeLine(options, "Select or create a target before running enrichment.");
    return;
  }

  let userDescription: string | undefined;

  if (
    options.state.discovery.isGreenfield &&
    options.state.discovery.topLevelFiles.length === 0 &&
    options.state.discovery.topLevelDirectories.length === 0
  ) {
    userDescription = await prompt(
      options.rl,
      "Describe this greenfield target: ",
    );
  }

  await runTargetEnrichment(options, options.state, {
    trigger: "manual",
    userDescription,
  });
}

async function handleTargetProfile(
  options: HandleTargetCommandOptions,
): Promise<void> {
  if (!hasSelectedCodeTarget(options.state)) {
    writeLine(options, "No code target is selected yet.");
    return;
  }

  if (!options.state.targetProfile) {
    writeLine(options, "No target profile is available yet.");
    return;
  }

  writeLine(options, JSON.stringify(options.state.targetProfile, null, 2));
}

export async function handleTargetCommand(
  subcommand: string,
  options: HandleTargetCommandOptions,
): Promise<HandleTargetCommandResult> {
  const normalizedSubcommand = subcommand.trim();

  switch (normalizedSubcommand) {
    case "":
      await handleTargetStatus(options);
      return {};
    case "switch":
      return handleTargetSwitch(options);
    case "create":
      return handleTargetCreate(options);
    case "enrich":
      await handleTargetEnrich(options);
      return {};
    case "profile":
      await handleTargetProfile(options);
      return {};
    default:
      writeLine(
        options,
        "Unknown target subcommand. Use: target, target switch, target create, target enrich, or target profile.",
      );
      return {};
  }
}
