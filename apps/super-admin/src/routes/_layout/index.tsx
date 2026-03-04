// File: apps/super-admin/src/routes/_layout/index.tsx
//
// Root index for the _layout group — redirects to /dashboard.
// When a user navigates to '/' while inside the super-admin portal
// they are forwarded to the dashboard.

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_layout/' as never)({
  beforeLoad: () => {
    throw redirect({ to: '/dashboard' as never });
  },
  component: () => null,
});
