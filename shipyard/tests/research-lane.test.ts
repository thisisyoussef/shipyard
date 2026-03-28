import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type {
  DiscoveryReport,
  ResearchLookupResult,
} from "../src/artifacts/types.js";
import {
  createResearchBrief,
} from "../src/research/lookup.js";

const createdDirectories: string[] = [];

async function createTempDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  createdDirectories.push(directory);
  return directory;
}

function createDiscovery(): DiscoveryReport {
  return {
    isGreenfield: false,
    language: "TypeScript",
    framework: "React",
    packageManager: "pnpm",
    scripts: {
      test: "vitest run",
      typecheck: "tsc -p tsconfig.json",
    },
    hasReadme: true,
    hasAgentsMd: true,
    topLevelFiles: ["package.json", "README.md"],
    topLevelDirectories: ["src", "docs"],
    projectName: "shipyard-research",
    previewCapability: {
      status: "unavailable",
      kind: null,
      runner: null,
      scriptName: null,
      command: null,
      reason: "No preview configured.",
      autoRefresh: "none",
    },
  };
}

function createLookupResult(): ResearchLookupResult {
  return {
    query: "Integrate OpenAI streaming responses into a React app on Railway.",
    lookupStatus: "external",
    summary: "Official docs should outrank secondary guides for unstable APIs.",
    sources: [
      {
        sourceId: "community-blog",
        title: "Community blog",
        url: "https://example.com/openai-react-streaming",
        domain: "example.com",
        label: "Community blog",
        tier: "secondary-source",
        rank: 3,
        snippet: "A community-written summary of the integration.",
      },
      {
        sourceId: "openai-docs",
        title: "OpenAI API Docs",
        url: "https://platform.openai.com/docs/api-reference/responses",
        domain: "platform.openai.com",
        label: "OpenAI Docs",
        tier: "official-docs",
        rank: 1,
        snippet: "Official Responses API reference.",
      },
      {
        sourceId: "railway-docs",
        title: "Railway Docs",
        url: "https://docs.railway.com",
        domain: "docs.railway.com",
        label: "Railway Docs",
        tier: "official-docs",
        rank: 2,
        snippet: "Official Railway deployment docs.",
      },
    ],
    takeaways: [
      {
        title: "Prefer official references",
        summary: "OpenAI and Railway docs should lead the research brief.",
        sourceIds: ["openai-docs", "railway-docs"],
      },
    ],
  };
}

afterEach(async () => {
  await Promise.all(
    createdDirectories.splice(0, createdDirectories.length).map((directory) =>
      rm(directory, { recursive: true, force: true })
    ),
  );
});

describe("research lane", () => {
  it("prefers official documentation sources for research-backed planning", async () => {
    const targetDirectory = await createTempDirectory("shipyard-research-official-");

    const brief = await createResearchBrief({
      query: "Integrate OpenAI streaming responses into a React app on Railway.",
      targetDirectory,
      discovery: createDiscovery(),
      externalLookup: async () => createLookupResult(),
    });

    expect(brief.lookupStatus).toBe("external");
    expect(brief.sources.map((source) => source.sourceId)).toEqual([
      "openai-docs",
      "railway-docs",
      "community-blog",
    ]);
    expect(brief.sources[0]?.tier).toBe("official-docs");
    expect(brief.sources[1]?.tier).toBe("official-docs");
    expect(brief.takeaways).toEqual([
      expect.objectContaining({
        sourceIds: ["openai-docs", "railway-docs"],
      }),
    ]);
  });

  it("falls back clearly when external research is unavailable", async () => {
    const targetDirectory = await createTempDirectory("shipyard-research-fallback-");
    await mkdir(targetDirectory, { recursive: true });
    await writeFile(
      path.join(targetDirectory, "README.md"),
      [
        "# Shipyard Research Fixture",
        "",
        "This repo uses React and pnpm.",
      ].join("\n"),
      "utf8",
    );

    const brief = await createResearchBrief({
      query: "Deploy a React workspace to Railway with stable review gates.",
      targetDirectory,
      discovery: createDiscovery(),
      externalLookup: async () => {
        throw new Error("network unavailable");
      },
    });

    expect(brief.lookupStatus).toBe("repo-local-fallback");
    expect(brief.summary).toMatch(/external research unavailable/i);
    expect(brief.sources).toEqual([
      expect.objectContaining({
        tier: "repo-local",
      }),
    ]);
    expect(brief.takeaways).toEqual([
      expect.objectContaining({
        title: expect.stringMatching(/fallback/i),
      }),
    ]);
  });
});
