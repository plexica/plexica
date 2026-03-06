// apps/web/src/test/mocks/handlers.ts
//
// MSW request handlers for unit and integration tests (T010-30).
//
// Usage:
//   import { handlers } from '@/test/mocks/handlers';
//   server.use(...handlers);   // apply all defaults
//   server.use(http.get(...)); // override individual routes per-test

import { http, HttpResponse } from 'msw';
import type { TenantTheme } from '@/lib/theme-utils.js';

// ---------------------------------------------------------------------------
// Default theme fixture
// ---------------------------------------------------------------------------

export const DEFAULT_MOCK_THEME: TenantTheme = {
  logo: 'https://cdn.example.com/logos/acme.png',
  colors: {
    primary: '#1976d2',
    secondary: '#dc004e',
    background: '#ffffff',
    surface: '#f5f5f5',
    text: '#212121',
    textSecondary: '#757575',
    error: '#f44336',
    success: '#4caf50',
    warning: '#ff9800',
  },
  fonts: {
    heading: 'inter',
    body: 'roboto',
    mono: 'roboto-mono',
  },
};

// ---------------------------------------------------------------------------
// Tenant settings handler (theme fetch)
// ---------------------------------------------------------------------------

export const tenantSettingsHandler = http.get('/api/v1/tenant/settings', () =>
  HttpResponse.json({
    tenantId: 'test-tenant',
    settings: {
      theme: DEFAULT_MOCK_THEME,
    },
  })
);

// ---------------------------------------------------------------------------
// Auth handlers
// ---------------------------------------------------------------------------

export const authRefreshHandler = http.post('/api/v1/auth/refresh', () =>
  HttpResponse.json({
    access_token: 'mock-access-token',
    refresh_token: 'mock-refresh-token',
    expires_in: 3600,
  })
);

export const authLogoutHandler = http.post('/api/v1/auth/logout', () =>
  HttpResponse.json({ success: true })
);

// ---------------------------------------------------------------------------
// Plugin handlers
// ---------------------------------------------------------------------------

export const pluginsListHandler = http.get('/api/v1/plugins', () =>
  HttpResponse.json({
    plugins: [
      {
        id: 'plugin-crm',
        name: 'CRM',
        version: '1.0.0',
        status: 'active',
        remoteUrl: 'http://localhost:5001/remoteEntry.js',
      },
    ],
    total: 1,
  })
);

export const pluginByIdHandler = http.get('/api/v1/plugins/:pluginId', ({ params }) =>
  HttpResponse.json({
    id: params.pluginId,
    name: 'CRM',
    version: '1.0.0',
    status: 'active',
    remoteUrl: 'http://localhost:5001/remoteEntry.js',
  })
);

// ---------------------------------------------------------------------------
// Notification handlers
// ---------------------------------------------------------------------------

export const notificationsHandler = http.get('/api/v1/notifications', () =>
  HttpResponse.json({ notifications: [], unreadCount: 0 })
);

// ---------------------------------------------------------------------------
// Default handler set — used in setupTests.ts
// ---------------------------------------------------------------------------

export const handlers = [
  tenantSettingsHandler,
  authRefreshHandler,
  authLogoutHandler,
  pluginsListHandler,
  pluginByIdHandler,
  notificationsHandler,
];
