// File: packages/types/src/analytics.ts

/**
 * Platform-wide analytics overview (super-admin dashboard).
 */
export interface AnalyticsOverview {
  totalTenants: number;
  activeTenants: number;
  suspendedTenants: number;
  totalUsers: number;
  totalPlugins: number;
  apiCalls24h: number;
}

/**
 * Tenant growth data point for time-series charts.
 */
export interface TenantGrowthDataPoint {
  date: string;
  totalTenants: number;
  newTenants: number;
  activeTenants: number;
}

/**
 * Plugin usage data for analytics.
 */
export interface PluginUsageData {
  pluginId: string;
  pluginName: string;
  installCount: number;
  activeInstalls: number;
  category: string;
}

/**
 * API call metrics for analytics.
 */
export interface ApiCallMetrics {
  date: string;
  hour?: number;
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  avgLatencyMs: number;
}
