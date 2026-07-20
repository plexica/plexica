// use-kafka-status.ts
// TanStack Query hook for the admin Kafka status endpoint.
// Polls every 15s (refetchInterval) so operators see near-real-time lag + DLQ.
// Data fetching uses TanStack Query only — Rule 3 (one pattern per operation).

import { useQuery } from '@tanstack/react-query';

import { getKafkaStatus } from '../services/admin-api.js';

import type { KafkaStatus } from '../types/admin-types.js';

export function useKafkaStatus() {
  return useQuery<KafkaStatus>({
    queryKey: ['admin', 'kafka', 'status'],
    queryFn: () => getKafkaStatus(),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}
