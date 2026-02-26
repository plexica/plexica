// apps/web/src/hooks/usePluginHealth.ts
//
// Hook that polls GET /api/v1/plugins/:id/health every 10 seconds.
// Returns the latest health snapshot plus loading / error state.
// Polling stops when the component unmounts (via useEffect cleanup).

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';

export interface PluginHealthData {
  status: 'healthy' | 'unhealthy' | 'starting';
  uptime?: number;
  cpu?: number;
  memory?: number;
  endpoints?: Array<{ path: string; method: string; status: string }>;
}

interface UsePluginHealthResult {
  health: PluginHealthData | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

const POLL_INTERVAL_MS = 10_000;

export function usePluginHealth(pluginId: string | null): UsePluginHealthResult {
  const [health, setHealth] = useState<PluginHealthData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchHealth = useCallback(async () => {
    if (!pluginId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient.getPluginHealth(pluginId);
      setHealth(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch plugin health'));
    } finally {
      setIsLoading(false);
    }
  }, [pluginId]);

  useEffect(() => {
    if (!pluginId) return;

    // Immediate fetch on mount / pluginId change
    fetchHealth();

    const interval = setInterval(fetchHealth, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [pluginId, fetchHealth]);

  return { health, isLoading, error, refetch: fetchHealth };
}
