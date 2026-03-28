import {
  discoverTarget,
} from "../context/discovery.js";
import type { ToolDefinition } from "./registry.js";
import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
} from "./registry.js";
import { createResearchBrief } from "../research/lookup.js";

interface LookupOfficialDocsInput {
  query: string;
}

export const lookupOfficialDocsTool: ToolDefinition<LookupOfficialDocsInput> = {
  name: "lookup_official_docs",
  description:
    "Run Shipyard's read-only research lane, preferring official documentation and falling back clearly to repo-local context.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The planning or integration query to research.",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  async execute(input, targetDirectory) {
    try {
      const discovery = await discoverTarget(targetDirectory);
      const brief = await createResearchBrief({
        query: input.query,
        targetDirectory,
        discovery,
      });

      return createToolSuccessResult(
        [
          `Research lookup: ${brief.lookupStatus}`,
          brief.summary,
          ...brief.sources.map((source) =>
            `- [${source.tier}] ${source.label}: ${source.title} (${source.url})`
          ),
        ].join("\n"),
        brief,
      );
    } catch (error) {
      return createToolErrorResult(error);
    }
  },
};

registerTool(lookupOfficialDocsTool);
