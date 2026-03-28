import {
  mkdir,
  readdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { loadExecutionHandoff } from "../handoff.js";
import type {
  ArtifactContent,
  ArtifactContentKind,
  ArtifactLocator,
  ArtifactMetadata,
  ArtifactQuery,
  ArtifactQueryResult,
  ArtifactRecord,
  ArtifactSource,
  ArtifactStatus,
  LoadArtifactResult,
  PersistedTaskQueue,
  SaveArtifactOptions,
} from "../types.js";
import {
  getArtifactDirectory,
  getArtifactRegistryDirectory,
  getPlanDirectory,
} from "../../engine/state.js";
import { loadPlanTaskQueue } from "../../plans/store.js";

const INDEX_VERSION = 1;
const ARTIFACT_SUMMARY_LIMIT = 200;
const MARKDOWN_HEADING_PATTERN = /^#\s+(.+)$/mu;

const artifactStatusSchema = z.enum([
  "draft",
  "approved",
  "rejected",
  "generated",
  "superseded",
]);

const artifactContentKindSchema = z.enum(["markdown", "json"]);

const artifactSourceSchema = z.enum([
  "registry",
  "legacy-plan",
  "legacy-handoff",
]);

const artifactMetadataSchema = z.object({
  id: z.string().trim().min(1),
  type: z.string().trim().min(1),
  parentId: z.string().trim().min(1).nullable(),
  version: z.number().int().positive(),
  status: artifactStatusSchema,
  producedBy: z.string().trim().min(1),
  producedAt: z.string().trim().min(1),
  approvedAt: z.string().trim().min(1).nullable(),
  approvedBy: z.string().trim().min(1).nullable(),
  tags: z.array(z.string().trim().min(1)),
  dependsOn: z.array(z.string().trim().min(1)),
});

const artifactRecordSchema = z.object({
  metadata: artifactMetadataSchema,
  title: z.string().trim().min(1).nullable(),
  summary: z.string().trim().min(1),
  contentKind: artifactContentKindSchema,
  contentPath: z.string().trim().min(1),
  metadataPath: z.string().trim().min(1),
  source: artifactSourceSchema,
  sourceFingerprint: z.string().trim().min(1).nullable(),
});

const artifactRegistryIndexSchema = z.object({
  version: z.literal(INDEX_VERSION),
  updatedAt: z.string().trim().min(1),
  records: z.array(artifactRecordSchema),
});

interface ArtifactRegistryIndex {
  version: typeof INDEX_VERSION;
  updatedAt: string;
  records: ArtifactRecord[];
}

interface SaveArtifactRecordInput {
  metadata: ArtifactMetadata;
  title: string | null;
  summary: string;
  contentKind: ArtifactContentKind;
  contentPath: string;
  metadataPath: string;
  source: ArtifactSource;
  sourceFingerprint: string | null;
}

interface ArtifactMetadataInput {
  type: string;
  id: string;
  parentId?: string | null;
  status: ArtifactStatus;
  producedBy: string;
  producedAt?: string;
  approvedAt?: string | null;
  approvedBy?: string | null;
  tags?: string[];
  dependsOn?: string[];
}

interface SyncLegacyArtifactsResult {
  index: ArtifactRegistryIndex;
  projectedCount: number;
  errors: string[];
}

function uniqueStrings(values: Iterable<string>): string[] {
  return [...new Set(values)].filter((value) => value.trim().length > 0);
}

function toForwardSlashPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function createRelativeTargetPath(
  targetDirectory: string,
  absolutePath: string,
): string {
  return toForwardSlashPath(path.relative(targetDirectory, absolutePath));
}

function normalizeArtifactPathPart(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "artifact";
}

function truncateArtifactSummary(summary: string): string {
  const trimmed = summary.trim();

  if (trimmed.length <= ARTIFACT_SUMMARY_LIMIT) {
    return trimmed;
  }

  return `${trimmed.slice(0, ARTIFACT_SUMMARY_LIMIT - 1)}…`;
}

function deriveTitleFromMarkdown(content: string): string | null {
  const match = MARKDOWN_HEADING_PATTERN.exec(content);
  return match?.[1]?.trim() || null;
}

function deriveSummaryFromContent(
  contentKind: ArtifactContentKind,
  content: ArtifactContent,
): string {
  if (contentKind === "markdown" && typeof content === "string") {
    const title = deriveTitleFromMarkdown(content);

    if (title) {
      const remaining = content
        .replace(MARKDOWN_HEADING_PATTERN, "")
        .trim();

      return truncateArtifactSummary(remaining || title);
    }

    return truncateArtifactSummary(content);
  }

  if (typeof content === "object" && content && !Array.isArray(content)) {
    const titledContent = content as Record<string, unknown>;
    const preferredSummary = [
      titledContent.summary,
      titledContent.goal,
      titledContent.title,
      titledContent.instruction,
    ].find((value) => typeof value === "string" && value.trim().length > 0);

    if (typeof preferredSummary === "string") {
      return truncateArtifactSummary(preferredSummary);
    }
  }

  return truncateArtifactSummary(JSON.stringify(content));
}

function deriveTitleFromContent(
  contentKind: ArtifactContentKind,
  content: ArtifactContent,
): string | null {
  if (contentKind === "markdown" && typeof content === "string") {
    return deriveTitleFromMarkdown(content);
  }

  if (typeof content === "object" && content && !Array.isArray(content)) {
    const titledContent = content as Record<string, unknown>;
    const preferredTitle = [titledContent.title, titledContent.goal].find(
      (value) => typeof value === "string" && value.trim().length > 0,
    );

    return typeof preferredTitle === "string" ? preferredTitle : null;
  }

  return null;
}

function sortArtifactRecords(records: ArtifactRecord[]): ArtifactRecord[] {
  return [...records].sort((left, right) => {
    const producedDelta =
      Date.parse(right.metadata.producedAt) - Date.parse(left.metadata.producedAt);

    if (producedDelta !== 0) {
      return producedDelta;
    }

    const versionDelta = right.metadata.version - left.metadata.version;

    if (versionDelta !== 0) {
      return versionDelta;
    }

    const typeDelta = left.metadata.type.localeCompare(right.metadata.type);

    if (typeDelta !== 0) {
      return typeDelta;
    }

    return left.metadata.id.localeCompare(right.metadata.id);
  });
}

function getArtifactRegistryIndexPath(targetDirectory: string): string {
  return path.join(getArtifactRegistryDirectory(targetDirectory), "index.json");
}

function getArtifactMetadataAbsolutePath(options: {
  targetDirectory: string;
  type: string;
  id: string;
  version: number;
}): string {
  return path.join(
    getArtifactRegistryDirectory(options.targetDirectory),
    normalizeArtifactPathPart(options.type),
    normalizeArtifactPathPart(options.id),
    `v${String(options.version).padStart(4, "0")}.meta.json`,
  );
}

function getArtifactContentAbsolutePath(options: {
  targetDirectory: string;
  type: string;
  id: string;
  version: number;
  contentKind: ArtifactContentKind;
}): string {
  const extension = options.contentKind === "markdown" ? "md" : "json";

  return path.join(
    getArtifactRegistryDirectory(options.targetDirectory),
    normalizeArtifactPathPart(options.type),
    normalizeArtifactPathPart(options.id),
    `v${String(options.version).padStart(4, "0")}.content.${extension}`,
  );
}

async function writeAtomically(
  filePath: string,
  contents: string,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `${path.basename(filePath)}.tmp-${process.pid}-${Math.random().toString(16).slice(2)}`,
  );

  await writeFile(tempPath, contents, "utf8");
  await rename(tempPath, filePath);
}

async function ensureRegistryIndex(
  targetDirectory: string,
): Promise<ArtifactRegistryIndex> {
  const indexPath = getArtifactRegistryIndexPath(targetDirectory);

  try {
    const contents = await readFile(indexPath, "utf8");
    const parsed = JSON.parse(contents);
    const validated = artifactRegistryIndexSchema.safeParse(parsed);

    if (!validated.success) {
      throw new Error(`Malformed artifact registry index at ${indexPath}.`);
    }

    return validated.data as ArtifactRegistryIndex;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    if (code !== "ENOENT") {
      throw error;
    }

    const initialIndex: ArtifactRegistryIndex = {
      version: INDEX_VERSION,
      updatedAt: new Date().toISOString(),
      records: [],
    };

    await writeAtomically(
      indexPath,
      `${JSON.stringify(initialIndex, null, 2)}\n`,
    );

    return initialIndex;
  }
}

async function writeRegistryIndex(
  targetDirectory: string,
  index: ArtifactRegistryIndex,
): Promise<void> {
  const normalizedIndex = artifactRegistryIndexSchema.parse({
    ...index,
    updatedAt: new Date().toISOString(),
    records: sortArtifactRecords(index.records).map((record) => ({
      ...record,
      metadata: {
        ...record.metadata,
        tags: uniqueStrings(record.metadata.tags),
        dependsOn: uniqueStrings(record.metadata.dependsOn),
      },
    })),
  }) as ArtifactRegistryIndex;

  await writeAtomically(
    getArtifactRegistryIndexPath(targetDirectory),
    `${JSON.stringify(normalizedIndex, null, 2)}\n`,
  );
}

function createArtifactRecord(input: SaveArtifactRecordInput): ArtifactRecord {
  return artifactRecordSchema.parse(input) as ArtifactRecord;
}

function serializeArtifactContent(
  contentKind: ArtifactContentKind,
  content: ArtifactContent,
): string {
  if (contentKind === "markdown") {
    if (typeof content !== "string") {
      throw new Error("Markdown artifacts require string content.");
    }

    return content;
  }

  return `${JSON.stringify(content, null, 2)}\n`;
}

async function loadArtifactRecordContent(
  targetDirectory: string,
  record: ArtifactRecord,
): Promise<ArtifactContent> {
  const absolutePath = path.resolve(targetDirectory, record.contentPath);
  const contents = await readFile(absolutePath, "utf8");

  if (record.contentKind === "markdown") {
    return contents;
  }

  return JSON.parse(contents) as ArtifactContent;
}

async function loadStoredMetadata(
  targetDirectory: string,
  record: ArtifactRecord,
): Promise<ArtifactRecord> {
  const absolutePath = path.resolve(targetDirectory, record.metadataPath);
  let contents: string;

  try {
    contents = await readFile(absolutePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Artifact metadata missing at ${record.metadataPath}.`);
    }

    throw error;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error(`Malformed artifact metadata at ${record.metadataPath}.`);
  }

  const validated = artifactRecordSchema.safeParse(parsed);

  if (!validated.success) {
    throw new Error(`Malformed artifact metadata at ${record.metadataPath}.`);
  }

  return validated.data as ArtifactRecord;
}

function recordMatchesStringFilter(
  value: string,
  filter?: string | string[],
): boolean {
  if (!filter) {
    return true;
  }

  const acceptedValues = Array.isArray(filter) ? filter : [filter];
  return acceptedValues.includes(value);
}

function recordIncludesAll(
  values: string[],
  required?: string[],
): boolean {
  if (!required || required.length === 0) {
    return true;
  }

  return required.every((entry) => values.includes(entry));
}

function groupLatestArtifacts(records: ArtifactRecord[]): ArtifactRecord[] {
  const grouped = new Map<string, ArtifactRecord>();

  for (const record of sortArtifactRecords(records)) {
    const key = `${record.metadata.type}::${record.metadata.id}`;

    if (!grouped.has(key)) {
      grouped.set(key, record);
    }
  }

  return [...grouped.values()];
}

function createBaseArtifactMetadata(
  options: ArtifactMetadataInput,
  version: number,
): ArtifactMetadata {
  return artifactMetadataSchema.parse({
    id: options.id,
    type: options.type,
    parentId: options.parentId ?? null,
    version,
    status: options.status,
    producedBy: options.producedBy,
    producedAt: options.producedAt ?? new Date().toISOString(),
    approvedAt: options.approvedAt ?? null,
    approvedBy: options.approvedBy ?? null,
    tags: uniqueStrings(options.tags ?? []),
    dependsOn: uniqueStrings(options.dependsOn ?? []),
  }) as ArtifactMetadata;
}

function findMaxVersion(
  index: ArtifactRegistryIndex,
  locator: Pick<ArtifactLocator, "type" | "id">,
): number {
  return index.records
    .filter((record) =>
      record.metadata.type === locator.type
      && record.metadata.id === locator.id
    )
    .reduce(
      (highestVersion, record) =>
        Math.max(highestVersion, record.metadata.version),
      0,
    );
}

async function saveArtifactRecord(
  targetDirectory: string,
  record: ArtifactRecord,
): Promise<ArtifactRecord> {
  await writeAtomically(
    path.resolve(targetDirectory, record.metadataPath),
    `${JSON.stringify(record, null, 2)}\n`,
  );

  return record;
}

function buildLegacyPlanSummary(plan: PersistedTaskQueue): string {
  return truncateArtifactSummary(
    `Plan ${plan.planId} with ${String(plan.tasks.length)} task${plan.tasks.length === 1 ? "" : "s"}: ${plan.goal}`,
  );
}

function buildLegacyHandoffSummary(summary: string, turnCount: number): string {
  return truncateArtifactSummary(`Turn ${String(turnCount)}: ${summary}`);
}

async function projectLegacyArtifact(
  targetDirectory: string,
  index: ArtifactRegistryIndex,
  record: ArtifactRecord,
): Promise<boolean> {
  const existing = index.records.find((entry) =>
    entry.metadata.type === record.metadata.type
    && entry.metadata.id === record.metadata.id
    && entry.metadata.version === record.metadata.version
    && entry.sourceFingerprint === record.sourceFingerprint
  );

  if (existing) {
    return false;
  }

  await saveArtifactRecord(targetDirectory, record);
  index.records = sortArtifactRecords([
    ...index.records.filter((entry) =>
      !(
        entry.metadata.type === record.metadata.type
        && entry.metadata.id === record.metadata.id
        && entry.metadata.version === record.metadata.version
      )
    ),
    record,
  ]);

  return true;
}

async function projectLegacyPlanArtifacts(
  targetDirectory: string,
  index: ArtifactRegistryIndex,
): Promise<{ projectedCount: number; errors: string[] }> {
  let entries: string[];

  try {
    entries = await readdir(getPlanDirectory(targetDirectory));
  } catch {
    return { projectedCount: 0, errors: [] };
  }

  let projectedCount = 0;
  const errors: string[] = [];

  for (const entry of entries.filter((value) => value.endsWith(".json"))) {
    const planId = entry.replace(/\.json$/u, "");

    try {
      const plan = await loadPlanTaskQueue(targetDirectory, planId);

      if (!plan) {
        continue;
      }

      const latestVersion = findMaxVersion(index, {
        type: "plan-task-queue",
        id: plan.planId,
      });
      const latestRecord = index.records.find((record) =>
        record.metadata.type === "plan-task-queue"
        && record.metadata.id === plan.planId
        && record.metadata.version === latestVersion
      );
      const sourceFingerprint = plan.updatedAt;

      if (latestRecord?.sourceFingerprint === sourceFingerprint) {
        continue;
      }

      const version = latestVersion + 1;
      const contentPath = toForwardSlashPath(
        path.join(".shipyard", "plans", `${plan.planId}.json`),
      );
      const metadataAbsolutePath = getArtifactMetadataAbsolutePath({
        targetDirectory,
        type: "plan-task-queue",
        id: plan.planId,
        version,
      });
      const record = createArtifactRecord({
        metadata: createBaseArtifactMetadata(
          {
            type: "plan-task-queue",
            id: plan.planId,
            status: "generated",
            producedBy: plan.planningMode === "planner" ? "planner" : "coordinator",
            producedAt: plan.updatedAt,
            tags: ["plan", plan.planningMode],
          },
          version,
        ),
        title: plan.goal,
        summary: buildLegacyPlanSummary(plan),
        contentKind: "json",
        contentPath,
        metadataPath: createRelativeTargetPath(targetDirectory, metadataAbsolutePath),
        source: "legacy-plan",
        sourceFingerprint,
      });

      if (await projectLegacyArtifact(targetDirectory, index, record)) {
        projectedCount += 1;
      }
    } catch (error) {
      errors.push(
        `Failed to project legacy plan artifact ${planId}: ${(error as Error).message}`,
      );
    }
  }

  return { projectedCount, errors };
}

async function projectLegacyHandoffArtifacts(
  targetDirectory: string,
  index: ArtifactRegistryIndex,
): Promise<{ projectedCount: number; errors: string[] }> {
  let sessionDirectories: string[];

  try {
    sessionDirectories = await readdir(getArtifactDirectory(targetDirectory));
  } catch {
    return { projectedCount: 0, errors: [] };
  }

  let projectedCount = 0;
  const errors: string[] = [];

  for (const sessionDirectory of sessionDirectories.filter((entry) => entry !== "registry")) {
    let entries: string[];

    try {
      entries = await readdir(
        path.join(getArtifactDirectory(targetDirectory), sessionDirectory),
      );
    } catch {
      continue;
    }

    for (const entry of entries.filter((value) => value.endsWith(".handoff.json"))) {
      const relativePath = toForwardSlashPath(
        path.join(".shipyard", "artifacts", sessionDirectory, entry),
      );
      const loaded = await loadExecutionHandoff(targetDirectory, relativePath);

      if (loaded.error) {
        errors.push(
          `Failed to project legacy execution handoff ${relativePath}: ${loaded.error}`,
        );
        continue;
      }

      const handoff = loaded.handoff?.handoff;

      if (!handoff) {
        continue;
      }

      const record = createArtifactRecord({
        metadata: createBaseArtifactMetadata(
          {
            type: "execution-handoff",
            id: handoff.sessionId,
            status: "generated",
            producedBy: handoff.phaseName,
            producedAt: handoff.createdAt,
            tags: ["handoff", handoff.phaseName, handoff.status],
          },
          handoff.turnCount,
        ),
        title: handoff.goal,
        summary: buildLegacyHandoffSummary(handoff.summary, handoff.turnCount),
        contentKind: "json",
        contentPath: relativePath,
        metadataPath: createRelativeTargetPath(
          targetDirectory,
          getArtifactMetadataAbsolutePath({
            targetDirectory,
            type: "execution-handoff",
            id: handoff.sessionId,
            version: handoff.turnCount,
          }),
        ),
        source: "legacy-handoff",
        sourceFingerprint: handoff.createdAt,
      });

      if (await projectLegacyArtifact(targetDirectory, index, record)) {
        projectedCount += 1;
      }
    }
  }

  return { projectedCount, errors };
}

async function syncLegacyArtifacts(
  targetDirectory: string,
  index: ArtifactRegistryIndex,
): Promise<SyncLegacyArtifactsResult> {
  const planProjection = await projectLegacyPlanArtifacts(targetDirectory, index);
  const handoffProjection = await projectLegacyHandoffArtifacts(targetDirectory, index);
  const projectedCount =
    planProjection.projectedCount + handoffProjection.projectedCount;

  if (projectedCount > 0) {
    await writeRegistryIndex(targetDirectory, index);
  }

  return {
    index,
    projectedCount,
    errors: [...planProjection.errors, ...handoffProjection.errors],
  };
}

export async function saveArtifact(
  targetDirectory: string,
  options: SaveArtifactOptions,
): Promise<ArtifactRecord> {
  await mkdir(getArtifactRegistryDirectory(targetDirectory), { recursive: true });
  const index = await ensureRegistryIndex(targetDirectory);
  const version = options.version ?? findMaxVersion(index, options) + 1;
  const metadata = createBaseArtifactMetadata(options, version);
  const contentAbsolutePath = getArtifactContentAbsolutePath({
    targetDirectory,
    type: metadata.type,
    id: metadata.id,
    version,
    contentKind: options.contentKind,
  });
  const metadataAbsolutePath = getArtifactMetadataAbsolutePath({
    targetDirectory,
    type: metadata.type,
    id: metadata.id,
    version,
  });
  const record = createArtifactRecord({
    metadata,
    title: options.title ?? deriveTitleFromContent(options.contentKind, options.content),
    summary:
      options.summary?.trim()
      || deriveSummaryFromContent(options.contentKind, options.content),
    contentKind: options.contentKind,
    contentPath: createRelativeTargetPath(targetDirectory, contentAbsolutePath),
    metadataPath: createRelativeTargetPath(targetDirectory, metadataAbsolutePath),
    source: "registry",
    sourceFingerprint: null,
  });

  await writeAtomically(
    contentAbsolutePath,
    serializeArtifactContent(options.contentKind, options.content),
  );
  await saveArtifactRecord(targetDirectory, record);

  index.records = sortArtifactRecords([
    ...index.records.filter((entry) =>
      !(
        entry.metadata.type === record.metadata.type
        && entry.metadata.id === record.metadata.id
        && entry.metadata.version === record.metadata.version
      )
    ),
    record,
  ]);
  await writeRegistryIndex(targetDirectory, index);

  return {
    ...record,
    content: options.content,
  };
}

export async function loadArtifact(
  targetDirectory: string,
  locator: ArtifactLocator,
  options?: {
    includeContent?: boolean;
  },
): Promise<LoadArtifactResult> {
  const index = await ensureRegistryIndex(targetDirectory);
  const synced = await syncLegacyArtifacts(targetDirectory, index);
  const entry = synced.index.records.find((record) =>
    record.metadata.type === locator.type
    && record.metadata.id === locator.id
    && record.metadata.version === locator.version
  );

  if (!entry) {
    return {
      record: null,
      error:
        `Artifact not found: ${locator.type}/${locator.id}@${String(locator.version)}`,
    };
  }

  let record: ArtifactRecord;

  try {
    record = await loadStoredMetadata(targetDirectory, entry);
  } catch (error) {
    return {
      record: null,
      error: (error as Error).message,
    };
  }

  if (!options?.includeContent) {
    return {
      record: {
        ...record,
        content: undefined,
      },
      error: null,
    };
  }

  try {
    return {
      record: {
        ...record,
        content: await loadArtifactRecordContent(targetDirectory, record),
      },
      error: null,
    };
  } catch (error) {
    return {
      record: null,
      error: `Failed to load artifact content at ${record.contentPath}: ${(error as Error).message}`,
    };
  }
}

export async function queryArtifacts(
  targetDirectory: string,
  query: ArtifactQuery = {},
): Promise<ArtifactQueryResult> {
  const index = await ensureRegistryIndex(targetDirectory);
  const synced = await syncLegacyArtifacts(targetDirectory, index);
  const matched = synced.index.records.filter((record) =>
    recordMatchesStringFilter(record.metadata.type, query.type)
    && recordMatchesStringFilter(record.metadata.id, query.ids)
    && recordMatchesStringFilter(record.metadata.status, query.status)
    && recordMatchesStringFilter(record.metadata.producedBy, query.producedBy)
    && (!query.parentId || record.metadata.parentId === query.parentId)
    && recordIncludesAll(record.metadata.tags, query.tags)
    && recordIncludesAll(record.metadata.dependsOn, query.dependsOn)
  );
  const latestRecords = query.latestOnly ? groupLatestArtifacts(matched) : matched;
  const limitedRecords = typeof query.limit === "number"
    ? latestRecords.slice(0, query.limit)
    : latestRecords;
  const records: ArtifactRecord[] = [];
  const errors = [...synced.errors];

  for (const entry of limitedRecords) {
    try {
      const metadataRecord = await loadStoredMetadata(targetDirectory, entry);

      if (!query.includeContent) {
        records.push({
          ...metadataRecord,
          content: undefined,
        });
        continue;
      }

      records.push({
        ...metadataRecord,
        content: await loadArtifactRecordContent(targetDirectory, metadataRecord),
      });
    } catch (error) {
      errors.push((error as Error).message);
    }
  }

  return {
    records,
    total: records.length,
    errors,
    projectedLegacyCount: synced.projectedCount,
  };
}
