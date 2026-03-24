import { copyFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";

import { getCheckpointDirectory } from "../engine/state.js";
import {
  normalizeTargetRelativePath,
  resolveWithinTarget,
} from "../tools/file-state.js";

const CHECKPOINT_EXTENSION = ".checkpoint";

function createSortableTimestampPrefix(date: Date): string {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  const milliseconds = String(date.getUTCMilliseconds()).padStart(3, "0");

  return `${year}${month}${day}T${hours}${minutes}${seconds}${milliseconds}Z`;
}

function encodeRelativePath(relativePath: string): string {
  return Buffer.from(relativePath, "utf8").toString("base64url");
}

function createCheckpointFilename(
  relativePath: string,
  timestampPrefix: string,
  sequence: number,
): string {
  const sequenceLabel = String(sequence).padStart(4, "0");
  const encodedPath = encodeRelativePath(relativePath);
  return `${timestampPrefix}-${sequenceLabel}--${encodedPath}${CHECKPOINT_EXTENSION}`;
}

export interface CheckpointManagerLike {
  checkpoint: (relativePath: string) => Promise<string>;
  revert: (relativePath: string) => Promise<boolean>;
}

export class CheckpointManager implements CheckpointManagerLike {
  private lastTimestampPrefix: string | null = null;
  private sequenceForTimestamp = 0;

  constructor(
    private readonly targetDirectory: string,
    private readonly sessionId: string,
  ) {}

  get sessionCheckpointDirectory(): string {
    return path.join(
      getCheckpointDirectory(this.targetDirectory),
      this.sessionId,
    );
  }

  private nextCheckpointFilename(relativePath: string): string {
    const timestampPrefix = createSortableTimestampPrefix(new Date());

    if (timestampPrefix === this.lastTimestampPrefix) {
      this.sequenceForTimestamp += 1;
    } else {
      this.lastTimestampPrefix = timestampPrefix;
      this.sequenceForTimestamp = 0;
    }

    return createCheckpointFilename(
      relativePath,
      timestampPrefix,
      this.sequenceForTimestamp,
    );
  }

  async checkpoint(relativePath: string): Promise<string> {
    const canonicalPath = normalizeTargetRelativePath(relativePath);
    const { absolutePath } = resolveWithinTarget(
      this.targetDirectory,
      canonicalPath,
    );
    const checkpointDirectory = this.sessionCheckpointDirectory;
    const checkpointPath = path.join(
      checkpointDirectory,
      this.nextCheckpointFilename(canonicalPath),
    );

    await mkdir(checkpointDirectory, { recursive: true });
    await copyFile(absolutePath, checkpointPath);

    return checkpointPath;
  }

  async revert(relativePath: string): Promise<boolean> {
    const canonicalPath = normalizeTargetRelativePath(relativePath);
    const { absolutePath } = resolveWithinTarget(
      this.targetDirectory,
      canonicalPath,
    );
    const checkpointDirectory = this.sessionCheckpointDirectory;
    const encodedPath = encodeRelativePath(canonicalPath);
    const checkpointSuffix = `--${encodedPath}${CHECKPOINT_EXTENSION}`;

    let checkpointEntries: string[];

    try {
      checkpointEntries = await readdir(checkpointDirectory);
    } catch (error) {
      const errorCode =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : null;

      if (errorCode === "ENOENT") {
        return false;
      }

      throw error;
    }

    const latestCheckpoint = checkpointEntries
      .filter((entry) => entry.endsWith(checkpointSuffix))
      .sort()
      .at(-1);

    if (!latestCheckpoint) {
      return false;
    }

    await copyFile(path.join(checkpointDirectory, latestCheckpoint), absolutePath);
    return true;
  }
}
