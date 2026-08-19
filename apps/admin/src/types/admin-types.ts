// admin-types.ts — Re-export from @plexica/api-types (ADR-029, 2026-08-18).
//
// This file was previously 199 lines of hand-mirrored TypeScript interfaces.
// It is now a thin re-export from @plexica/api-types, the single source of
// truth for API response types. Name aliases preserve backward compatibility
// with existing import sites in apps/admin.

export {
  // Kafka + DLQ
  type KafkaStatusResponse as KafkaStatus,
  type KafkaConsumer as KafkaConsumerLag,
  type DlqEntry,
  type DlqListResponse,
  // Tenant
  type TenantStatus,
  type TenantListItem,
  type TenantListResponse,
  type TenantConflictType,
  type ProvisionResult,
  type TenantDetailPluginInstallation,
  type TenantDetail,
  type DeletionStepName,
  type DeletionStepStatus,
  type TenantDeletionStepResponse,
  type DeletionStatusResponse,
  type DeletionRetryResponse,
  // Audit
  type AuditAction,
  type AuditEntry,
  type AuditLogResponse,
  // Health
  type HealthStatus as HealthStatusEnum,
  type HealthServiceResult,
  type HealthResponse,
  // Dashboard
  type DashboardMetrics,
  // Plugin
  type PluginStatus,
  type ReviewStatus,
  type Plugin,
  type ReviewResponse,
  // Logs
  type LogLevel,
  type LogEntry,
  type LogsResponse,
} from '@plexica/api-types';
