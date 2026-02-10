// apps/super-admin/src/hooks/useAnalytics.ts

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type TimePeriod = '24h' | '7d' | '30d';

export interface AnalyticsStats {
  totalTenants: number;
  activeTenants: number;
  totalUsers: number;
  totalPlugins: number;
  apiCalls24h: number;
  avgResponseTime: number; // ms
  errorRate: number; // %
}

export interface TenantGrowthData {
  date: string;
  count: number;
}

export interface ApiCallsData {
  hour: string;
  calls: number;
}

export interface AnalyticsPlugin {
  pluginId: string;
  pluginName: string;
  version: string;
  totalInstallations: number;
  activeTenants: number;
}

/** Map UI time period to API days parameter */
function timePeriodToDays(period: TimePeriod): number {
  switch (period) {
    case '24h':
      return 1;
    case '7d':
      return 7;
    case '30d':
      return 30;
  }
}

/** Map UI time period to API hours parameter */
function timePeriodToHours(period: TimePeriod): number {
  switch (period) {
    case '24h':
      return 24;
    case '7d':
      return 168;
    case '30d':
      return 168; // API max is 168 (7 days)
  }
}

export function useAnalytics() {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('7d');

  // Fetch platform overview statistics
  const {
    data: overviewData,
    isLoading: overviewLoading,
    error: overviewError,
  } = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: () => apiClient.getAnalyticsOverview(),
  });

  // Fetch tenant growth data (reactive to timePeriod)
  const {
    data: tenantGrowthResponse,
    isLoading: tenantGrowthLoading,
    error: tenantGrowthError,
  } = useQuery({
    queryKey: ['analytics', 'tenants', timePeriod],
    queryFn: () => apiClient.getAnalyticsTenants({ period: String(timePeriodToDays(timePeriod)) }),
  });

  // Fetch plugin usage statistics
  const {
    data: pluginUsageResponse,
    isLoading: pluginUsageLoading,
    error: pluginUsageError,
  } = useQuery({
    queryKey: ['analytics', 'plugins'],
    queryFn: () => apiClient.getAnalyticsPlugins(),
  });

  // Fetch API call metrics (reactive to timePeriod)
  const {
    data: apiCallsResponse,
    isLoading: apiCallsLoading,
    error: apiCallsError,
  } = useQuery({
    queryKey: ['analytics', 'api-calls', timePeriod],
    queryFn: () => apiClient.getAnalyticsApiCalls({ hours: timePeriodToHours(timePeriod) }),
  });

  // Build stats from overview data
  const stats: AnalyticsStats = useMemo(() => {
    const overview = overviewData || {};
    const metrics = apiCallsResponse?.metrics || [];

    // Compute aggregates from API call metrics
    const totalCalls = metrics.reduce(
      (sum: number, m: { totalCalls?: number }) => sum + (m.totalCalls || 0),
      0
    );
    const failedCalls = metrics.reduce(
      (sum: number, m: { failedCalls?: number }) => sum + (m.failedCalls || 0),
      0
    );
    const avgResponseTimes = metrics
      .filter((m: { averageResponseTime?: number }) => m.averageResponseTime != null)
      .map((m: { averageResponseTime: number }) => m.averageResponseTime);
    const avgResponseTime =
      avgResponseTimes.length > 0
        ? Math.round(
            avgResponseTimes.reduce((a: number, b: number) => a + b, 0) / avgResponseTimes.length
          )
        : 0;
    const errorRate = totalCalls > 0 ? Math.round((failedCalls / totalCalls) * 1000) / 10 : 0;

    return {
      totalTenants: overview.totalTenants ?? 0,
      activeTenants: overview.activeTenants ?? 0,
      totalUsers: overview.totalUsers ?? 0,
      totalPlugins: overview.totalPlugins ?? 0,
      apiCalls24h: totalCalls,
      avgResponseTime,
      errorRate,
    };
  }, [overviewData, apiCallsResponse]);

  // Transform tenant growth data to chart format
  const tenantGrowthData: TenantGrowthData[] = useMemo(() => {
    const rawData = tenantGrowthResponse?.data || [];
    return rawData.map((d: { date: string; totalTenants: number }) => ({
      date: d.date,
      count: d.totalTenants,
    }));
  }, [tenantGrowthResponse]);

  // Transform API calls data to chart format
  const apiCallsData: ApiCallsData[] = useMemo(() => {
    const rawMetrics = apiCallsResponse?.metrics || [];
    return rawMetrics.map((m: { period: string; totalCalls: number }) => ({
      hour: new Date(m.period).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
      calls: m.totalCalls || 0,
    }));
  }, [apiCallsResponse]);

  // Plugin usage data
  const plugins: AnalyticsPlugin[] = useMemo(() => {
    return pluginUsageResponse?.plugins || [];
  }, [pluginUsageResponse]);

  // Calculate max values for chart scaling
  const maxTenantGrowth =
    tenantGrowthData.length > 0 ? Math.max(...tenantGrowthData.map((d) => d.count)) : 1;
  const maxApiCalls = apiCallsData.length > 0 ? Math.max(...apiCallsData.map((d) => d.calls)) : 1;

  const isLoading = overviewLoading || tenantGrowthLoading || pluginUsageLoading || apiCallsLoading;
  const error = overviewError || tenantGrowthError || pluginUsageError || apiCallsError;

  return {
    // Data
    stats,
    tenantGrowthData,
    apiCallsData,
    plugins,

    // Time period
    timePeriod,
    setTimePeriod,

    // Chart helpers
    maxTenantGrowth,
    maxApiCalls,

    // Loading state
    isLoading,
    error,
  };
}
