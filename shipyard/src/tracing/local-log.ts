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

function isMissingPathError(
  error: unknown,
): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "ENOENT"
  );
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

      try {
        await mkdir(traceDirectory, { recursive: true });
        await appendFile(filePath, `${JSON.stringify(traceEvent)}\n`, "utf8");
      } catch (error) {
        if (!isMissingPathError(error)) {
          throw error;
        }
      }
    },
  };
}
