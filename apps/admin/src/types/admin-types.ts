// admin-types.ts — TypeScript types for Admin API responses.
// Pure type definitions — no runtime logic.
// Stubs will be filled per feature in subsequent sprint cards.

export interface DashboardMetrics {
  tenantCount: number;
  activeTenantCount: number;
  pluginCount: number;
  installedPluginCount: number;
  totalUsers: number;
  kafkaTopics: number;
  consumerLag: number;
  healthStatus: 'healthy' | 'degraded' | 'down';
}

export type TenantStatus = 'provisioning' | 'active' | 'suspended' | 'deprovisioned';

export interface TenantSummary {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  realm: string;
  userCount: number;
  createdAt: string;
}

export interface TenantDetail extends TenantSummary {
  databaseSchema: string;
  keycloakRealmId: string;
  minioBucket: string;
  kafkaTopicPrefix: string;
  plan: 'free' | 'pro' | 'enterprise';
  updatedAt: string;
}

export interface ProvisionRequest {
  slug: string;
  name: string;
  plan: 'free' | 'pro' | 'enterprise';
  adminEmail: string;
  adminPassword: string;
}

export type PluginStatus = 'published' | 'draft' | 'deprecated';

export interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  status: PluginStatus;
  author: string;
  installs: number;
  createdAt: string;
  updatedAt: string;
}

export interface ComponentHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  latencyMs: number;
  detail?: string;
}

export interface HealthStatus {
  overall: 'healthy' | 'degraded' | 'down';
  components: ComponentHealth[];
  checkedAt: string;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  tenantSlug: string | null;
  component: string;
  message: string;
  meta?: Record<string, unknown>;
}

export interface KafkaTopicInfo {
  name: string;
  partitions: number;
  replicationFactor: number;
  consumerLag: number;
}

export interface KafkaStatus {
  brokers: string[];
  topics: KafkaTopicInfo[];
  deadLetterQueueDepth: number;
  consumerGroups: number;
}
