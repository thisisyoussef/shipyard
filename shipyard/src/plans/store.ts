import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import type {
  ExecutionSpec,
  PersistedTaskQueue,
  PlanTask,
  PlanningMode,
} from "../artifacts/types.js";
import {
  ensureShipyardDirectories,
  getPlanDirectory,
} from "../engine/state.js";

const executionSpecSchema = z.object({
  instruction: z.string().trim().min(1),
  goal: z.string().trim().min(1),
  deliverables: z.array(z.string().trim().min(1)).min(1),
  acceptanceCriteria: z.array(z.string().trim().min(1)).min(1),
  verificationIntent: z.array(z.string().trim().min(1)).min(1),
  targetFilePaths: z.array(z.string().trim().min(1)),
  risks: z.array(z.string().trim().min(1)),
});

export const planTaskStatusSchema = z.enum([
  "pending",
  "in_progress",
  "done",
  "failed",
]);

export const planTaskSchema = z.object({
  id: z.string().trim().min(1),
  description: z.string().trim().min(1),
  status: planTaskStatusSchema,
  targetFilePaths: z.array(z.string().trim().min(1)).optional(),
  specRefs: z.array(z.string().trim().min(1)).optional(),
});

export const persistedTaskQueueSchema = z.object({
  planId: z.string().trim().min(1),
  instruction: z.string().trim().min(1),
  goal: z.string().trim().min(1),
  planningMode: z.enum(["lightweight", "planner"]),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
  executionSpec: executionSpecSchema,
  loadedSpecRefs: z.array(z.string().trim().min(1)),
  tasks: z.array(planTaskSchema).min(1),
});

export interface SavePlanTaskQueueOptions {
  targetDirectory: string;
  instruction: string;
  executionSpec: ExecutionSpec;
  planningMode: PlanningMode;
  loadedSpecRefs?: string[];
  tasks: PlanTask[];
  createdAt?: string;
}

function uniqueStrings(values: Iterable<string>): string[] {
  return [...new Set(values)];
}

function slugifyInstruction(instruction: string): string {
  const slug = instruction
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");

  return slug || "plan";
}

function createBasePlanId(instruction: string, createdAt: string): string {
  const datePortion = new Date(createdAt).toISOString().slice(0, 10);
  return `plan-${datePortion}-${slugifyInstruction(instruction)}`;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function createUniquePlanId(
  targetDirectory: string,
  basePlanId: string,
): Promise<string> {
  let candidate = basePlanId;
  let suffix = 2;

  while (await fileExists(getPlanFilePath(targetDirectory, candidate))) {
    candidate = `${basePlanId}-${String(suffix)}`;
    suffix += 1;
  }

  return candidate;
}

function normalizeTask(
  task: PlanTask,
): PlanTask {
  return {
    id: task.id,
    description: task.description,
    status: task.status,
    ...(task.targetFilePaths?.length
      ? {
          targetFilePaths: uniqueStrings(task.targetFilePaths),
        }
      : {}),
    ...(task.specRefs?.length
      ? {
          specRefs: uniqueStrings(task.specRefs),
        }
      : {}),
  };
}

export function derivePlanTasks(options: {
  executionSpec: ExecutionSpec;
  loadedSpecRefs?: string[];
}): PlanTask[] {
  const targetFilePaths = uniqueStrings(options.executionSpec.targetFilePaths);
  const specRefs = uniqueStrings(options.loadedSpecRefs ?? []);

  return options.executionSpec.deliverables.map((deliverable, index) => ({
    id: `task-${String(index + 1)}`,
    description: deliverable,
    status: "pending",
    ...(targetFilePaths.length > 0 ? { targetFilePaths } : {}),
    ...(specRefs.length > 0 ? { specRefs } : {}),
  }));
}

export function getPlanFilePath(
  targetDirectory: string,
  planId: string,
): string {
  return path.join(getPlanDirectory(targetDirectory), `${planId}.json`);
}

export async function savePlanTaskQueue(
  options: SavePlanTaskQueueOptions,
): Promise<PersistedTaskQueue> {
  const createdAt = options.createdAt ?? new Date().toISOString();

  await ensureShipyardDirectories(options.targetDirectory);

  const planId = await createUniquePlanId(
    options.targetDirectory,
    createBasePlanId(options.instruction, createdAt),
  );
  const artifact = persistedTaskQueueSchema.parse({
    planId,
    instruction: options.instruction.trim(),
    goal: options.executionSpec.goal,
    planningMode: options.planningMode,
    createdAt,
    updatedAt: createdAt,
    executionSpec: options.executionSpec,
    loadedSpecRefs: uniqueStrings(options.loadedSpecRefs ?? []),
    tasks: options.tasks.map(normalizeTask),
  }) as PersistedTaskQueue;

  await writeFile(
    getPlanFilePath(options.targetDirectory, planId),
    JSON.stringify(artifact, null, 2),
    "utf8",
  );

  return artifact;
}

export async function loadPlanTaskQueue(
  targetDirectory: string,
  planId: string,
): Promise<PersistedTaskQueue | null> {
  const planFilePath = getPlanFilePath(targetDirectory, planId);

  try {
    await access(planFilePath);
  } catch {
    return null;
  }

  const contents = await readFile(planFilePath, "utf8");
  const parsed = JSON.parse(contents);
  const validated = persistedTaskQueueSchema.safeParse(parsed);

  if (!validated.success) {
    throw new Error(`Invalid plan task queue artifact at ${planFilePath}.`);
  }

  return validated.data as PersistedTaskQueue;
}
