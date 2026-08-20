// main.tsx — React application entry point.
// Wraps the app in QueryClientProvider, IntlProvider, and RouterProvider.

import React from 'react';
import ReactDOM from 'react-dom/client';
import { IntlProvider } from 'react-intl';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { ToastProvider, ToastViewport } from '@plexica/ui';

import { messages } from './i18n/messages.en.js';
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
    <IntlProvider locale="en" messages={messages}>
      <ToastProvider>
        <QueryClientProvider client={queryClient}>
          <SessionExpiredHandler />
          <RouterProvider router={router} />
        </QueryClientProvider>
        <ToastViewport />
      </ToastProvider>
    </IntlProvider>
  </React.StrictMode>
);
