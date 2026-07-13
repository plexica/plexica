// admin-types.ts — TypeScript types for Admin API responses.
// Mirrors backend Zod schemas in services/core-api/src/modules/admin/schemas/.
// Updated to match actual backend response shapes (S5 review fix).

// ── Tenant types (mirrors tenant-schemas.ts) ──────────────────────────────

export type TenantStatus = 'active' | 'suspended' | 'pending_deletion' | 'deleted';

export interface TenantListItem {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  createdAt: string;
  version: number;
}

export interface TenantListResponse {
  data: TenantListItem[];
  total: number;
  page: number;
  pageSize: number;
}

// ── Health types (mirrors health-schemas.ts) ──────────────────────────────

export type HealthStatusEnum = 'healthy' | 'degraded' | 'down';

export interface HealthServiceResult {
  name: string;
  status: HealthStatusEnum;
  latencyMs: number;
}

export interface HealthResponse {
  services: HealthServiceResult[];
}

// ── Audit log types (mirrors audit-schemas.ts) ────────────────────────────

export type AuditAction =
  | 'tenant.provision'
  | 'tenant.suspend'
  | 'tenant.reactivate'
  | 'tenant.delete'
  | 'plugin.publish'
  | 'plugin.unpublish'
  | 'plugin.review';

export interface AuditEntry {
  id: string;
  actorId: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  tenantId?: string;
  metadata: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

export interface AuditLogResponse {
  data: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
}

// ── Dashboard metrics (S5-B00 — to be implemented) ────────────────────────

export interface DashboardMetrics {
  tenantCount: number;
  activeTenantCount: number;
  pluginCount: number;
  installedPluginCount: number;
  totalUsers: number;
  healthStatus: HealthStatusEnum;
}

// ── Plugin catalog (S5-800 — to be implemented) ───────────────────────────

export type PluginStatus = 'draft' | 'published' | 'unpublished' | 'deprecated';
export type ReviewStatus = 'none' | 'pending' | 'approved' | 'rejected';

export interface Plugin {
  id: string;
  slug: string;
  name: string;
  version: string;
  description: string;
  status: PluginStatus;
  reviewStatus: ReviewStatus;
  author: string;
  installedCount: number;
  createdAt: string;
  updatedAt: string;
}

// ── System logs (S5-A00 — to be implemented, Loki query proxy) ────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  tenant: string | null;
  message: string;
  meta?: Record<string, unknown>;
}

// ── Kafka status (S5-900 — to be implemented) ─────────────────────────────

export interface KafkaConsumerLag {
  pluginSlug: string;
  consumerGroup: string;
  lag: number;
}

export interface KafkaStatus {
  brokers: string[];
  consumerLags: KafkaConsumerLag[];
  dlqDepth: number;
}
