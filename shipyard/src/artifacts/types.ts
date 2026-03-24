export interface TaskPlan {
  instruction: string;
  goal: string;
  targetFilePaths: string[];
  plannedSteps: string[];
}

export interface ContextFinding {
  filePath: string;
  excerpt: string;
  relevanceNote: string;
}

export interface ContextReport {
  query: string;
  findings: ContextFinding[];
}

export interface EditIntent {
  filePath: string;
  oldString: string;
  newString: string;
  reason: string;
}

export interface VerificationReport {
  command: string;
  exitCode: number | null;
  passed: boolean;
  stdout: string;
  stderr: string;
  summary: string;
}

export interface DiscoveryReport {
  isGreenfield: boolean;
  language: string | null;
  framework: string | null;
  packageManager: string | null;
  scripts: Record<string, string>;
  hasReadme: boolean;
  hasAgentsMd: boolean;
  topLevelFiles: string[];
  topLevelDirectories: string[];
  projectName: string | null;
}
