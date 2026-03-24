import type { ContextEnvelope } from "../artifacts/types.js";
import type { DiscoveryReport } from "../context/discovery.js";

export interface ShipyardSessionState {
  targetPath: string;
  startedAt: string;
  instructions: string[];
  discovery: DiscoveryReport;
  contextEnvelope: ContextEnvelope;
  toolNames: string[];
}

export interface SessionSnapshot {
  targetPath: string;
  startedAt: string;
  discoverySummary: string;
  instructionCount: number;
  toolNames: string[];
}

export function createSessionState(
  targetPath: string,
  discovery: DiscoveryReport,
  contextEnvelope: ContextEnvelope,
  toolNames: string[],
): ShipyardSessionState {
  return {
    targetPath,
    startedAt: new Date().toISOString(),
    instructions: [],
    discovery,
    contextEnvelope,
    toolNames,
  };
}

export function createSessionSnapshot(
  state: ShipyardSessionState,
): SessionSnapshot {
  return {
    targetPath: state.targetPath,
    startedAt: state.startedAt,
    discoverySummary: state.discovery.summary,
    instructionCount: state.instructions.length,
    toolNames: [...state.toolNames],
  };
}
