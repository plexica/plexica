// File: apps/web/src/routes/admin.index.tsx
//
// Tenant Admin root index — redirects to /admin/dashboard (Spec 008 T008-39).
// When a user navigates to '/admin' they are forwarded to the dashboard screen.

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/admin/' as never)({
  beforeLoad: () => {
    throw redirect({ to: '/admin/dashboard' as never });
  },
  component: () => null,
});
