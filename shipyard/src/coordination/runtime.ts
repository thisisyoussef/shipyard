import { nanoid } from "nanoid";

import type { AgentRoleId } from "../agents/profiles.js";
import {
  createDefaultCoordinationState,
  type CoordinationAuditEntry,
  type CoordinationAuditKind,
  type CoordinationMessage,
  type CoordinationThread,
  type FileLease,
  type PersistedCoordinationState,
} from "./contracts.js";
import {
  loadCoordinationState,
  saveCoordinationState,
} from "./store.js";

export interface CoordinationRuntimeOptions {
  now?: () => string;
  idFactory?: () => string;
}

export interface AcquireFileLeaseOptions extends CoordinationRuntimeOptions {
  nodeId?: string | null;
  storyId?: string | null;
  taskId?: string | null;
  holderRoleId: AgentRoleId;
  advisoryScope: string;
  filePaths: string[];
  expiresAt: string;
}

export interface RenewFileLeaseOptions extends CoordinationRuntimeOptions {
  leaseId: string;
  holderRoleId: AgentRoleId;
  expiresAt: string;
}

export interface ReleaseFileLeaseOptions extends CoordinationRuntimeOptions {
  leaseId: string;
  holderRoleId: AgentRoleId;
  reason: string;
}

export interface OpenCoordinationThreadOptions extends CoordinationRuntimeOptions {
  threadId?: string;
  storyId?: string | null;
  taskId?: string | null;
  subject?: string;
  ownerRoleId?: AgentRoleId | null;
  authorRoleId: AgentRoleId;
  body: string;
}

export interface AcknowledgeCoordinationMessageOptions
  extends CoordinationRuntimeOptions {
  threadId: string;
  messageId: string;
  roleId: AgentRoleId;
}

export interface CoordinationMutationResult<TValue> {
  state: PersistedCoordinationState;
}

export function resolveCoordinationNow(override?: () => string): string {
  return override ? override() : new Date().toISOString();
}

function createIdentifier(
  prefix: string,
  override?: () => string,
): string {
  return override ? override() : `${prefix}-${nanoid(10)}`;
}

function appendAuditEntry(
  state: PersistedCoordinationState,
  entry: CoordinationAuditEntry,
): PersistedCoordinationState {
  return {
    ...state,
    updatedAt: entry.at,
    auditTrail: [entry, ...state.auditTrail].slice(0, 64),
  };
}

function createAuditEntry(
  kind: CoordinationAuditKind,
  message: string,
  options: CoordinationRuntimeOptions,
): CoordinationAuditEntry {
  const now = resolveCoordinationNow(options.now);

  return {
    id: createIdentifier("coord-audit", options.idFactory),
    at: now,
    kind,
    message,
  };
}

function expireStaleLeases(
  state: PersistedCoordinationState,
  now: string,
): PersistedCoordinationState {
  let changed = false;
  const nextLeases = state.fileLeases.map((lease) => {
    if (lease.status !== "active") {
      return lease;
    }

    if (Date.parse(lease.expiresAt) > Date.parse(now)) {
      return lease;
    }

    changed = true;
    return {
      ...lease,
      status: "expired" as const,
      releasedAt: now,
      releasedReason: "Lease expired.",
    };
  });

  if (!changed) {
    return state;
  }

  return {
    ...state,
    updatedAt: now,
    fileLeases: nextLeases,
  };
}

async function loadOrCreateCoordinationState(
  targetDirectory: string,
  options: CoordinationRuntimeOptions,
): Promise<PersistedCoordinationState> {
  const now = resolveCoordinationNow(options.now);
  const state =
    await loadCoordinationState(targetDirectory) ??
    createDefaultCoordinationState(now);

  return expireStaleLeases(state, now);
}

function createCoordinationMessage(
  authorRoleId: AgentRoleId,
  body: string,
  options: CoordinationRuntimeOptions,
): CoordinationMessage {
  const createdAt = resolveCoordinationNow(options.now);

  return {
    id: createIdentifier("coord-msg", options.idFactory),
    authorRoleId,
    body: body.trim(),
    createdAt,
    acknowledgements: [],
  };
}

export async function acquireFileLease(
  targetDirectory: string,
  options: AcquireFileLeaseOptions,
): Promise<CoordinationMutationResult<{ lease: FileLease }> & { lease: FileLease }> {
  const now = resolveCoordinationNow(options.now);
  let state = await loadOrCreateCoordinationState(targetDirectory, options);
  const normalizedFilePaths = [...new Set(options.filePaths.map((filePath) =>
    filePath.trim()
  ).filter(Boolean))];

  const conflictingLease = state.fileLeases.find((lease) =>
    lease.status === "active" &&
    lease.holderRoleId !== options.holderRoleId &&
    lease.filePaths.some((filePath) => normalizedFilePaths.includes(filePath))
  );

  if (conflictingLease) {
    throw new Error(
      `File lease conflict for ${normalizedFilePaths.join(", ")}; held by ${conflictingLease.holderRoleId}.`,
    );
  }

  const lease: FileLease = {
    id: createIdentifier("lease", options.idFactory),
    nodeId: options.nodeId?.trim() || null,
    storyId: options.storyId?.trim() || null,
    taskId: options.taskId?.trim() || null,
    holderRoleId: options.holderRoleId,
    advisoryScope: options.advisoryScope.trim(),
    filePaths: normalizedFilePaths,
    advisory: true,
    status: "active",
    acquiredAt: now,
    renewedAt: null,
    expiresAt: options.expiresAt,
    releasedAt: null,
    releasedReason: null,
  };

  state = {
    ...state,
    updatedAt: now,
    fileLeases: [lease, ...state.fileLeases],
  };
  state = appendAuditEntry(
    state,
    createAuditEntry(
      "lease-acquired",
      `Advisory lease ${lease.id} acquired for ${normalizedFilePaths.join(", ")} by ${lease.holderRoleId}.`,
      options,
    ),
  );
  const saved = await saveCoordinationState(targetDirectory, state);

  return {
    state: saved,
    lease,
  };
}

export async function renewFileLease(
  targetDirectory: string,
  options: RenewFileLeaseOptions,
): Promise<CoordinationMutationResult<{ lease: FileLease }> & { lease: FileLease }> {
  const now = resolveCoordinationNow(options.now);
  let state = await loadOrCreateCoordinationState(targetDirectory, options);
  const leaseIndex = state.fileLeases.findIndex((lease) =>
    lease.id === options.leaseId
  );

  if (leaseIndex === -1) {
    throw new Error(`File lease ${options.leaseId} was not found.`);
  }

  const existingLease = state.fileLeases[leaseIndex];

  if (existingLease?.holderRoleId !== options.holderRoleId) {
    throw new Error(`Only ${existingLease?.holderRoleId ?? "the holder"} can renew ${options.leaseId}.`);
  }

  if (existingLease?.status !== "active") {
    throw new Error(`Lease ${options.leaseId} is not active.`);
  }

  const renewedLease: FileLease = {
    ...existingLease,
    renewedAt: now,
    expiresAt: options.expiresAt,
  };
  const nextLeases = [...state.fileLeases];
  nextLeases[leaseIndex] = renewedLease;
  state = {
    ...state,
    updatedAt: now,
    fileLeases: nextLeases,
  };
  state = appendAuditEntry(
    state,
    createAuditEntry(
      "lease-renewed",
      `Advisory lease ${options.leaseId} renewed by ${options.holderRoleId}.`,
      options,
    ),
  );
  const saved = await saveCoordinationState(targetDirectory, state);

  return {
    state: saved,
    lease: renewedLease,
  };
}

export async function releaseFileLease(
  targetDirectory: string,
  options: ReleaseFileLeaseOptions,
): Promise<CoordinationMutationResult<{ lease: FileLease }> & { lease: FileLease }> {
  const now = resolveCoordinationNow(options.now);
  let state = await loadOrCreateCoordinationState(targetDirectory, options);
  const leaseIndex = state.fileLeases.findIndex((lease) =>
    lease.id === options.leaseId
  );

  if (leaseIndex === -1) {
    throw new Error(`File lease ${options.leaseId} was not found.`);
  }

  const existingLease = state.fileLeases[leaseIndex];

  if (existingLease?.holderRoleId !== options.holderRoleId) {
    throw new Error(`Only ${existingLease?.holderRoleId ?? "the holder"} can release ${options.leaseId}.`);
  }

  const releasedLease: FileLease = {
    ...existingLease,
    status: "released",
    releasedAt: now,
    releasedReason: options.reason,
  };
  const nextLeases = [...state.fileLeases];
  nextLeases[leaseIndex] = releasedLease;
  state = {
    ...state,
    updatedAt: now,
    fileLeases: nextLeases,
  };
  state = appendAuditEntry(
    state,
    createAuditEntry(
      "lease-released",
      `Advisory lease ${options.leaseId} released by ${options.holderRoleId}.`,
      options,
    ),
  );
  const saved = await saveCoordinationState(targetDirectory, state);

  return {
    state: saved,
    lease: releasedLease,
  };
}

export async function openCoordinationThread(
  targetDirectory: string,
  options: OpenCoordinationThreadOptions,
): Promise<
  CoordinationMutationResult<{ thread: CoordinationThread; message: CoordinationMessage }> & {
    thread: CoordinationThread;
    message: CoordinationMessage;
  }
> {
  const now = resolveCoordinationNow(options.now);
  let state = await loadOrCreateCoordinationState(targetDirectory, options);
  const message = createCoordinationMessage(
    options.authorRoleId,
    options.body,
    options,
  );

  if (options.threadId) {
    const threadIndex = state.threads.findIndex((thread) =>
      thread.id === options.threadId
    );

    if (threadIndex === -1) {
      throw new Error(`Coordination thread ${options.threadId} was not found.`);
    }

    const existingThread = state.threads[threadIndex]!;
    const updatedThread: CoordinationThread = {
      ...existingThread,
      updatedAt: now,
      messages: [...existingThread.messages, message],
    };
    const nextThreads = [...state.threads];
    nextThreads[threadIndex] = updatedThread;
    state = {
      ...state,
      updatedAt: now,
      threads: nextThreads,
    };
    state = appendAuditEntry(
      state,
      createAuditEntry(
        "message-appended",
        `Appended a coordination reply to ${updatedThread.id}.`,
        options,
      ),
    );
    const saved = await saveCoordinationState(targetDirectory, state);

    return {
      state: saved,
      thread: updatedThread,
      message,
    };
  }

  if (!options.subject?.trim()) {
    throw new Error("A new coordination thread requires a subject.");
  }

  const thread: CoordinationThread = {
    id: createIdentifier("coord-thread", options.idFactory),
    storyId: options.storyId?.trim() || null,
    taskId: options.taskId?.trim() || null,
    subject: options.subject.trim(),
    ownerRoleId: options.ownerRoleId ?? null,
    status: "open",
    createdAt: now,
    updatedAt: now,
    messages: [message],
  };

  state = {
    ...state,
    updatedAt: now,
    threads: [thread, ...state.threads],
  };
  state = appendAuditEntry(
    state,
    createAuditEntry(
      "thread-opened",
      `Opened coordination thread ${thread.id}.`,
      options,
    ),
  );
  const saved = await saveCoordinationState(targetDirectory, state);

  return {
    state: saved,
    thread,
    message,
  };
}

export async function acknowledgeCoordinationMessage(
  targetDirectory: string,
  options: AcknowledgeCoordinationMessageOptions,
): Promise<
  CoordinationMutationResult<{ thread: CoordinationThread; message: CoordinationMessage }> & {
    thread: CoordinationThread;
    message: CoordinationMessage;
  }
> {
  const now = resolveCoordinationNow(options.now);
  let state = await loadOrCreateCoordinationState(targetDirectory, options);
  const threadIndex = state.threads.findIndex((thread) =>
    thread.id === options.threadId
  );

  if (threadIndex === -1) {
    throw new Error(`Coordination thread ${options.threadId} was not found.`);
  }

  const existingThread = state.threads[threadIndex]!;
  const messageIndex = existingThread.messages.findIndex((message) =>
    message.id === options.messageId
  );

  if (messageIndex === -1) {
    throw new Error(`Coordination message ${options.messageId} was not found.`);
  }

  const existingMessage = existingThread.messages[messageIndex]!;
  const acknowledgements = existingMessage.acknowledgements.some((ack) =>
    ack.roleId === options.roleId
  )
    ? existingMessage.acknowledgements
    : [
        ...existingMessage.acknowledgements,
        {
          roleId: options.roleId,
          acknowledgedAt: now,
        },
      ];
  const updatedMessage: CoordinationMessage = {
    ...existingMessage,
    acknowledgements,
  };
  const nextMessages = [...existingThread.messages];
  nextMessages[messageIndex] = updatedMessage;
  const updatedThread: CoordinationThread = {
    ...existingThread,
    updatedAt: now,
    messages: nextMessages,
  };
  const nextThreads = [...state.threads];
  nextThreads[threadIndex] = updatedThread;
  state = {
    ...state,
    updatedAt: now,
    threads: nextThreads,
  };
  state = appendAuditEntry(
    state,
    createAuditEntry(
      "message-acknowledged",
      `Acknowledged message ${options.messageId} in ${options.threadId}.`,
      options,
    ),
  );
  const saved = await saveCoordinationState(targetDirectory, state);

  return {
    state: saved,
    thread: updatedThread,
    message: updatedMessage,
  };
}
