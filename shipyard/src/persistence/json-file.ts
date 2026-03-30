import {
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

type JsonFileOps = {
  mkdir: (directoryPath: string, options: { recursive: true }) => Promise<unknown>;
  readFile: (filePath: string, encoding: BufferEncoding) => Promise<string>;
  rename: (fromPath: string, toPath: string) => Promise<void>;
  unlink: (filePath: string) => Promise<void>;
  writeFile: (
    filePath: string,
    contents: string,
    encoding: BufferEncoding,
  ) => Promise<void>;
};

const defaultJsonFileOps: JsonFileOps = {
  mkdir: (directoryPath, options) => mkdir(directoryPath, options),
  readFile: (filePath, encoding) => readFile(filePath, encoding),
  rename: (fromPath, toPath) => rename(fromPath, toPath),
  unlink: (filePath) => unlink(filePath),
  writeFile: (filePath, contents, encoding) =>
    writeFile(filePath, contents, encoding),
};

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export async function writeTextFileAtomically(
  filePath: string,
  contents: string,
  ops: JsonFileOps = defaultJsonFileOps,
): Promise<void> {
  await ops.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `${path.basename(filePath)}.tmp-${process.pid}-${Math.random().toString(16).slice(2)}`,
  );

  let renamed = false;

  try {
    await ops.writeFile(tempPath, contents, "utf8");
    await ops.rename(tempPath, filePath);
    renamed = true;
  } finally {
    if (!renamed) {
      try {
        await ops.unlink(tempPath);
      } catch {
        // Best-effort cleanup only; preserve the original failure.
      }
    }
  }
}

export async function readParsedJsonFileIfPresent<T>(
  filePath: string,
  parse: (value: unknown) => T,
  ops: JsonFileOps = defaultJsonFileOps,
): Promise<T | null> {
  let contents: string;

  try {
    contents = await ops.readFile(filePath, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }
    throw error;
  }

  return parse(JSON.parse(contents));
}
