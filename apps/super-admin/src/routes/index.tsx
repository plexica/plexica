// File: apps/super-admin/src/routes/index.tsx

import { createFileRoute, Navigate } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: IndexPage,
});

function IndexPage() {
  // Redirect to tenants page (main dashboard)
  return <Navigate to="/tenants" />;
}
