import { access, readFile } from "node:fs/promises";
import path from "node:path";

import type {
  DiscoveryReport,
  ResearchLookupRequest,
  ResearchLookupResult,
  ResearchSourcePreference,
  ResearchSourceRecord,
  ResearchSourceTier,
  ResearchTakeaway,
} from "../artifacts/types.js";

export type ResearchLookupInvoker = (
  request: ResearchLookupRequest,
) => Promise<ResearchLookupResult>;

interface CatalogEntry {
  sourceId: string;
  label: string;
  tier: ResearchSourceTier;
  domains: string[];
  keywords: string[];
}

const OFFICIAL_SOURCE_CATALOG: CatalogEntry[] = [
  {
    sourceId: "react-docs",
    label: "React Docs",
    tier: "official-docs",
    domains: ["react.dev"],
    keywords: ["react", "jsx", "hooks"],
  },
  {
    sourceId: "typescript-docs",
    label: "TypeScript Docs",
    tier: "official-docs",
    domains: ["www.typescriptlang.org"],
    keywords: ["typescript", "tsconfig", "type"],
  },
  {
    sourceId: "node-docs",
    label: "Node.js Docs",
    tier: "official-docs",
    domains: ["nodejs.org"],
    keywords: ["node", "node.js"],
  },
  {
    sourceId: "openai-docs",
    label: "OpenAI Docs",
    tier: "official-docs",
    domains: ["platform.openai.com", "developers.openai.com"],
    keywords: ["openai", "responses api", "realtime"],
  },
  {
    sourceId: "anthropic-docs",
    label: "Anthropic Docs",
    tier: "official-docs",
    domains: ["docs.anthropic.com"],
    keywords: ["anthropic", "claude"],
  },
  {
    sourceId: "railway-docs",
    label: "Railway Docs",
    tier: "official-docs",
    domains: ["docs.railway.com"],
    keywords: ["railway", "deploy", "deployment"],
  },
  {
    sourceId: "github-docs",
    label: "GitHub Docs",
    tier: "official-docs",
    domains: ["docs.github.com"],
    keywords: ["github", "pull request", "actions"],
  },
  {
    sourceId: "vercel-docs",
    label: "Vercel Docs",
    tier: "official-docs",
    domains: ["vercel.com", "vercel.com/docs"],
    keywords: ["vercel"],
  },
  {
    sourceId: "playwright-docs",
    label: "Playwright Docs",
    tier: "official-docs",
    domains: ["playwright.dev"],
    keywords: ["playwright"],
  },
];

function tierWeight(tier: ResearchSourceTier): number {
  switch (tier) {
    case "official-docs":
      return 0;
    case "primary-source":
      return 1;
    case "repo-local":
      return 2;
    case "secondary-source":
      return 3;
  }
}

function normalizeSnippet(value: string): string {
  return value.trim().replace(/\s+/gu, " ").slice(0, 240);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function sortSources(sources: ResearchSourceRecord[]): ResearchSourceRecord[] {
  return [...sources].sort((left, right) => {
    const tierDelta = tierWeight(left.tier) - tierWeight(right.tier);

    if (tierDelta !== 0) {
      return tierDelta;
    }

    const rankDelta = left.rank - right.rank;

    if (rankDelta !== 0) {
      return rankDelta;
    }

    return left.sourceId.localeCompare(right.sourceId);
  });
}

function selectPreferredSources(
  query: string,
  discovery: DiscoveryReport,
): ResearchSourcePreference[] {
  const haystack = [
    query,
    discovery.framework ?? "",
    discovery.language ?? "",
    discovery.packageManager ?? "",
  ]
    .join(" ")
    .toLowerCase();

  const matched = OFFICIAL_SOURCE_CATALOG.filter((entry) =>
    entry.keywords.some((keyword) => haystack.includes(keyword))
  );
  const fallback = matched.length > 0
    ? matched
    : OFFICIAL_SOURCE_CATALOG.filter((entry) =>
      ["typescript-docs", "node-docs"].includes(entry.sourceId)
    );

  return fallback.slice(0, 4).map((entry) => ({
    sourceId: entry.sourceId,
    label: entry.label,
    tier: entry.tier,
    domains: [...entry.domains],
    rationale: `Matched planning query to ${entry.label}.`,
  }));
}

async function pathExists(candidatePath: string): Promise<boolean> {
  try {
    await access(candidatePath);
    return true;
  } catch {
    return false;
  }
}

function createDiscoveryFallbackSource(
  discovery: DiscoveryReport,
): ResearchSourceRecord {
  const detailParts = [
    discovery.framework ? `framework: ${discovery.framework}` : null,
    discovery.language ? `language: ${discovery.language}` : null,
    discovery.packageManager ? `package manager: ${discovery.packageManager}` : null,
  ].filter((value): value is string => value !== null);

  return {
    sourceId: "repo-discovery",
    title: "Repo discovery snapshot",
    url: "file://.shipyard/discovery",
    domain: "local",
    label: "Discovery Snapshot",
    tier: "repo-local",
    rank: 1,
    snippet: normalizeSnippet(
      detailParts.length > 0
        ? `Repo-local fallback from discovery snapshot (${detailParts.join(", ")}).`
        : "Repo-local fallback from discovery snapshot.",
    ),
  };
}

async function createRepoFallbackSources(
  targetDirectory: string,
  discovery: DiscoveryReport,
): Promise<ResearchSourceRecord[]> {
  const readmePath = path.join(targetDirectory, "README.md");

  if (await pathExists(readmePath)) {
    const readme = await readFile(readmePath, "utf8");
    const snippet = normalizeSnippet(
      readme
        .replace(/^#.*$/mu, "")
        .trim() || "Repo-local README available.",
    );

    return [
      {
        sourceId: "repo-readme",
        title: "Repository README",
        url: "file://README.md",
        domain: "local",
        label: "Repo README",
        tier: "repo-local",
        rank: 1,
        snippet,
      },
    ];
  }

  return [createDiscoveryFallbackSource(discovery)];
}

function normalizeExternalResult(
  result: ResearchLookupResult,
  request: ResearchLookupRequest,
): ResearchLookupResult {
  const dedupedSources = sortSources(
    result.sources.reduce<ResearchSourceRecord[]>((accumulator, source) => {
      if (accumulator.some((existing) => existing.sourceId === source.sourceId)) {
        return accumulator;
      }

      accumulator.push({
        ...source,
        snippet: normalizeSnippet(source.snippet),
      });
      return accumulator;
    }, []),
  ).slice(0, request.maxSources);

  const allowedSourceIds = new Set(dedupedSources.map((source) => source.sourceId));
  const takeaways: ResearchTakeaway[] = result.takeaways
    .map((takeaway) => ({
      title: takeaway.title.trim(),
      summary: takeaway.summary.trim(),
      sourceIds: uniqueStrings(takeaway.sourceIds).filter((sourceId) =>
        allowedSourceIds.has(sourceId)
      ),
    }))
    .filter((takeaway) =>
      takeaway.title.length > 0
      && takeaway.summary.length > 0
      && takeaway.sourceIds.length > 0
    );

  return {
    title: result.title ?? "Research Brief",
    query: request.query,
    lookupStatus: dedupedSources.length > 0 ? "external" : "no-results",
    summary: result.summary.trim(),
    sources: dedupedSources,
    takeaways,
  };
}

export async function createResearchBrief(options: {
  query: string;
  targetDirectory: string;
  discovery: DiscoveryReport;
  externalLookup?: ResearchLookupInvoker;
}): Promise<ResearchLookupResult> {
  const request: ResearchLookupRequest = {
    query: options.query.trim(),
    targetDirectory: options.targetDirectory,
    discovery: options.discovery,
    preferredSources: selectPreferredSources(options.query, options.discovery),
    maxSources: 5,
  };

  if (!request.query) {
    throw new Error("Research queries must not be blank.");
  }

  try {
    if (options.externalLookup) {
      const externalResult = await options.externalLookup(request);
      const normalized = normalizeExternalResult(externalResult, request);

      if (normalized.lookupStatus === "external" && normalized.sources.length > 0) {
        return normalized;
      }
    }
  } catch {
    // Fall through to repo-local fallback with explicit uncertainty.
  }

  const fallbackSources = await createRepoFallbackSources(
    options.targetDirectory,
    options.discovery,
  );

  return {
    title: "Research Brief",
    query: request.query,
    lookupStatus: "repo-local-fallback",
    summary:
      "External research unavailable; falling back to repo-local context and explicit uncertainty.",
    sources: fallbackSources,
    takeaways: [
      {
        title: "Fallback guidance",
        summary:
          "Treat this planning input as repo-local fallback only until an external research provider is available.",
        sourceIds: fallbackSources.map((source) => source.sourceId),
      },
    ],
  };
}
