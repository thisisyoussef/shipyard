import { describe, expect, it, vi } from "vitest";

import {
  readParsedJsonFileIfPresent,
  writeTextFileAtomically,
} from "../src/persistence/json-file.js";

describe("json-file persistence helpers", () => {
  it("cleans up the temp file when rename fails", async () => {
    const mkdir = vi.fn(async () => undefined);
    let writtenTempPath: string | null = null;
    let cleanedTempPath: string | null = null;
    const writeFile = vi.fn(async (filePath: string) => {
      writtenTempPath = filePath;
    });
    const rename = vi.fn(async () => {
      throw new Error("rename failed");
    });
    const unlink = vi.fn(async (filePath: string) => {
      cleanedTempPath = filePath;
    });

    await expect(
      writeTextFileAtomically("/tmp/runtime.json", "{}", {
        mkdir,
        readFile: vi.fn(),
        rename,
        unlink,
        writeFile,
      }),
    ).rejects.toThrow("rename failed");

    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(unlink).toHaveBeenCalledTimes(1);
    expect(cleanedTempPath).toBe(writtenTempPath);
  });

  it("returns null when the file disappears before read", async () => {
    const missing = Object.assign(new Error("missing"), { code: "ENOENT" });

    await expect(
      readParsedJsonFileIfPresent(
        "/tmp/runtime.json",
        (value) => value as { ok: boolean },
        {
          mkdir: vi.fn(),
          readFile: vi.fn(async () => {
            throw missing;
          }),
          rename: vi.fn(),
          unlink: vi.fn(),
          writeFile: vi.fn(),
        },
      ),
    ).resolves.toBeNull();
  });

  it("rethrows non-ENOENT read failures", async () => {
    const denied = Object.assign(new Error("denied"), { code: "EACCES" });

    await expect(
      readParsedJsonFileIfPresent(
        "/tmp/runtime.json",
        (value) => value as { ok: boolean },
        {
          mkdir: vi.fn(),
          readFile: vi.fn(async () => {
            throw denied;
          }),
          rename: vi.fn(),
          unlink: vi.fn(),
          writeFile: vi.fn(),
        },
      ),
    ).rejects.toThrow("denied");
  });
});
