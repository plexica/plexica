/**
 * Analytics Service
 *
 * Provides platform-wide analytics for super-admin dashboard.
 * Aggregates data across all tenants for monitoring and insights.
 *
 * Interface field names align with @plexica/types analytics types.
 */

import { TenantStatus } from '@plexica/database';
import { db } from '../lib/db.js';

export interface PlatformOverview {
  totalTenants: number;
  activeTenants: number;
  suspendedTenants: number;
  totalUsers: number;
  totalPlugins: number;
  apiCalls24h: number;
}

export interface TenantGrowthData {
  date: string;
  totalTenants: number;
  activeTenants: number;
  newTenants: number;
}

export interface PluginUsageData {
  pluginId: string;
  pluginName: string;
  installCount: number;
  activeInstalls: number;
  category: string;
}

export interface ApiCallMetrics {
  date: string;
  hour?: number;
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  avgLatencyMs: number;
}

class AnalyticsService {
  /**
   * Get platform-wide overview statistics
   */
  async getOverview(): Promise<PlatformOverview> {
    // Get tenant counts by status
    const tenantStats = await db.tenant.groupBy({
      by: ['status'],
      _count: true,
    });

    const totalTenants = tenantStats.reduce((sum: number, stat) => sum + stat._count, 0);
    const activeTenants = tenantStats.find((s) => s.status === TenantStatus.ACTIVE)?._count || 0;
    const suspendedTenants =
      tenantStats.find((s) => s.status === TenantStatus.SUSPENDED)?._count || 0;

    // Get total plugins in registry
    const totalPlugins = await db.plugin.count();

    // Get total users across all tenants
    const totalUsers = await db.user.count();

    return {
      totalTenants,
      activeTenants,
      suspendedTenants,
      totalPlugins,
      totalUsers,
      apiCalls24h: 0, // Placeholder until real metrics collection is implemented
    };
  }

  /**
   * Get tenant growth over time
   * Returns daily aggregated data for the last N days
   */
  async getTenantGrowth(days: number = 30): Promise<TenantGrowthData[]> {
    // Get all tenants with their creation dates
    const tenants = await db.tenant.findMany({
      select: {
        id: true,
        status: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Group tenants by date
    const growthMap = new Map<string, TenantGrowthData>();

    // Initialize all dates with zero counts
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateKey = d.toISOString().split('T')[0];
      growthMap.set(dateKey, {
        date: dateKey,
        totalTenants: 0,
        activeTenants: 0,
        newTenants: 0,
      });
    }

    // Count tenants created up to each date
    for (const [dateKey, data] of growthMap) {
      const dateThreshold = new Date(dateKey);
      dateThreshold.setHours(23, 59, 59, 999);

      // Count total tenants created up to this date (excluding DELETED)
      const totalTenantsUpToDate = tenants.filter((t) => {
        return t.createdAt <= dateThreshold && t.status !== TenantStatus.DELETED;
      }).length;

      // Count active tenants as of this date
      const activeTenantsUpToDate = tenants.filter((t) => {
        return (
          t.createdAt <= dateThreshold &&
          (t.status === TenantStatus.ACTIVE || t.status === TenantStatus.PROVISIONING)
        );
      }).length;

      // Count tenants created on this specific date
      const dateStart = new Date(dateKey);
      dateStart.setHours(0, 0, 0, 0);
      const newTenantsOnDate = tenants.filter((t) => {
        return t.createdAt >= dateStart && t.createdAt <= dateThreshold;
      }).length;

      data.totalTenants = totalTenantsUpToDate;
      data.activeTenants = activeTenantsUpToDate;
      data.newTenants = newTenantsOnDate;
    }

    return Array.from(growthMap.values());
  }

  /**
   * Get plugin usage statistics
   * Shows which plugins are most installed and active
   */
  async getPluginUsage(): Promise<PluginUsageData[]> {
    // Get all plugins with their installation counts
    const plugins = await db.plugin.findMany({
      select: {
        id: true,
        name: true,
        category: true,
      },
    });

    const pluginUsage: PluginUsageData[] = [];

    for (const plugin of plugins) {
      // Count total installations
      const installCount = await db.tenantPlugin.count({
        where: {
          pluginId: plugin.id,
        },
      });

      // Count active tenant installations (tenant is ACTIVE and plugin is enabled)
      const activeInstalls = await db.tenantPlugin.count({
        where: {
          pluginId: plugin.id,
          enabled: true,
          tenant: {
            status: TenantStatus.ACTIVE,
          },
        },
      });

      pluginUsage.push({
        pluginId: plugin.id,
        pluginName: plugin.name,
        installCount,
        activeInstalls,
        category: plugin.category,
      });
    }

    // Sort by install count (most popular first)
    return pluginUsage.sort((a, b) => b.installCount - a.installCount);
  }

  /**
   * Get API call metrics over time
   *
   * NOTE: This is a placeholder implementation that returns synthetic data.
   * In a production system, this would query from:
   * - Redis cache for recent metrics
   * - Time-series database (TimescaleDB, InfluxDB) for historical data
   * - API gateway logs or middleware metrics
   *
   * Future implementation should track:
   * - Request counts per endpoint
   * - Response times (p50, p95, p99)
   * - Error rates by status code
   * - Rate limit violations
   * - Per-tenant usage
   */
  async getApiCallMetrics(hours: number = 24): Promise<ApiCallMetrics[]> {
    // TODO: Implement real metrics collection
    // This requires:
    // 1. Middleware to track API calls (request/response logging)
    // 2. Redis for real-time metrics aggregation
    // 3. Time-series storage for historical data
    // 4. Background job to aggregate and store metrics

    const metrics: ApiCallMetrics[] = [];
    const endDate = new Date();

    for (let i = hours - 1; i >= 0; i--) {
      const periodStart = new Date(endDate);
      periodStart.setHours(periodStart.getHours() - i, 0, 0, 0);

      // Placeholder: Return zero metrics
      // In production, query from metrics storage
      metrics.push({
        date: periodStart.toISOString(),
        hour: periodStart.getHours(),
        totalCalls: 0,
        successCalls: 0,
        errorCalls: 0,
        avgLatencyMs: 0,
      });
    }

    return metrics;
  }

  /**
   * Get user statistics across all tenants
   *
   * NOTE: Users are stored in tenant-specific schemas, not the core schema.
   * To get accurate per-tenant user counts, we would need to:
   * 1. Query each tenant's schema separately
   * 2. Use raw SQL to union results from multiple schemas
   *
   * For now, we return a simplified count from the core.users table (sample data).
   */
  async getUserStats(): Promise<{
    totalUsers: number;
    usersByTenant: Array<{ tenantSlug: string; tenantName: string; userCount: number }>;
  }> {
    const totalUsers = await db.user.count();

    // TODO: Implement per-tenant user counting
    // This requires querying each tenant schema individually

    return {
      totalUsers,
      usersByTenant: [], // Not implemented yet
    };
  }

  /**
   * Get workspace statistics
   */
  async getWorkspaceStats(): Promise<{
    totalWorkspaces: number;
    workspacesByTenant: Array<{ tenantSlug: string; tenantName: string; workspaceCount: number }>;
  }> {
    const totalWorkspaces = await db.workspace.count();

    // Note: Workspace model currently doesn't have tenantId
    // This is a known limitation - see outstanding issues
    // For now, return global count only

    return {
      totalWorkspaces,
      workspacesByTenant: [],
    };
  }
}

export const analyticsService = new AnalyticsService();
