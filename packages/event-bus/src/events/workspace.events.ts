/**
 * Workspace Event Types and Schemas
 *
 * Defines the event contracts for workspace lifecycle changes.
 * These events are published by WorkspaceService and consumed by
 * plugins, activity feeds, audit logs, and other downstream services.
 *
 * Spec Reference: Spec 009, Appendix C
 * Constitution: Art. 3.1 (Event-Driven Architecture)
 */

import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type { DomainEvent } from '../types';

// ---------------------------------------------------------------------------
// Event Type Constants
// ---------------------------------------------------------------------------

/**
 * Workspace event type constants.
 *
 * Follows the convention: `core.<aggregate>.<action>` for domain events.
 * Plugins subscribe to these event types to react to workspace changes.
 */
export const WORKSPACE_EVENTS = {
  CREATED: 'core.workspace.created',
  UPDATED: 'core.workspace.updated',
  DELETED: 'core.workspace.deleted',
  MEMBER_ADDED: 'core.workspace.member.added',
  MEMBER_ROLE_UPDATED: 'core.workspace.member.role_updated',
  MEMBER_REMOVED: 'core.workspace.member.removed',
  TEAM_CREATED: 'core.workspace.team.created',
  RESOURCE_SHARED: 'core.workspace.resource.shared',
  RESOURCE_UNSHARED: 'core.workspace.resource.unshared',
} as const;

export type WorkspaceEventType = (typeof WORKSPACE_EVENTS)[keyof typeof WORKSPACE_EVENTS];

// ---------------------------------------------------------------------------
// Event Data Payload Interfaces
// ---------------------------------------------------------------------------

export interface WorkspaceCreatedData {
  workspaceId: string;
  slug: string;
  name: string;
  creatorId: string;
}

export interface WorkspaceUpdatedData {
  workspaceId: string;
  changes: Record<string, unknown>;
}

export interface WorkspaceDeletedData {
  workspaceId: string;
}

export interface MemberAddedData {
  workspaceId: string;
  userId: string;
  role: 'ADMIN' | 'MEMBER' | 'VIEWER';
  invitedBy: string;
}

export interface MemberRoleUpdatedData {
  workspaceId: string;
  userId: string;
  oldRole: string;
  newRole: string;
}

export interface MemberRemovedData {
  workspaceId: string;
  userId: string;
}

export interface TeamCreatedData {
  workspaceId: string;
  teamId: string;
  name: string;
  ownerId: string;
}

export interface ResourceSharedData {
  workspaceId: string;
  resourceType: string;
  resourceId: string;
  sharedBy: string;
}

export interface ResourceUnsharedData {
  workspaceId: string;
  resourceType: string;
  resourceId: string;
  unsharedBy: string;
}

// ---------------------------------------------------------------------------
// Typed Event Interfaces (extending DomainEvent)
// ---------------------------------------------------------------------------

export type WorkspaceCreatedEvent = DomainEvent<WorkspaceCreatedData>;
export type WorkspaceUpdatedEvent = DomainEvent<WorkspaceUpdatedData>;
export type WorkspaceDeletedEvent = DomainEvent<WorkspaceDeletedData>;
export type MemberAddedEvent = DomainEvent<MemberAddedData>;
export type MemberRoleUpdatedEvent = DomainEvent<MemberRoleUpdatedData>;
export type MemberRemovedEvent = DomainEvent<MemberRemovedData>;
export type TeamCreatedEvent = DomainEvent<TeamCreatedData>;
export type ResourceSharedEvent = DomainEvent<ResourceSharedData>;
export type ResourceUnsharedEvent = DomainEvent<ResourceUnsharedData>;

/**
 * Union type of all workspace event data payloads.
 */
export type WorkspaceEventData =
  | WorkspaceCreatedData
  | WorkspaceUpdatedData
  | WorkspaceDeletedData
  | MemberAddedData
  | MemberRoleUpdatedData
  | MemberRemovedData
  | TeamCreatedData
  | ResourceSharedData
  | ResourceUnsharedData;

// ---------------------------------------------------------------------------
// Zod Schemas for Runtime Validation
// ---------------------------------------------------------------------------

export const WorkspaceCreatedDataSchema = z.object({
  workspaceId: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  creatorId: z.string().min(1),
});

export const WorkspaceUpdatedDataSchema = z.object({
  workspaceId: z.string().min(1),
  changes: z.record(z.string(), z.unknown()),
});

export const WorkspaceDeletedDataSchema = z.object({
  workspaceId: z.string().min(1),
});

export const MemberAddedDataSchema = z.object({
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']),
  invitedBy: z.string().min(1),
});

export const MemberRoleUpdatedDataSchema = z.object({
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
  oldRole: z.string().min(1),
  newRole: z.string().min(1),
});

export const MemberRemovedDataSchema = z.object({
  workspaceId: z.string().min(1),
  userId: z.string().min(1),
});

export const TeamCreatedDataSchema = z.object({
  workspaceId: z.string().min(1),
  teamId: z.string().min(1),
  name: z.string().min(1),
  ownerId: z.string().min(1),
});

export const ResourceSharedDataSchema = z.object({
  workspaceId: z.string().min(1),
  resourceType: z.string().min(1),
  resourceId: z.string().min(1),
  sharedBy: z.string().min(1),
});

export const ResourceUnsharedDataSchema = z.object({
  workspaceId: z.string().min(1),
  resourceType: z.string().min(1),
  resourceId: z.string().min(1),
  unsharedBy: z.string().min(1),
});

/**
 * Map of event types to their Zod data schemas for runtime validation.
 */
export const WORKSPACE_EVENT_SCHEMAS: Record<WorkspaceEventType, z.ZodSchema> = {
  [WORKSPACE_EVENTS.CREATED]: WorkspaceCreatedDataSchema,
  [WORKSPACE_EVENTS.UPDATED]: WorkspaceUpdatedDataSchema,
  [WORKSPACE_EVENTS.DELETED]: WorkspaceDeletedDataSchema,
  [WORKSPACE_EVENTS.MEMBER_ADDED]: MemberAddedDataSchema,
  [WORKSPACE_EVENTS.MEMBER_ROLE_UPDATED]: MemberRoleUpdatedDataSchema,
  [WORKSPACE_EVENTS.MEMBER_REMOVED]: MemberRemovedDataSchema,
  [WORKSPACE_EVENTS.TEAM_CREATED]: TeamCreatedDataSchema,
  [WORKSPACE_EVENTS.RESOURCE_SHARED]: ResourceSharedDataSchema,
  [WORKSPACE_EVENTS.RESOURCE_UNSHARED]: ResourceUnsharedDataSchema,
};

// ---------------------------------------------------------------------------
// Factory Function
// ---------------------------------------------------------------------------

/**
 * Parameters required to create a workspace event.
 */
export interface CreateWorkspaceEventParams<T extends WorkspaceEventData> {
  /** The primary entity ID (typically workspaceId) */
  aggregateId: string;
  /** Tenant that owns this workspace */
  tenantId: string;
  /** User who performed the action */
  userId: string;
  /** The workspace ID for event routing */
  workspaceId?: string;
  /** Typed event data payload */
  data: T;
}

/**
 * Factory function to create a workspace domain event.
 *
 * Validates the event data against the corresponding Zod schema,
 * generates a UUID, and attaches standard metadata (source, userId,
 * correlationId, timestamp).
 *
 * @param type - The workspace event type constant
 * @param params - Event parameters including aggregateId, tenantId, userId, data
 * @returns A fully-formed DomainEvent ready for publishing
 * @throws Error if data does not match the expected schema
 *
 * @example
 * ```typescript
 * const event = createWorkspaceEvent(WORKSPACE_EVENTS.CREATED, {
 *   aggregateId: workspace.id,
 *   tenantId: 'tenant-123',
 *   userId: 'user-456',
 *   data: {
 *     workspaceId: workspace.id,
 *     slug: 'engineering',
 *     name: 'Engineering',
 *     creatorId: 'user-456',
 *   },
 * });
 * ```
 */
export function createWorkspaceEvent<T extends WorkspaceEventData>(
  type: WorkspaceEventType,
  params: CreateWorkspaceEventParams<T>
): DomainEvent<T> {
  // Validate data against schema
  const schema = WORKSPACE_EVENT_SCHEMAS[type];
  if (schema) {
    schema.parse(params.data);
  }

  return {
    id: uuidv4(),
    type,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId ?? params.aggregateId,
    timestamp: new Date(),
    data: params.data,
    metadata: {
      source: 'core',
      userId: params.userId,
      correlationId: uuidv4(),
      version: '1.0',
    },
  };
}
