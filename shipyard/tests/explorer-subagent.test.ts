import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { EXPLORER_TOOL_NAMES, parseContextReport, runExplorerSubagent } from "../src/agents/explorer.js";
import "../src/tools/index.js";
import {
  createFakeModelAdapter,
  createFakeTextTurnResult,
  createFakeToolCallTurnResult,
  getToolNamesFromCall,
  getToolResultContentParts,
} from "./support/fake-model-adapter.js";

const createdDirectories: string[] = [];

async function createTempProject(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "shipyard-explorer-"));
  createdDirectories.push(directory);
  return directory;
}

describe("explorer subagent", () => {
  afterEach(async () => {
    const directories = createdDirectories.splice(0, createdDirectories.length);

    await Promise.all(
      directories.map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
  });

  it("uses only the read-only tool allowlist and fails closed on unauthorized tool requests", async () => {
    const directory = await createTempProject();
    const modelAdapter = createFakeModelAdapter([
      createFakeToolCallTurnResult([
        {
          id: "toolu_write",
          name: "write_file",
          input: {
            path: "notes.md",
            contents: "hello",
          },
        },
      ]),
      createFakeTextTurnResult(JSON.stringify({
        query: "inspect the repo",
        findings: [],
      })),
    ]);

    await expect(
      runExplorerSubagent("inspect the repo", directory, {
        modelAdapter,
        logger: {
          log() {},
        },
      }),
    ).rejects.toThrow(/write_file|read-only|not available/i);

    expect(getToolNamesFromCall(modelAdapter.calls[0]!)).toEqual([
      ...EXPLORER_TOOL_NAMES,
    ]);
  });

  it("does not inherit prior assistant or user history", async () => {
    const directory = await createTempProject();
    const modelAdapter = createFakeModelAdapter([
      createFakeTextTurnResult(JSON.stringify({
        query: "find auth files",
        findings: [],
      })),
    ]);

    const result = await runExplorerSubagent("find auth files", directory, {
      modelAdapter,
      logger: {
        log() {},
      },
    });

    expect(result).toEqual({
      query: "find auth files",
      findings: [],
    });
    expect(modelAdapter.calls[0]?.messages).toEqual([
      {
        role: "user",
        content: "find auth files",
      },
    ]);
  });

  it("runs a broad discovery question and returns structured findings", async () => {
    const directory = await createTempProject();
    const authPath = path.join(directory, "src", "auth.ts");

    await mkdir(path.dirname(authPath), { recursive: true });
    await writeFile(
      authPath,
      "export async function authenticateUser(token: string) {\n  return token.length > 0;\n}\n",
      "utf8",
    );

    const modelAdapter = createFakeModelAdapter([
      createFakeToolCallTurnResult([
        {
          id: "toolu_search",
          name: "search_files",
          input: {
            pattern: "authenticateUser",
          },
        },
        {
          id: "toolu_read",
          name: "read_file",
          input: {
            path: "src/auth.ts",
          },
        },
      ]),
      createFakeTextTurnResult(JSON.stringify({
        query: "find all files that handle authentication",
        findings: [
          {
            filePath: "src/auth.ts",
            excerpt: "export async function authenticateUser(token: string) {",
            relevanceNote: "Defines the authentication entry point.",
          },
        ],
      })),
    ]);

    const result = await runExplorerSubagent(
      "find all files that handle authentication",
      directory,
      {
        modelAdapter,
        logger: {
          log() {},
        },
      },
    );

    expect(result).toEqual({
      query: "find all files that handle authentication",
      findings: [
        {
          filePath: "src/auth.ts",
          excerpt: "export async function authenticateUser(token: string) {",
          relevanceNote: "Defines the authentication entry point.",
        },
      ],
    });

    const toolResultPayloads = getToolResultContentParts(modelAdapter.calls[1]!);

    expect(toolResultPayloads).toHaveLength(2);
    expect(toolResultPayloads[0]?.result.success).toBe(true);
    expect(toolResultPayloads[0]?.result.output).toContain("src/auth.ts:1:");
    expect(toolResultPayloads[1]?.result.output).toContain("Path: src/auth.ts");
    expect(toolResultPayloads[1]?.result.output).toContain("authenticateUser");
  });

  it("rejects malformed final report JSON", () => {
    expect(() =>
      parseContextReport("not json at all", "find auth files"),
    ).toThrow(/json|contextreport/i);
  });

  it("accepts valid report JSON wrapped in prose and markdown fences", () => {
    const result = parseContextReport(
      [
        "Perfect! I found the relevant files.",
        "",
        "```json",
        JSON.stringify({
          query: "find auth files",
          findings: [
            {
              filePath: "src/auth.ts",
              excerpt: "export async function authenticateUser(token: string) {",
              relevanceNote: "Defines the authentication entry point.",
            },
          ],
        }, null, 2),
        "```",
      ].join("\n"),
      "find auth files",
    );

    expect(result).toEqual({
      query: "find auth files",
      findings: [
        {
          filePath: "src/auth.ts",
          excerpt: "export async function authenticateUser(token: string) {",
          relevanceNote: "Defines the authentication entry point.",
        },
      ],
    });
  });

  it("returns an empty findings array when discovery returns no matches", async () => {
    const directory = await createTempProject();
    const modelAdapter = createFakeModelAdapter([
      createFakeTextTurnResult(JSON.stringify({
        query: "find files about payments",
        findings: [],
      })),
    ]);

    const result = await runExplorerSubagent(
      "find files about payments",
      directory,
      {
        modelAdapter,
        logger: {
          log() {},
        },
      },
    );

    expect(result.findings).toEqual([]);
  });
});
