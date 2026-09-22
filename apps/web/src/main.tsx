// main.tsx — React application entry point.
// Wraps the app in QueryClientProvider, IntlMessageProvider, and RouterProvider.
//
// QueryClientProvider is OUTSIDE the IntlProvider wrapper so the message merge
// (which loads tenant overrides via TanStack Query) can run — see
// components/i18n/intl-message-provider.tsx. The provider re-renders in place
// on locale change (NFR-006-3: full UI update < 500ms, no page reload).

import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { ToastProvider, ToastViewport } from '@plexica/ui';

import { IntlMessageProvider } from './components/i18n/intl-message-provider.js';
import { router } from './router.js';
import { SessionExpiredHandler } from './components/auth/session-expired-handler.js';
import { queryClient } from './services/query-client.js';

import '@plexica/ui/tokens';
import './styles/globals.css';

const rootElement = document.getElementById('root');
if (rootElement === null) {
  throw new Error('Root element #root not found in DOM');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <IntlMessageProvider>
        <ToastProvider>
          <SessionExpiredHandler />
          <RouterProvider router={router} />
        </ToastProvider>
        <ToastViewport />
      </IntlMessageProvider>
    </QueryClientProvider>
  </React.StrictMode>
);