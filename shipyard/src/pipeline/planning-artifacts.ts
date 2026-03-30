import { z } from "zod";

import type {
  ArtifactContent,
  ArtifactRecord,
  BacklogArtifact,
  BacklogEntry,
  EpicArtifact,
  EpicRecord,
  TechnicalSpecArtifact,
  TechnicalSpecRecord,
  UserStoryArtifact,
  UserStoryRecord,
} from "../artifacts/types.js";

const nonEmptyStringSchema = z.string().trim().min(1);
const stringListSchema = z.array(nonEmptyStringSchema).default([]);

const epicInputSchema = z.object({
  title: nonEmptyStringSchema.optional(),
  summary: nonEmptyStringSchema.optional(),
  epics: z.array(
    z.object({
      id: nonEmptyStringSchema.optional(),
      title: nonEmptyStringSchema,
      valueStatement: nonEmptyStringSchema,
      scope: nonEmptyStringSchema,
      acceptanceCriteria: stringListSchema,
      dependencies: stringListSchema,
      estimatedComplexity: nonEmptyStringSchema.default("Medium"),
    }),
  ).min(1),
});

const userStoryInputSchema = z.object({
  title: nonEmptyStringSchema.optional(),
  summary: nonEmptyStringSchema.optional(),
  stories: z.array(
    z.object({
      id: nonEmptyStringSchema.optional(),
      epicId: z.string().trim().nullable().optional(),
      title: nonEmptyStringSchema,
      userStory: nonEmptyStringSchema,
      acceptanceCriteria: stringListSchema,
      edgeCases: stringListSchema,
      dependencies: stringListSchema,
      estimatedComplexity: nonEmptyStringSchema.default("Medium"),
      priority: z.number().int().positive().optional(),
    }),
  ).min(1),
});

const technicalSpecInputSchema = z.object({
  title: nonEmptyStringSchema.optional(),
  summary: nonEmptyStringSchema.optional(),
  specs: z.array(
    z.object({
      id: nonEmptyStringSchema.optional(),
      storyId: nonEmptyStringSchema.optional(),
      title: nonEmptyStringSchema,
      overview: nonEmptyStringSchema,
      dataModel: stringListSchema,
      apiContract: stringListSchema,
      componentStructure: stringListSchema,
      stateManagement: nonEmptyStringSchema,
      errorHandling: stringListSchema,
      testExpectations: stringListSchema,
      implementationOrder: stringListSchema,
      designReferences: stringListSchema,
    }),
  ).min(1),
});

function asObjectContent(
  content: ArtifactContent,
  label: string,
): Record<string, unknown> {
  if (typeof content !== "object" || content === null || Array.isArray(content)) {
    throw new Error(`${label} artifacts must use JSON object content.`);
  }

  return content as Record<string, unknown>;
}

function formatSequenceId(prefix: string, index: number): string {
  return `${prefix}-${String(index + 1).padStart(3, "0")}`;
}

function normalizeUniqueStringList(values: string[]): string[] {
  const normalized = values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return [...new Set(normalized)];
}

function createDefaultTitle(fallback: string): string {
  return fallback;
}

function createDefaultSummary(
  fallback: string,
  count: number,
  label: string,
): string {
  return `${fallback} (${String(count)} ${label}${count === 1 ? "" : "s"}).`;
}

function findConsumedArtifactContent<TContent>(
  consumedArtifacts: ArtifactRecord<ArtifactContent>[],
  type: string,
): TContent | null {
  const record = consumedArtifacts.find((artifact) =>
    artifact.metadata.type === type
  );

  return (record?.content as unknown as TContent | undefined) ?? null;
}

export function normalizeEpicArtifact(
  content: ArtifactContent,
): EpicArtifact {
  const parsed = epicInputSchema.parse(asObjectContent(content, "Epic"));
  const epics: EpicRecord[] = parsed.epics.map((epic, index) => ({
    id: epic.id ?? formatSequenceId("EPIC", index),
    title: epic.title,
    valueStatement: epic.valueStatement,
    scope: epic.scope,
    acceptanceCriteria: normalizeUniqueStringList(epic.acceptanceCriteria),
    dependencies: normalizeUniqueStringList(epic.dependencies),
    estimatedComplexity: epic.estimatedComplexity,
  }));

  return {
    title: parsed.title ?? createDefaultTitle("Epic Artifact"),
    summary:
      parsed.summary
      ?? createDefaultSummary("Prioritized epics for implementation planning", epics.length, "epic"),
    epics,
  };
}

export function normalizeUserStoryArtifact(
  content: ArtifactContent,
  consumedArtifacts: ArtifactRecord<ArtifactContent>[],
): UserStoryArtifact {
  const parsed = userStoryInputSchema.parse(asObjectContent(content, "User story"));
  const consumedEpics = findConsumedArtifactContent<EpicArtifact>(
    consumedArtifacts,
    "epic-artifact",
  );
  const knownEpicIds = new Set(consumedEpics?.epics.map((epic) => epic.id) ?? []);
  const fallbackEpicId = consumedEpics?.epics[0]?.id ?? null;
  const stories: UserStoryRecord[] = parsed.stories.map((story, index) => {
    const requestedEpicId = story.epicId?.trim() || null;
    const epicId = requestedEpicId && knownEpicIds.has(requestedEpicId)
      ? requestedEpicId
      : fallbackEpicId;

    return {
      id: story.id ?? formatSequenceId("STORY", index),
      epicId,
      title: story.title,
      userStory: story.userStory,
      acceptanceCriteria: normalizeUniqueStringList(story.acceptanceCriteria),
      edgeCases: normalizeUniqueStringList(story.edgeCases),
      dependencies: normalizeUniqueStringList(story.dependencies),
      estimatedComplexity: story.estimatedComplexity,
      priority: story.priority ?? (index + 1),
    };
  });

  return {
    title: parsed.title ?? createDefaultTitle("User Story Artifact"),
    summary:
      parsed.summary
      ?? createDefaultSummary("Implementation-ready user stories", stories.length, "story"),
    stories,
  };
}

export function normalizeTechnicalSpecArtifact(
  content: ArtifactContent,
  consumedArtifacts: ArtifactRecord<ArtifactContent>[],
): TechnicalSpecArtifact {
  const parsed = technicalSpecInputSchema.parse(
    asObjectContent(content, "Technical spec"),
  );
  const consumedStories = findConsumedArtifactContent<UserStoryArtifact>(
    consumedArtifacts,
    "user-story-artifact",
  );
  const knownStoryIds = consumedStories?.stories.map((story) => story.id) ?? [];
  const specs: TechnicalSpecRecord[] = parsed.specs.map((spec, index) => ({
    id: spec.id ?? formatSequenceId("SPEC", index),
    storyId: spec.storyId?.trim() || knownStoryIds[index] || knownStoryIds[0] || formatSequenceId("STORY", index),
    title: spec.title,
    overview: spec.overview,
    dataModel: normalizeUniqueStringList(spec.dataModel),
    apiContract: normalizeUniqueStringList(spec.apiContract),
    componentStructure: normalizeUniqueStringList(spec.componentStructure),
    stateManagement: spec.stateManagement,
    errorHandling: normalizeUniqueStringList(spec.errorHandling),
    testExpectations: normalizeUniqueStringList(spec.testExpectations),
    implementationOrder: normalizeUniqueStringList(spec.implementationOrder),
    designReferences: normalizeUniqueStringList(spec.designReferences),
  }));

  return {
    title: parsed.title ?? createDefaultTitle("Technical Spec Artifact"),
    summary:
      parsed.summary
      ?? createDefaultSummary("Approved technical specs for implementation", specs.length, "spec"),
    specs,
  };
}

export function buildBacklogArtifact(
  consumedArtifacts: ArtifactRecord<ArtifactContent>[],
): BacklogArtifact {
  const stories = findConsumedArtifactContent<UserStoryArtifact>(
    consumedArtifacts,
    "user-story-artifact",
  );

  if (!stories) {
    throw new Error("Backlog generation requires a consumed user-story artifact.");
  }

  const specs = findConsumedArtifactContent<TechnicalSpecArtifact>(
    consumedArtifacts,
    "technical-spec-artifact",
  );

  const specByStoryId = new Map(
    (specs?.specs ?? []).map((spec) => [spec.storyId, spec.id]),
  );

  const orderedStories = [...stories.stories].sort((left, right) => {
    const priorityDelta = left.priority - right.priority;

    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return left.id.localeCompare(right.id);
  });

  const entries: BacklogEntry[] = orderedStories.map((story, index) => ({
    storyId: story.id,
    title: story.title,
    epicId: story.epicId,
    priority: story.priority,
    rank: index + 1,
    status: "ready",
    dependencies: normalizeUniqueStringList(story.dependencies),
    specId: specByStoryId.get(story.id) ?? null,
  }));

  return {
    title: "Backlog Artifact",
    summary: `Ordered backlog with ${String(entries.length)} ready entr${entries.length === 1 ? "y" : "ies"}.`,
    orderedStoryIds: entries.map((entry) => entry.storyId),
    entries,
  };
}

export function normalizePipelineArtifactContent(options: {
  outputType: string;
  content: ArtifactContent;
  consumedArtifacts: ArtifactRecord<ArtifactContent>[];
}): ArtifactContent {
  switch (options.outputType) {
    case "epic-artifact":
      return normalizeEpicArtifact(options.content) as unknown as ArtifactContent;
    case "user-story-artifact":
      return normalizeUserStoryArtifact(
        options.content,
        options.consumedArtifacts,
      ) as unknown as ArtifactContent;
    case "technical-spec-artifact":
      return normalizeTechnicalSpecArtifact(
        options.content,
        options.consumedArtifacts,
      ) as unknown as ArtifactContent;
    default:
      return options.content;
  }
}
