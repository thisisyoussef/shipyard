import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { hashContents, readFileTool, resolveWithinTarget } from "../tools/read-file.js";

export interface CheckpointRecord {
  id: string;
  relativePath: string;
  sourcePath: string;
  backupPath: string;
  hash: string;
  createdAt: string;
}

export class CheckpointManager {
  constructor(private readonly workspaceRoot: string) {}

  async createCheckpoint(
    targetDirectory: string,
    relativePath: string,
  ): Promise<CheckpointRecord> {
    const sourcePath = resolveWithinTarget(targetDirectory, relativePath);
    const current = await readFileTool({
      targetDirectory,
      path: relativePath,
    });
    const id = new Date().toISOString().replace(/[:.]/g, "-");
    const checkpointDirectory = path.join(
      this.workspaceRoot,
      ".shipyard",
      "checkpoints",
    );
    const backupPath = path.join(
      checkpointDirectory,
      `${id}-${path.basename(relativePath)}`,
    );

    await mkdir(checkpointDirectory, { recursive: true });
    await copyFile(sourcePath, backupPath);

    return {
      id,
      relativePath,
      sourcePath,
      backupPath,
      hash: hashContents(current.contents),
      createdAt: new Date().toISOString(),
    };
  }

  async restoreCheckpoint(record: CheckpointRecord): Promise<void> {
    await copyFile(record.backupPath, record.sourcePath);
  }
}
