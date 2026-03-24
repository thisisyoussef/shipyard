import type { RawLoopLogger } from "./raw-loop.js";

const TOOL_CALL_PATTERN = /\btool_call ([a-z0-9_]+)/i;

export interface TranscriptCollector {
  lines: string[];
  logger: RawLoopLogger;
}

export interface SurgicalEditVerification {
  oldBlockMatches: number;
  newBlockMatches: number;
  oldBlockStart: number;
  newBlockStart: number;
  prefixUnchanged: boolean;
  suffixUnchanged: boolean;
  changedOnlyTarget: boolean;
}

function countBufferMatches(buffer: Buffer, target: Buffer): number {
  if (target.length === 0) {
    return 0;
  }

  let count = 0;
  let cursor = 0;

  while (cursor <= buffer.length - target.length) {
    const index = buffer.indexOf(target, cursor);

    if (index === -1) {
      break;
    }

    count += 1;
    cursor = index + target.length;
  }

  return count;
}

export function createTranscriptCollector(): TranscriptCollector {
  const lines: string[] = [];

  return {
    lines,
    logger: {
      log(message) {
        lines.push(message);
      },
    },
  };
}

export function extractToolCallsFromTranscript(lines: string[]): string[] {
  return lines
    .map((line) => line.match(TOOL_CALL_PATTERN)?.[1] ?? null)
    .filter((toolName): toolName is string => Boolean(toolName));
}

export function verifySurgicalEdit(
  beforeContents: string,
  afterContents: string,
  oldBlock: string,
  newBlock: string,
): SurgicalEditVerification {
  const beforeBuffer = Buffer.from(beforeContents, "utf8");
  const afterBuffer = Buffer.from(afterContents, "utf8");
  const oldBlockBuffer = Buffer.from(oldBlock, "utf8");
  const newBlockBuffer = Buffer.from(newBlock, "utf8");
  const oldBlockStart = beforeBuffer.indexOf(oldBlockBuffer);
  const newBlockStart = afterBuffer.indexOf(newBlockBuffer);
  const oldBlockMatches = countBufferMatches(beforeBuffer, oldBlockBuffer);
  const newBlockMatches = countBufferMatches(afterBuffer, newBlockBuffer);

  if (oldBlockStart === -1 || newBlockStart === -1) {
    return {
      oldBlockMatches,
      newBlockMatches,
      oldBlockStart,
      newBlockStart,
      prefixUnchanged: false,
      suffixUnchanged: false,
      changedOnlyTarget: false,
    };
  }

  const beforePrefix = beforeBuffer.subarray(0, oldBlockStart);
  const afterPrefix = afterBuffer.subarray(0, newBlockStart);
  const beforeSuffix = beforeBuffer.subarray(oldBlockStart + oldBlockBuffer.length);
  const afterSuffix = afterBuffer.subarray(newBlockStart + newBlockBuffer.length);
  const prefixUnchanged = beforePrefix.equals(afterPrefix);
  const suffixUnchanged = beforeSuffix.equals(afterSuffix);

  return {
    oldBlockMatches,
    newBlockMatches,
    oldBlockStart,
    newBlockStart,
    prefixUnchanged,
    suffixUnchanged,
    changedOnlyTarget:
      oldBlockMatches === 1 &&
      newBlockMatches === 1 &&
      prefixUnchanged &&
      suffixUnchanged,
  };
}
