import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  CodeBrowserError,
  listCodeBrowserTree,
  readCodeBrowserFile,
} from "../src/ui/code-browser.js";

const createdDirectories: string[] = [];

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  createdDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  const directories = createdDirectories.splice(0, createdDirectories.length);

  await Promise.all(
    directories.map((directory) =>
      rm(directory, { recursive: true, force: true })
    ),
  );
});

describe("ui code browser", () => {
  it("lists a target-root tree and omits noisy directories", async () => {
    const targetDirectory = await createTempDirectory("shipyard-code-browser-");
    await mkdir(path.join(targetDirectory, "src"), { recursive: true });
    await mkdir(path.join(targetDirectory, "node_modules", "left-pad"), {
      recursive: true,
    });
    await writeFile(
      path.join(targetDirectory, "src", "App.tsx"),
      "export function App() { return null; }\n",
      "utf8",
    );
    await writeFile(
      path.join(targetDirectory, "package.json"),
      JSON.stringify({ name: "alpha-app" }, null, 2),
      "utf8",
    );

    const tree = await listCodeBrowserTree({
      targetDirectory,
      projectId: targetDirectory,
    });

    expect(tree).toMatchObject({
      projectId: targetDirectory,
      root: {
        path: ".",
        name: path.basename(targetDirectory),
      },
      nodes: [
        {
          name: "src",
          type: "directory",
          path: "src",
          children: [
            {
              name: "App.tsx",
              type: "file",
              path: "src/App.tsx",
            },
          ],
        },
        {
          name: "package.json",
          type: "file",
          path: "package.json",
        },
      ],
    });
  });

  it("rejects traversal outside the target root", async () => {
    const targetDirectory = await createTempDirectory(
      "shipyard-code-browser-traversal-",
    );

    await expect(
      readCodeBrowserFile({
        targetDirectory,
        projectId: targetDirectory,
        filePath: "../secret.txt",
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("blocks binary files and truncates oversized text files", async () => {
    const targetDirectory = await createTempDirectory("shipyard-code-browser-read-");
    await mkdir(path.join(targetDirectory, "assets"), { recursive: true });
    await mkdir(path.join(targetDirectory, "src"), { recursive: true });
    await writeFile(
      path.join(targetDirectory, "assets", "logo.bin"),
      Buffer.from([0, 1, 2, 3, 4]),
    );
    await writeFile(
      path.join(targetDirectory, "src", "large.ts"),
      `export const payload = "${"x".repeat(9_200)}";\n`,
      "utf8",
    );

    const binary = await readCodeBrowserFile({
      targetDirectory,
      projectId: targetDirectory,
      filePath: "assets/logo.bin",
    });
    const large = await readCodeBrowserFile({
      targetDirectory,
      projectId: targetDirectory,
      filePath: "src/large.ts",
    });

    expect(binary).toMatchObject({
      path: "assets/logo.bin",
      binary: true,
      truncated: false,
      contents: null,
      sizeBytes: 5,
    });
    expect(large.path).toBe("src/large.ts");
    expect(large.binary).toBe(false);
    expect(large.truncated).toBe(true);
    expect(large.sizeBytes).toBeGreaterThan(8_000);
    expect(large.contents).toContain("[...truncated");
  });

  it("rejects symbolic links so the browser stays within the target root", async () => {
    const targetDirectory = await createTempDirectory(
      "shipyard-code-browser-symlink-",
    );
    const externalDirectory = await createTempDirectory(
      "shipyard-code-browser-external-",
    );
    const externalFile = path.join(externalDirectory, "secret.txt");

    await writeFile(externalFile, "top secret\n", "utf8");
    await symlink(externalFile, path.join(targetDirectory, "secret.txt"));

    const tree = await listCodeBrowserTree({
      targetDirectory,
      projectId: targetDirectory,
    });

    expect(tree.nodes).toEqual([]);
    await expect(
      readCodeBrowserFile({
        targetDirectory,
        projectId: targetDirectory,
        filePath: "secret.txt",
      }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "access_denied",
    });
  });
});
