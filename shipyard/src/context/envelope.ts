import type { ContextEnvelope } from "../artifacts/types.js";
import type { DiscoveryReport } from "./discovery.js";

export interface CreateContextEnvelopeOptions {
  targetPath: string;
  discovery: DiscoveryReport;
  recentInstructions: string[];
  availableTools: string[];
}

export function createContextEnvelope(
  options: CreateContextEnvelopeOptions,
): ContextEnvelope {
  return {
    targetPath: options.targetPath,
    discovery: options.discovery,
    recentInstructions: options.recentInstructions,
    availableTools: options.availableTools,
    timestamp: new Date().toISOString(),
  };
}
