import "../../tools/target-manager/index.js";
import {
  getAnthropicTools,
  getTools,
  type AnthropicToolDefinition,
  type ToolDefinition,
} from "../../tools/registry.js";
import type { Phase } from "../phase.js";
import { TARGET_MANAGER_SYSTEM_PROMPT } from "./prompts.js";

export const TARGET_MANAGER_TOOL_NAMES = [
  "list_targets",
  "select_target",
  "create_target",
  "enrich_target",
];

export const targetManagerPhase: Phase = {
  name: "target-manager",
  description: "Guides target selection, creation, and enrichment before code work begins.",
  systemPrompt: TARGET_MANAGER_SYSTEM_PROMPT,
  tools: TARGET_MANAGER_TOOL_NAMES,
  approvalRequired: false,
  inputArtifact: "user_intent",
  outputArtifact: "target_selection",
};

export function createTargetManagerPhase(): Phase {
  return targetManagerPhase;
}

export function getTargetManagerToolDefinitions(): ToolDefinition[] {
  return getTools(TARGET_MANAGER_TOOL_NAMES);
}

export function getTargetManagerAnthropicTools(): AnthropicToolDefinition[] {
  return getAnthropicTools(TARGET_MANAGER_TOOL_NAMES);
}
