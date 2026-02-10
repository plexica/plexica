// apps/super-admin/src/hooks/useAnalytics.ts

import { useState } from 'react';
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

export function useAnalytics() {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('7d');

  // Fetch tenants
  const { data: tenantsData } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => apiClient.getTenants(),
  });

  // Fetch plugins
  const { data: pluginsData } = useQuery({
    queryKey: ['plugins'],
    queryFn: () => apiClient.getPlugins(),
  });

  const tenants = tenantsData?.tenants || [];
  const plugins = pluginsData?.plugins || [];

  // NOTE: Using mock data for analytics
  // In production, these would be separate API endpoints:
  // - /api/admin/analytics/overview
  // - /api/admin/analytics/tenants
  // - /api/admin/analytics/api-calls
  // - /api/admin/analytics/plugins

  const stats: AnalyticsStats = {
    totalTenants: tenants.length,
    activeTenants: tenants.filter((t: any) => t.status === 'ACTIVE').length,
    totalUsers: 5, // From mock users
    totalPlugins: plugins.length,
    apiCalls24h: 12543,
    avgResponseTime: 45, // ms
    errorRate: 0.2, // %
  };

  // Mock tenant growth data
  const tenantGrowthData: TenantGrowthData[] = [
    { date: '2026-01-08', count: 1 },
    { date: '2026-01-09', count: 2 },
    { date: '2026-01-10', count: 3 },
    { date: '2026-01-11', count: 3 },
    { date: '2026-01-12', count: 4 },
    { date: '2026-01-13', count: 4 },
    { date: '2026-01-14', count: 4 },
  ];

  // Mock API calls data
  const apiCallsData: ApiCallsData[] = [
    { hour: '00:00', calls: 450 },
    { hour: '04:00', calls: 320 },
    { hour: '08:00', calls: 890 },
    { hour: '12:00', calls: 1250 },
    { hour: '16:00', calls: 1680 },
    { hour: '20:00', calls: 980 },
  ];

  // Calculate max values for chart scaling
  const maxTenantGrowth = Math.max(...tenantGrowthData.map((d) => d.count));
  const maxApiCalls = Math.max(...apiCallsData.map((d) => d.calls));

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
    isLoading: false, // Mock data, no loading
    error: null,
  };
}
