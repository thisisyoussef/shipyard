import type { DiscoveryReport } from "../context/discovery.js";

export interface TaskPlan {
  goal: string;
  steps: string[];
}

export interface EditIntent {
  path: string;
  oldString: string;
  newString: string;
  expectedHash?: string;
}

export interface VerificationReport {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  passed: boolean;
  timedOut: boolean;
}

export interface ContextEnvelope {
  targetPath: string;
  discovery: DiscoveryReport;
  recentInstructions: string[];
  availableTools: string[];
  timestamp: string;
}
