import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

export interface TraceEvent {
  timestamp: string;
  event: string;
  payload: unknown;
}

export interface LocalTraceLogger {
  log: (event: string, payload: unknown) => Promise<void>;
  filePath: string;
}

export async function createLocalTraceLogger(
  workspaceRoot: string,
): Promise<LocalTraceLogger> {
  const traceDirectory = path.join(workspaceRoot, ".shipyard", "traces");
  const filePath = path.join(traceDirectory, "session.jsonl");

  await mkdir(traceDirectory, { recursive: true });

  return {
    filePath,
    async log(event: string, payload: unknown): Promise<void> {
      const traceEvent: TraceEvent = {
        timestamp: new Date().toISOString(),
        event,
        payload,
      };

      await appendFile(filePath, `${JSON.stringify(traceEvent)}\n`, "utf8");
    },
  };
}
