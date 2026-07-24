import { QueryClient } from '@tanstack/react-query';

import { registerAuthQueryCacheClear } from './auth-query-cache.js';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5 * 60 * 1_000 },
  },
});

registerAuthQueryCacheClear(() => queryClient.clear());
