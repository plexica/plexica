// main.tsx — React application entry point for the admin app.
// Wraps the app in QueryClientProvider, IntlProvider, and RouterProvider.
// No Module Federation host role (standalone app, plan D-2).

import React from 'react';
import { createRoot } from 'react-dom/client';
import { IntlProvider } from 'react-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';

import { messages } from './i18n/messages.en.js';
import { router } from './router.js';
import { SessionExpiredHandler } from './components/auth/session-expired-handler.js';

import '@plexica/ui/tokens';
import './styles/globals.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5 * 60 * 1_000 },
  },
});

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('Root element #root not found in DOM');
}

createRoot(rootElement).render(
  <React.StrictMode>
    <IntlProvider locale="en" messages={messages}>
      <QueryClientProvider client={queryClient}>
        <SessionExpiredHandler />
        <RouterProvider router={router} />
      </QueryClientProvider>
    </IntlProvider>
  </React.StrictMode>
);
