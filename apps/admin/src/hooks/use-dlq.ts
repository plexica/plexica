// use-dlq.ts — TanStack Query hooks for DLQ management (S5-901).
// List, retry, dismiss dead letter queue entries.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { listDlq, retryDlqEntry, dismissDlqEntry, type ListDlqParams } from '../services/admin-api.js';

export function useDlqEntries(params: ListDlqParams = {}) {
  return useQuery({
    queryKey: ['dlq', params],
    queryFn: () => listDlq(params),
  });
}

export function useRetryDlq() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => retryDlqEntry(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dlq'] });
      void queryClient.invalidateQueries({ queryKey: ['kafka-status'] });
    },
  });
}

export function useDismissDlq() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dismissDlqEntry(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dlq'] });
      void queryClient.invalidateQueries({ queryKey: ['kafka-status'] });
    },
  });
}
