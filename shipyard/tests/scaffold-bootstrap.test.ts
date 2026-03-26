import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ensureShipyardDirectories } from "../src/engine/state.js";
import { createCodePhase } from "../src/phases/code/index.js";
import { CODE_PHASE_SYSTEM_PROMPT } from "../src/phases/code/prompts.js";
import { getTool } from "../src/tools/registry.js";
import { bootstrapTargetTool } from "../src/tools/target-manager/bootstrap-target.js";
import { createTargetTool } from "../src/tools/target-manager/create-target.js";
import { getScaffoldFiles } from "../src/tools/target-manager/scaffolds.js";
import { parseFrontendMessage } from "../src/ui/contracts.js";

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

describe("shared scaffold bootstrap", () => {
  it("defines a Vite-ready React TypeScript preset for CSS imports", () => {
    const files = getScaffoldFiles(
      "react-ts",
      "demo-app",
      "Starter React app for hosted Shipyard deploys.",
    );

    const fileMap = new Map(files.map((file) => [file.path, file.content]));
    const tsconfigContents = fileMap.get("tsconfig.json") ?? "";
    const appContents = fileMap.get(path.join("src", "App.tsx")) ?? "";
    const appCssContents = fileMap.get(path.join("src", "App.css")) ?? "";
    const viteEnvContents = fileMap.get(path.join("src", "vite-env.d.ts")) ?? "";

    expect(tsconfigContents).toContain('"types": [');
    expect(tsconfigContents).toContain('"vite/client"');
    expect(appContents).toContain('import "./App.css";');
    expect(appCssContents).toContain(".app-shell");
    expect(viteEnvContents).toContain('/// <reference types="vite/client" />');
  });

  it("defines a richer TypeScript pnpm workspace preset", () => {
    const files = getScaffoldFiles(
      "ts-pnpm-workspace",
      "demo-workspace",
      "Shared preset for a full-stack demo workspace.",
    );

    const fileMap = new Map(files.map((file) => [file.path, file.content]));
    const rootPackage = JSON.parse(fileMap.get("package.json") ?? "{}") as {
      packageManager?: string;
      scripts?: Record<string, string>;
    };
    const webPackage = JSON.parse(
      fileMap.get(path.join("apps", "web", "package.json")) ?? "{}",
    ) as {
      dependencies?: Record<string, string>;
    };

    expect(Array.from(fileMap.keys())).toEqual(
      expect.arrayContaining([
        "README.md",
        "AGENTS.md",
        ".gitignore",
        "package.json",
        "pnpm-workspace.yaml",
        "tsconfig.base.json",
        path.join("apps", "web", "package.json"),
        path.join("apps", "web", "src", "App.tsx"),
        path.join("apps", "api", "package.json"),
        path.join("apps", "api", "src", "index.ts"),
        path.join("packages", "shared", "package.json"),
        path.join("packages", "shared", "src", "index.ts"),
      ]),
    );
    expect(rootPackage.packageManager).toBe("pnpm@10.33.0");
    expect(rootPackage.scripts).toMatchObject({
      dev: expect.any(String),
      build: expect.any(String),
      typecheck: expect.any(String),
    });
    expect(fileMap.get("pnpm-workspace.yaml")).toContain("apps/*");
    expect(fileMap.get("pnpm-workspace.yaml")).toContain("packages/*");
    expect(fileMap.get("tsconfig.base.json")).toContain('"strict": true');
    expect(webPackage.dependencies).toMatchObject({
      "@demo-workspace/shared": "workspace:*",
    });
  });

  it("reuses the same preset files for target creation and empty-target bootstrap", async () => {
    const targetsDirectory = await createTempDirectory("shipyard-shared-create-");
    const bootstrapDirectory = await createTempDirectory("shipyard-shared-bootstrap-");
    await ensureShipyardDirectories(bootstrapDirectory);

    const createdTarget = await createTargetTool({
      name: "demo-workspace",
      description: "Shared preset for a full-stack demo workspace.",
      targetsDir: targetsDirectory,
      scaffoldType: "ts-pnpm-workspace",
    });
    const bootstrappedTarget = await bootstrapTargetTool({
      targetDirectory: bootstrapDirectory,
      name: "demo-workspace",
      description: "Shared preset for a full-stack demo workspace.",
      scaffoldType: "ts-pnpm-workspace",
    });

    expect(createdTarget.createdFiles).toEqual(bootstrappedTarget.createdFiles);
    expect(bootstrappedTarget.discovery.isGreenfield).toBe(false);
    expect(bootstrappedTarget.discovery.packageManager).toBe("pnpm");

    for (const relativePath of createdTarget.createdFiles) {
      await expect(
        readFile(path.join(createdTarget.path, relativePath), "utf8"),
      ).resolves.toBe(
        await readFile(path.join(bootstrappedTarget.path, relativePath), "utf8"),
      );
    }
  });

  it("rejects bootstrapping when the selected target already has real files", async () => {
    const targetDirectory = await createTempDirectory("shipyard-bootstrap-guard-");
    await ensureShipyardDirectories(targetDirectory);
    await writeFile(path.join(targetDirectory, "notes.md"), "already here\n", "utf8");

    await expect(
      bootstrapTargetTool({
        targetDirectory,
        description: "This should fail because the repo is no longer empty.",
      }),
    ).rejects.toThrow(/not empty|notes\.md/i);
  });

  it("registers bootstrap_target for code phase and accepts the richer preset in browser create payloads", () => {
    expect(createCodePhase().tools).toContain("bootstrap_target");
    expect(getTool("bootstrap_target")).toBeDefined();
    expect(CODE_PHASE_SYSTEM_PROMPT).toContain("bootstrap_target");
    expect(CODE_PHASE_SYSTEM_PROMPT).toContain("write_file");

    expect(
      parseFrontendMessage(
        JSON.stringify({
          type: "target:create_request",
          name: "workspace starter",
          description: "Create a richer pnpm workspace starter.",
          scaffoldType: "ts-pnpm-workspace",
        }),
      ),
    ).toEqual({
      type: "target:create_request",
      name: "workspace starter",
      description: "Create a richer pnpm workspace starter.",
      scaffoldType: "ts-pnpm-workspace",
    });
  });
});
