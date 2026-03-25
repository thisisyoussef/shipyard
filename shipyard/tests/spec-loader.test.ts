import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CODE_PHASE_TOOL_NAMES } from "../src/phases/code/index.js";
import { loadSpecTool } from "../src/tools/load-spec.js";
import { getTool, type ToolDefinition } from "../src/tools/registry.js";

const createdDirectories: string[] = [];

async function createTempProject(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "shipyard-spec-loader-"));
  createdDirectories.push(directory);
  return directory;
}

describe("load_spec tool", () => {
  afterEach(async () => {
    const directories = createdDirectories.splice(0, createdDirectories.length);

    await Promise.all(
      directories.map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it("loads a single spec file with a stable ref and bounded content", async () => {
    const directory = await createTempProject();
    const specPath = path.join(directory, "docs/specs/feature-spec.md");
    await mkdir(path.dirname(specPath), { recursive: true });
    await writeFile(
      specPath,
      "# Feature Spec\n\nShipyard should load this spec from disk.\n",
      "utf8",
    );

    const result = await loadSpecTool({
      targetDirectory: directory,
      path: "docs/specs/feature-spec.md",
    });

    expect(result.kind).toBe("file");
    expect(result.documents).toHaveLength(1);
    expect(result.skipped).toEqual([]);
    expect(result.documents[0]).toMatchObject({
      name: "feature-spec",
      ref: "spec:docs/specs/feature-spec",
      path: "docs/specs/feature-spec.md",
      truncated: false,
    });
    expect(result.documents[0]?.content).toContain(
      "Shipyard should load this spec from disk.",
    );
  });

  it("expands directories deterministically and disambiguates duplicate names", async () => {
    const directory = await createTempProject();
    await mkdir(path.join(directory, "docs/specs/alpha"), { recursive: true });
    await mkdir(path.join(directory, "docs/specs/beta"), { recursive: true });
    await writeFile(
      path.join(directory, "docs/specs/beta/overview.md"),
      "# Beta Overview\n",
      "utf8",
    );
    await writeFile(
      path.join(directory, "docs/specs/alpha/overview.md"),
      "# Alpha Overview\n",
      "utf8",
    );
    await writeFile(
      path.join(directory, "docs/specs/notes.txt"),
      "Implementation notes\n",
      "utf8",
    );

    const result = await loadSpecTool({
      targetDirectory: directory,
      path: "docs/specs",
    });

    expect(result.kind).toBe("directory");
    expect(result.documents.map((document) => document.path)).toEqual([
      "docs/specs/alpha/overview.md",
      "docs/specs/beta/overview.md",
      "docs/specs/notes.txt",
    ]);
    expect(result.documents.map((document) => document.name)).toEqual([
      "alpha/overview",
      "beta/overview",
      "notes",
    ]);
  });

  it("rejects path traversal outside the target root", async () => {
    const directory = await createTempProject();

    await expect(
      loadSpecTool({
        targetDirectory: directory,
        path: "../outside.md",
      }),
    ).rejects.toThrowError("Access denied: path must stay within the target directory.");
  });

  it("skips obviously non-text files during directory loads with a clear reason", async () => {
    const directory = await createTempProject();
    await mkdir(path.join(directory, "docs/specs"), { recursive: true });
    await writeFile(
      path.join(directory, "docs/specs/feature-spec.md"),
      "# Feature Spec\n",
      "utf8",
    );
    await writeFile(
      path.join(directory, "docs/specs/mockup.png"),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x00]),
    );

    const result = await loadSpecTool({
      targetDirectory: directory,
      path: "docs/specs",
    });

    expect(result.documents).toHaveLength(1);
    expect(result.skipped).toEqual([
      {
        path: "docs/specs/mockup.png",
        reason: "Skipped non-text file.",
      },
    ]);
  });

  it("truncates oversized documents with an explicit marker", async () => {
    const directory = await createTempProject();
    await mkdir(path.join(directory, "docs/specs"), { recursive: true });
    await writeFile(
      path.join(directory, "docs/specs/large-brief.md"),
      `${"Detailed brief paragraph.\n".repeat(800)}\n`,
      "utf8",
    );

    const result = await loadSpecTool({
      targetDirectory: directory,
      path: "docs/specs/large-brief.md",
    });

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]?.truncated).toBe(true);
    expect(result.documents[0]?.content).toContain("[...truncated");
  });

  it("registers load_spec for the code phase and exposes spec refs in the ToolResult output", async () => {
    const directory = await createTempProject();
    await mkdir(path.join(directory, "docs/specs"), { recursive: true });
    await writeFile(
      path.join(directory, "docs/specs/feature-spec.md"),
      "# Feature Spec\n\nLoaded through the tool registry.\n",
      "utf8",
    );

    expect(CODE_PHASE_TOOL_NAMES).toContain("load_spec");

    const tool = getTool("load_spec") as ToolDefinition<{ path: string }>;
    const result = await tool.execute(
      {
        path: "docs/specs/feature-spec.md",
      },
      directory,
    );

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.output).toContain(
      "Loaded 1 spec document from docs/specs/feature-spec.md",
    );
    expect(result.output).toContain("Ref: spec:docs/specs/feature-spec");
    expect(result.output).toContain("Loaded through the tool registry.");
  });
});
