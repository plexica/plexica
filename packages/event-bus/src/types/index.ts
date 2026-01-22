import { z } from 'zod';

/**
 * Base domain event interface
 */
export interface DomainEvent<T = unknown> {
  id: string; // UUID
  type: string; // Event type (e.g., "core.tenant.created", "plugin.crm.contact.created")
  tenantId: string;
  workspaceId?: string;
  timestamp: Date;
  data: T;
  metadata: EventMetadata;
}

/**
 * Event metadata
 */
export interface EventMetadata {
  source: string; // Plugin ID or 'core'
  userId?: string;
  correlationId?: string; // For tracing related events
  causationId?: string; // The event that caused this event
  version?: string; // Schema version
}

/**
 * Event subscription options
 */
export interface SubscriptionOptions {
  groupId?: string; // Consumer group ID
  fromBeginning?: boolean; // Start from earliest or latest offset
  autoCommit?: boolean; // Auto-commit offsets (default: true)
  tenantId?: string; // Filter by tenant
  workspaceId?: string; // Filter by workspace
}

/**
 * Event handler function type
 */
export type EventHandler<T = unknown> = (event: DomainEvent<T>) => Promise<void>;

/**
 * Event publish options
 */
export interface PublishOptions {
  partitionKey?: string; // For consistent partitioning
  headers?: Record<string, string>;
  compress?: boolean; // Enable compression
}

/**
 * Topic configuration
 */
export interface TopicConfig {
  numPartitions?: number;
  replicationFactor?: number;
  retentionMs?: number; // Retention time in milliseconds (default: 7 days)
  cleanupPolicy?: 'delete' | 'compact';
}

/**
 * Event bus configuration
 */
export interface EventBusConfig {
  brokers: string[];
  clientId?: string;
  connectionTimeout?: number;
  requestTimeout?: number;
  retry?: {
    maxRetryTime?: number;
    initialRetryTime?: number;
    factor?: number;
    multiplier?: number;
    retries?: number;
  };
  ssl?: boolean;
  sasl?: {
    mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512';
    username: string;
    password: string;
  };
}

/**
 * Redpanda cluster health status
 */
export interface ClusterHealth {
  healthy: boolean;
  nodeCount: number;
  brokers: BrokerInfo[];
}

/**
 * Broker information
 */
export interface BrokerInfo {
  nodeId: number;
  host: string;
  port: number;
  rack?: string;
}

/**
 * Topic metadata
 */
export interface TopicMetadata {
  name: string;
  partitions: PartitionInfo[];
}

/**
 * Partition information
 */
export interface PartitionInfo {
  partition: number;
  leader: number;
  replicas: number[];
  isr: number[]; // In-sync replicas
}

/**
 * Consumer group info
 */
export interface ConsumerGroupInfo {
  groupId: string;
  state: string;
  members: ConsumerMemberInfo[];
}

/**
 * Consumer member info
 */
export interface ConsumerMemberInfo {
  memberId: string;
  clientId: string;
  clientHost: string;
  memberAssignment: TopicPartitionAssignment[];
}

/**
 * Topic partition assignment
 */
export interface TopicPartitionAssignment {
  topic: string;
  partitions: number[];
}

/**
 * Event filter predicate
 */
export type EventFilter = (event: DomainEvent) => boolean;

/**
 * Zod schemas for validation
 */
export const EventMetadataSchema = z.object({
  source: z.string(),
  userId: z.string().optional(),
  correlationId: z.string().optional(),
  causationId: z.string().optional(),
  version: z.string().optional(),
});

export const DomainEventSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1),
  tenantId: z.string(),
  workspaceId: z.string().optional(),
  timestamp: z.date(),
  data: z.unknown(),
  metadata: EventMetadataSchema,
});

export const TopicConfigSchema = z.object({
  numPartitions: z.number().int().positive().optional(),
  replicationFactor: z.number().int().min(1).max(3).optional(),
  retentionMs: z.number().int().positive().optional(),
  cleanupPolicy: z.enum(['delete', 'compact']).optional(),
});
