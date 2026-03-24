import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { getTraceDirectory } from "../engine/state.js";

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
  targetDirectory: string,
  sessionId: string,
): Promise<LocalTraceLogger> {
  const traceDirectory = getTraceDirectory(targetDirectory);
  const filePath = path.join(traceDirectory, `${sessionId}.jsonl`);

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
