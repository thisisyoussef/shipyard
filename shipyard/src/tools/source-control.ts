import {
  createToolErrorResult,
  createToolSuccessResult,
  registerTool,
  type ToolDefinition,
  type ToolInputSchema,
} from "./registry.js";
import {
  attachRepositoryBinding,
  mergePullRequest,
  openPullRequest,
  provisionStoryBranch,
  syncSourceControlState,
} from "../source-control/runtime.js";

const TOOL_NAME = "manage_source_control";

interface ManageSourceControlInput {
  action:
    | "status"
    | "sync"
    | "attach_repository"
    | "provision_story_branch"
    | "open_pull_request"
    | "merge_pull_request";
  story_id?: string;
  title?: string;
  kind?: "feature" | "fix" | "chore";
  sync_from_default_branch?: boolean;
  owner?: string;
  repo?: string;
  remote_name?: string;
  remote_url?: string;
  default_branch?: string;
  review_guidance?: string;
  draft?: boolean;
  number?: number;
  url?: string;
  validation_status?: "pending" | "passed" | "failed";
  pull_request_id?: string;
  pull_request_number?: number;
  validation_passed?: boolean;
  merged_by?: string;
  cleanup_branch?: boolean;
}

const manageSourceControlInputSchema = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: [
        "status",
        "sync",
        "attach_repository",
        "provision_story_branch",
        "open_pull_request",
        "merge_pull_request",
      ],
      description: "Source-control action to execute.",
    },
    story_id: {
      type: "string",
      description: "Story identifier used for branch and PR operations.",
    },
    title: {
      type: "string",
      description: "Human title for the story branch or pull request.",
    },
    kind: {
      type: "string",
      enum: ["feature", "fix", "chore"],
      description: "Branch kind used when provisioning a story branch.",
    },
    sync_from_default_branch: {
      type: "boolean",
      description: "Whether to refresh an existing story branch from the default branch.",
    },
    owner: {
      type: "string",
      description: "GitHub owner/org for repository attach operations.",
    },
    repo: {
      type: "string",
      description: "GitHub repository name for repository attach operations.",
    },
    remote_name: {
      type: "string",
      description: "Optional git remote name for repository attach operations.",
    },
    remote_url: {
      type: "string",
      description: "Optional git remote URL for repository attach operations.",
    },
    default_branch: {
      type: "string",
      description: "Optional canonical default branch name.",
    },
    review_guidance: {
      type: "string",
      description: "Review guidance to store alongside the pull request.",
    },
    draft: {
      type: "boolean",
      description: "Whether the pull request should remain in draft state.",
    },
    number: {
      type: "integer",
      description: "Optional pull request number.",
    },
    url: {
      type: "string",
      description: "Optional pull request URL.",
    },
    validation_status: {
      type: "string",
      enum: ["pending", "passed", "failed"],
      description: "Validation state to persist on an opened or updated pull request.",
    },
    pull_request_id: {
      type: "string",
      description: "Pull request artifact id used for merge operations.",
    },
    pull_request_number: {
      type: "integer",
      description: "GitHub pull request number used for merge operations.",
    },
    validation_passed: {
      type: "boolean",
      description: "Whether validation has passed and merge can proceed.",
    },
    merged_by: {
      type: "string",
      description: "Optional actor label recorded for the merge.",
    },
    cleanup_branch: {
      type: "boolean",
      description: "Whether post-merge branch cleanup completed.",
    },
  },
  required: ["action"],
  additionalProperties: false,
} satisfies ToolInputSchema;

function requireString(
  value: string | undefined,
  fieldName: string,
): string {
  const trimmed = value?.trim();

  if (!trimmed) {
    throw new Error(`manage_source_control requires "${fieldName}".`);
  }

  return trimmed;
}

function formatStateSummary(summary: string, statusLine: string): string {
  return [statusLine, summary].join("\n");
}

export const manageSourceControlDefinition: ToolDefinition<ManageSourceControlInput> = {
  name: TOOL_NAME,
  description:
    "Inspect and mutate Shipyard's normalized GitHub-first source-control state, including repository binding, story branches, pull requests, and merge recovery.",
  inputSchema: manageSourceControlInputSchema,
  async execute(input, targetDirectory, context) {
    try {
      switch (input.action) {
        case "status":
        case "sync": {
          const result = await syncSourceControlState(targetDirectory, {
            signal: context?.signal,
          });
          return createToolSuccessResult(
            formatStateSummary(
              result.state.degraded.summary,
              `Auth: ${result.state.capability.authMode} | Repo: ${result.state.repository.slug ?? result.state.repository.status}`,
            ),
            result.state,
          );
        }
        case "attach_repository": {
          const result = await attachRepositoryBinding(
            targetDirectory,
            {
              owner: requireString(input.owner, "owner"),
              repo: requireString(input.repo, "repo"),
              remoteName: input.remote_name,
              remoteUrl: input.remote_url,
              defaultBranch: input.default_branch,
            },
            {
              signal: context?.signal,
            },
          );
          return createToolSuccessResult(
            formatStateSummary(
              result.state.degraded.summary,
              `Attached: ${result.state.repository.slug ?? "unknown repository"}`,
            ),
            result.state,
          );
        }
        case "provision_story_branch": {
          const result = await provisionStoryBranch(targetDirectory, {
            storyId: requireString(input.story_id, "story_id"),
            title: requireString(input.title, "title"),
            kind: input.kind,
            syncFromDefaultBranch: input.sync_from_default_branch,
            signal: context?.signal,
          });
          return createToolSuccessResult(
            `Provisioned ${result.branch.branchName} from ${result.branch.baseBranch}.`,
            {
              branch: result.branch,
              state: result.state,
              ownerProfileId: result.ownerProfileId,
            },
          );
        }
        case "open_pull_request": {
          const result = await openPullRequest(targetDirectory, {
            storyId: requireString(input.story_id, "story_id"),
            title: requireString(input.title, "title"),
            kind: input.kind,
            reviewGuidance: input.review_guidance,
            draft: input.draft,
            number: typeof input.number === "number" ? input.number : null,
            url: input.url,
            validationStatus: input.validation_status,
            signal: context?.signal,
          });
          return createToolSuccessResult(
            `Updated pull request ${result.pullRequest.number ? `#${String(result.pullRequest.number)}` : result.pullRequest.id} (${result.pullRequest.status}).`,
            {
              pullRequest: result.pullRequest,
              state: result.state,
              ownerProfileId: result.ownerProfileId,
            },
          );
        }
        case "merge_pull_request": {
          const result = await mergePullRequest(targetDirectory, {
            pullRequestId: input.pull_request_id,
            pullRequestNumber:
              typeof input.pull_request_number === "number"
                ? input.pull_request_number
                : undefined,
            validationPassed: input.validation_passed,
            mergedBy: input.merged_by,
            cleanupBranch: input.cleanup_branch,
            signal: context?.signal,
          });
          return createToolSuccessResult(
            result.decision.summary,
            {
              pullRequest: result.pullRequest,
              decision: result.decision,
              conflictTicket: result.conflictTicket,
              state: result.state,
              ownerProfileId: result.ownerProfileId,
            },
          );
        }
        default:
          throw new Error(`Unsupported source-control action "${input.action}".`);
      }
    } catch (error) {
      return createToolErrorResult(error);
    }
  },
};

registerTool(manageSourceControlDefinition);
