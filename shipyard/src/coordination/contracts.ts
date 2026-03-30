import { z } from "zod";

import {
  AGENT_ROLE_IDS,
  type AgentRoleId,
} from "../agents/agent-role-ids.js";

export const COORDINATION_STATE_VERSION = 1;

export const fileLeaseStatusSchema = z.enum([
  "active",
  "released",
  "expired",
]);

export const coordinationThreadStatusSchema = z.enum([
  "open",
  "resolved",
  "closed",
]);

export const coordinationAuditKindSchema = z.enum([
  "thread-opened",
  "message-appended",
  "message-acknowledged",
  "lease-acquired",
  "lease-renewed",
  "lease-released",
]);

export const coordinationAcknowledgementSchema = z.object({
  roleId: z.enum(AGENT_ROLE_IDS),
  acknowledgedAt: z.string().trim().min(1),
});

export const coordinationMessageSchema = z.object({
  id: z.string().trim().min(1),
  authorRoleId: z.enum(AGENT_ROLE_IDS),
  body: z.string().trim().min(1),
  createdAt: z.string().trim().min(1),
  acknowledgements: z.array(coordinationAcknowledgementSchema),
});

export const coordinationThreadSchema = z.object({
  id: z.string().trim().min(1),
  storyId: z.string().trim().min(1).nullable(),
  taskId: z.string().trim().min(1).nullable(),
  subject: z.string().trim().min(1),
  ownerRoleId: z.enum(AGENT_ROLE_IDS).nullable(),
  status: coordinationThreadStatusSchema,
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
  messages: z.array(coordinationMessageSchema).min(1),
});

export const fileLeaseSchema = z.object({
  id: z.string().trim().min(1),
  nodeId: z.string().trim().min(1).nullable(),
  storyId: z.string().trim().min(1).nullable(),
  taskId: z.string().trim().min(1).nullable(),
  holderRoleId: z.enum(AGENT_ROLE_IDS),
  advisoryScope: z.string().trim().min(1),
  filePaths: z.array(z.string().trim().min(1)).min(1),
  advisory: z.literal(true),
  status: fileLeaseStatusSchema,
  acquiredAt: z.string().trim().min(1),
  renewedAt: z.string().trim().min(1).nullable(),
  expiresAt: z.string().trim().min(1),
  releasedAt: z.string().trim().min(1).nullable(),
  releasedReason: z.string().nullable(),
});

export const coordinationAuditEntrySchema = z.object({
  id: z.string().trim().min(1),
  at: z.string().trim().min(1),
  kind: coordinationAuditKindSchema,
  message: z.string().trim().min(1),
});

export const persistedCoordinationStateSchema = z.object({
  version: z.literal(COORDINATION_STATE_VERSION),
  updatedAt: z.string().trim().min(1),
  threads: z.array(coordinationThreadSchema),
  fileLeases: z.array(fileLeaseSchema),
  auditTrail: z.array(coordinationAuditEntrySchema),
});

export type FileLeaseStatus = z.infer<typeof fileLeaseStatusSchema>;
export type CoordinationThreadStatus = z.infer<
  typeof coordinationThreadStatusSchema
>;
export type CoordinationAuditKind = z.infer<typeof coordinationAuditKindSchema>;
export type CoordinationAcknowledgement = z.infer<
  typeof coordinationAcknowledgementSchema
> & {
  roleId: AgentRoleId;
};
export type CoordinationMessage = z.infer<typeof coordinationMessageSchema> & {
  authorRoleId: AgentRoleId;
  acknowledgements: CoordinationAcknowledgement[];
};
export type CoordinationThread = z.infer<typeof coordinationThreadSchema> & {
  ownerRoleId: AgentRoleId | null;
  messages: CoordinationMessage[];
};
export type FileLease = z.infer<typeof fileLeaseSchema> & {
  holderRoleId: AgentRoleId;
};
export type CoordinationAuditEntry = z.infer<typeof coordinationAuditEntrySchema>;
export type PersistedCoordinationState = z.infer<
  typeof persistedCoordinationStateSchema
> & {
  threads: CoordinationThread[];
  fileLeases: FileLease[];
  auditTrail: CoordinationAuditEntry[];
};

export function createDefaultCoordinationState(
  now: string,
): PersistedCoordinationState {
  return {
    version: COORDINATION_STATE_VERSION,
    updatedAt: now,
    threads: [],
    fileLeases: [],
    auditTrail: [],
  };
}
