// token-refresh-provider.tsx
// Mounts the useTokenRefresh hook at the application root.
// Must be rendered inside QueryClientProvider so that any downstream
// TanStack Query invalidation triggered by a refresh is available.

import { useTokenRefresh } from '../../hooks/use-token-refresh.js';

export function TokenRefreshProvider(): null {
  useTokenRefresh();
  return null;
}
