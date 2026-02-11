// File: apps/web/src/routes/workspace-settings.tsx
// Redirects to /settings — the canonical settings page

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/workspace-settings')({
  beforeLoad: () => {
    throw redirect({ to: '/settings' });
  },
  component: () => null,
});
