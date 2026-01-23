# Migration Plan: Aligning apps/super-admin with apps/web Architecture

**Date**: January 23, 2026  
**Branch**: `review/super-admin-complete`  
**Goal**: Align the super-admin frontend architecture with apps/web while preserving unique super-admin functionality

---

## Executive Summary

This document outlines a comprehensive plan to refactor `apps/super-admin` to match the architectural patterns, folder structure, and best practices established in `apps/web`, while maintaining the distinct features required for platform administration.

### Key Differences to Preserve

| Aspect             | apps/web                             | apps/super-admin                 |
| ------------------ | ------------------------------------ | -------------------------------- |
| **Scope**          | Single workspace/tenant              | Cross-tenant platform management |
| **API Headers**    | ✅ `X-Tenant-Slug`, `X-Workspace-ID` | ❌ No tenant headers             |
| **Authentication** | Tenant-specific Keycloak realm       | Platform admin Keycloak realm    |
| **Plugin System**  | ✅ Module Federation                 | ❌ No plugin loading             |
| **User Role**      | Workspace member                     | Platform administrator           |
| **Port**           | 3001                                 | 3002                             |
| **Deployment**     | Public (app.plexica.com)             | Internal/VPN (admin.plexica.com) |

---

## Phase 1: Folder Structure Alignment

### Current Structure (super-admin)

```
apps/super-admin/src/
├── components/
│   ├── views/          # TenantsView, PluginsView, UsersView, AnalyticsView
│   ├── modals/         # TenantDetailModal, PluginDetailModal, etc.
│   ├── AppContent.tsx
│   ├── AuthWrapper.tsx
│   ├── LoginPage.tsx
│   ├── CreateTenantModal.tsx
│   ├── StatCard.tsx
│   ├── TabButton.tsx
│   └── ThemeToggle.tsx
├── contexts/
│   └── ThemeContext.tsx
├── lib/
│   └── api-client.ts
├── types/
│   └── index.ts
├── routes/          # Empty
├── stores/          # Empty
└── views/           # Empty
```

### Target Structure (aligned with web)

```
apps/super-admin/src/
├── routes/              # TanStack Router file-based routes
│   ├── __root.tsx      # Root layout with providers
│   ├── index.tsx       # Dashboard redirect
│   ├── login.tsx       # Login page
│   ├── tenants/
│   │   ├── index.tsx   # Tenants list
│   │   └── $tenantId.tsx  # Tenant detail page
│   ├── plugins/
│   │   ├── index.tsx   # Plugin marketplace
│   │   └── $pluginId.tsx  # Plugin detail page
│   ├── users/
│   │   ├── index.tsx   # Users list
│   │   └── $userId.tsx  # User detail page
│   └── analytics.tsx   # Analytics dashboard
├── components/
│   ├── Layout/
│   │   ├── AppLayout.tsx    # Main app container
│   │   ├── Header.tsx       # Top navigation bar
│   │   └── Sidebar.tsx      # Left navigation
│   ├── providers/
│   │   ├── AuthProvider.tsx      # Keycloak integration
│   │   ├── ProtectedRoute.tsx    # Route protection
│   │   └── ToastProvider.tsx     # Toast notifications
│   ├── tenants/
│   │   ├── TenantList.tsx
│   │   ├── TenantCard.tsx
│   │   ├── CreateTenantModal.tsx
│   │   └── TenantDetailModal.tsx
│   ├── plugins/
│   │   ├── PluginList.tsx
│   │   ├── PluginCard.tsx
│   │   └── PluginDetailModal.tsx
│   ├── users/
│   │   ├── UserList.tsx
│   │   ├── UserCard.tsx
│   │   └── UserDetailModal.tsx
│   ├── analytics/
│   │   ├── AnalyticsDashboard.tsx
│   │   ├── StatCard.tsx
│   │   └── ChartCard.tsx
│   └── ui/
│       └── ThemeToggle.tsx
├── hooks/
│   ├── useForm.ts              # Form validation hook
│   ├── useTenants.ts           # Tenant data hooks
│   ├── usePlugins.ts           # Plugin data hooks
│   └── useUsers.ts             # User data hooks
├── lib/
│   ├── api-client.ts           # Enhanced API client (NO tenant headers)
│   ├── keycloak.ts             # Keycloak admin auth
│   ├── config.ts               # Environment config
│   └── utils.ts                # Utilities
├── stores/
│   └── auth-store.ts           # Zustand auth store
├── types/
│   └── index.ts                # TypeScript types
├── contexts/
│   └── ThemeContext.tsx        # Theme management
├── App.tsx
├── main.tsx
├── index.css
└── routeTree.gen.ts            # Auto-generated
```

### Migration Tasks

**1.1 Create Layout Components**

- [ ] Create `components/Layout/AppLayout.tsx` (based on web, without workspace switcher)
- [ ] Create `components/Layout/Header.tsx` (super-admin specific: no workspace selector, add platform stats)
- [ ] Create `components/Layout/Sidebar.tsx` (navigation: Tenants, Plugins, Users, Analytics, Settings)

**1.2 Reorganize Components by Feature**

- [ ] Move `components/views/TenantsView.tsx` → `routes/tenants/index.tsx`
- [ ] Create `components/tenants/TenantList.tsx` (extract list logic from TenantsView)
- [ ] Create `components/tenants/TenantCard.tsx` (extract card component)
- [ ] Move `components/modals/CreateTenantModal.tsx` → `components/tenants/CreateTenantModal.tsx`
- [ ] Move `components/modals/TenantDetailModal.tsx` → `components/tenants/TenantDetailModal.tsx`

**1.3 Repeat for Other Features**

- [ ] Reorganize plugins components
- [ ] Reorganize users components
- [ ] Reorganize analytics components

**1.4 Create Providers Directory**

- [ ] Create `components/providers/AuthProvider.tsx` (replace `AuthWrapper.tsx`)
- [ ] Create `components/providers/ProtectedRoute.tsx`
- [ ] Create `components/providers/ToastProvider.tsx`

**1.5 Create Hooks Directory**

- [ ] Create `hooks/useForm.ts` (copy from web, adapt if needed)
- [ ] Create `hooks/useTenants.ts` (extract React Query logic from TenantsView)
- [ ] Create `hooks/usePlugins.ts`
- [ ] Create `hooks/useUsers.ts`
- [ ] Create `hooks/useAnalytics.ts`

---

## Phase 2: Routing Migration (TanStack Router)

### Current State

- Tab-based navigation using local state (`activeTab`)
- No URL routing
- No deep linking support
- Modals handle "detail pages"

### Target State

- File-based routing with TanStack Router
- URL-based navigation
- Deep linking to detail pages
- Proper route protection

### Migration Tasks

**2.1 Install and Configure TanStack Router**

- [ ] Already installed: `@tanstack/react-router@^1.153.2` ✅
- [ ] Add `@tanstack/router-plugin` to `vite.config.ts`
- [ ] Create `tsr.config.json` with route configuration
- [ ] Add route generation script to `package.json`

**2.2 Create Root Route**

```typescript
// routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { AuthProvider } from '@/components/providers/AuthProvider';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { ThemeProvider } from '@/contexts/ThemeContext';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <Outlet />
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
```

**2.3 Create Route Files**

- [ ] `routes/index.tsx` - Dashboard/redirect
- [ ] `routes/login.tsx` - Login page
- [ ] `routes/tenants/index.tsx` - Tenants list (protected)
- [ ] `routes/tenants/$tenantId.tsx` - Tenant detail (protected)
- [ ] `routes/plugins/index.tsx` - Plugin marketplace (protected)
- [ ] `routes/plugins/$pluginId.tsx` - Plugin detail (protected)
- [ ] `routes/users/index.tsx` - Users list (protected)
- [ ] `routes/users/$userId.tsx` - User detail (protected)
- [ ] `routes/analytics.tsx` - Analytics dashboard (protected)
- [ ] `routes/settings.tsx` - Platform settings (protected)

**2.4 Implement Route Protection**

```typescript
// Example: routes/tenants/index.tsx
import { createFileRoute } from '@tanstack/react-router';
import { ProtectedRoute } from '@/components/providers/ProtectedRoute';
import { TenantList } from '@/components/tenants/TenantList';

export const Route = createFileRoute('/tenants/')({
  component: () => (
    <ProtectedRoute requiredRole="super-admin">
      <TenantList />
    </ProtectedRoute>
  ),
});
```

**2.5 Update Navigation**

- [ ] Replace `TabButton` with `<Link>` from TanStack Router
- [ ] Update `Sidebar.tsx` to use route-based active state
- [ ] Remove `activeTab` state from `AppContent.tsx`

**2.6 Convert Modals to Detail Pages**

- [ ] Option A: Keep modals for quick actions (create, edit)
- [ ] Option B: Create full detail pages for tenants/plugins/users
- [ ] Recommended: Hybrid approach - modals for CRUD, detail pages for viewing

---

## Phase 3: Authentication Migration (Keycloak)

### Current State

- Mock authentication using localStorage
- Demo credentials: `admin@plexica.com` / `admin`
- No real SSO integration

### Target State

- Keycloak SSO for super-admin realm
- Automatic token refresh
- Secure token storage (sessionStorage)
- Role-based access control

### Migration Tasks

**3.1 Create Keycloak Configuration**

- [ ] Create `lib/keycloak.ts` (based on web, adapted for super-admin)

```typescript
// lib/keycloak.ts
import Keycloak from 'keycloak-js';

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL,
  realm: 'plexica-admin', // Super-admin realm (NOT tenant-specific)
  clientId: 'super-admin-app',
});

export const initKeycloak = async () => {
  try {
    const authenticated = await keycloak.init({
      onLoad: 'check-sso',
      silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
      pkceMethod: 'S256',
    });

    if (authenticated) {
      // Start token refresh interval (every 60 seconds)
      setInterval(() => {
        keycloak.updateToken(70).catch(() => {
          console.error('Failed to refresh token');
        });
      }, 60000);
    }

    return authenticated;
  } catch (error) {
    console.error('Keycloak init failed:', error);
    return false;
  }
};

export default keycloak;
```

**3.2 Create AuthProvider**

- [ ] Create `components/providers/AuthProvider.tsx`
- [ ] Initialize Keycloak on mount
- [ ] Handle authentication state
- [ ] Provide auth context to app

**3.3 Update API Client**

- [ ] Modify `lib/api-client.ts` to use Keycloak token
- [ ] Ensure NO `X-Tenant-Slug` header is added
- [ ] Add request interceptor for token injection
- [ ] Add response interceptor for 401 handling

```typescript
// lib/api-client.ts - Key difference from web
this.client.interceptors.request.use((config) => {
  if (keycloak.token) {
    config.headers.Authorization = `Bearer ${keycloak.token}`;
  }
  // IMPORTANT: NO X-Tenant-Slug header in super-admin
  // This is a platform-wide admin interface
  return config;
});
```

**3.4 Create ProtectedRoute Component**

- [ ] Create `components/providers/ProtectedRoute.tsx`
- [ ] Check authentication state
- [ ] Verify super-admin role
- [ ] Redirect to login if unauthorized

**3.5 Update Login Page**

- [ ] Modify `routes/login.tsx` to trigger Keycloak login
- [ ] Remove demo credentials form
- [ ] Add SSO button

**3.6 Environment Variables**

- [ ] Add `VITE_KEYCLOAK_URL` to `.env`
- [ ] Add `VITE_KEYCLOAK_REALM=plexica-admin`
- [ ] Add `VITE_KEYCLOAK_CLIENT_ID=super-admin-app`

---

## Phase 4: State Management Enhancement

### Current State

- React Query for server state ✅
- React Context for theme ✅
- localStorage for auth (mock)
- No Zustand store

### Target State

- React Query for server state ✅
- Zustand for auth state (aligned with web)
- React Context for theme ✅
- Secure token storage

### Migration Tasks

**4.1 Create Auth Store**

- [ ] Create `stores/auth-store.ts` (based on web, adapted for super-admin)

```typescript
// stores/auth-store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setAuth: (user: User, token: string) => void;
  clearAuth: () => void;
  refreshUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: true,

      setAuth: (user, token) => {
        set({ user, token, isAuthenticated: true, isLoading: false });
      },

      clearAuth: () => {
        sessionStorage.removeItem('kc_token');
        set({ user: null, token: null, isAuthenticated: false, isLoading: false });
      },

      refreshUser: async () => {
        // Fetch user from Keycloak or API
      },
    }),
    {
      name: 'super-admin-auth-storage',
      partialize: (state) => ({
        user: state.user,
        // Note: token stored in sessionStorage, not persisted here
      }),
    }
  )
);
```

**4.2 Integrate Auth Store with Keycloak**

- [ ] Update `AuthProvider.tsx` to use `useAuthStore`
- [ ] Store token in sessionStorage (not localStorage)
- [ ] Validate token expiry on app load
- [ ] Handle logout across tabs

**4.3 Optional: Create Other Stores**

- [ ] Consider `ui-store.ts` for global UI state (sidebar collapsed, etc.)
- [ ] Consider `settings-store.ts` for platform settings cache

---

## Phase 5: Configuration and Utilities

### Migration Tasks

**5.1 Create Configuration File**

- [ ] Create `lib/config.ts` (based on web)

```typescript
// lib/config.ts
interface Config {
  apiUrl: string;
  keycloakUrl: string;
  keycloakRealm: string;
  keycloakClientId: string;
  isDevelopment: boolean;
  isProduction: boolean;
}

const config: Config = {
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  keycloakUrl: import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080',
  keycloakRealm: 'plexica-admin', // Fixed realm for super-admin
  keycloakClientId: 'super-admin-app',
  isDevelopment: import.meta.env.MODE === 'development',
  isProduction: import.meta.env.MODE === 'production',
};

// Validate required environment variables
const requiredEnvVars = ['VITE_API_URL', 'VITE_KEYCLOAK_URL'];
requiredEnvVars.forEach((varName) => {
  if (!import.meta.env[varName]) {
    console.warn(`Missing environment variable: ${varName}`);
  }
});

export default config;
```

**5.2 Create Utilities**

- [ ] Create `lib/utils.ts` with `cn()` function (Tailwind class merging)
- [ ] Create `lib/secure-storage.ts` for token storage (sessionStorage wrapper)

**5.3 Update Environment Variables**

- [ ] Update `.env.example` with all required variables
- [ ] Add `VITE_API_URL=http://localhost:3000`
- [ ] Add `VITE_KEYCLOAK_URL=http://localhost:8080`

---

## Phase 6: Update Configuration Files

### Migration Tasks

**6.1 Update Vite Configuration**

- [ ] Add TanStack Router plugin to `vite.config.ts`

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    TanStackRouterVite(), // Must be before React plugin
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  server: {
    port: 3002,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
```

**6.2 Create TanStack Router Config**

- [ ] Create `tsr.config.json`

```json
{
  "routesDirectory": "./src/routes",
  "generatedRouteTree": "./src/routeTree.gen.ts",
  "routeFileIgnorePrefix": "_",
  "quoteStyle": "single"
}
```

**6.3 Update package.json Scripts**

- [ ] Update dev script to include route generation

```json
{
  "scripts": {
    "dev": "vite --port 3002",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "type-check": "tsc --noEmit"
  }
}
```

---

## Phase 7: Theme and Styling Alignment

### Current State

- Tailwind CSS v4 ✅
- Custom CSS variables for theming ✅
- ThemeContext for light/dark/system modes ✅

### Target State

- Match web app's color system
- Consistent spacing and typography
- Shared component styles via `@plexica/ui`

### Migration Tasks

**7.1 Align CSS Variables**

- [ ] Review `index.css` variables
- [ ] Ensure consistency with `apps/web/src/index.css`
- [ ] Add any missing color tokens

**7.2 Update Tailwind Config**

- [ ] Compare `tailwind.config.js` with web
- [ ] Ensure same font family (JetBrains Mono Variable)
- [ ] Match border radius, spacing, etc.

**7.3 Use Shared UI Components**

- [ ] Audit current component usage
- [ ] Replace custom components with `@plexica/ui` where possible
- [ ] Ensure Button, Card, Input, Badge, Label are from shared library

---

## Phase 8: Testing and Documentation

### Migration Tasks

**8.1 Testing**

- [ ] Test authentication flow with Keycloak
- [ ] Test all routes and navigation
- [ ] Test protected routes (redirect to login)
- [ ] Test super-admin role enforcement
- [ ] Test theme switching
- [ ] Test all CRUD operations (tenants, plugins, users)
- [ ] Test error states and loading states
- [ ] Test responsive design

**8.2 Documentation**

- [ ] Update `README.md` with new architecture
- [ ] Document environment variables
- [ ] Document Keycloak setup for super-admin realm
- [ ] Add architectural decision records (ADRs) for key choices
- [ ] Update development setup guide

**8.3 Cleanup**

- [ ] Remove old files (`AppContent.tsx`, `AuthWrapper.tsx`, `TabButton.tsx`)
- [ ] Remove unused dependencies
- [ ] Remove empty directories (`views/`, if empty)
- [ ] Update imports throughout codebase

---

## Phase 9: Advanced Features (Future)

These features align with web but may be implemented later:

**9.1 Advanced Analytics**

- [ ] Real-time dashboard with WebSocket updates
- [ ] Advanced charts (recharts or similar library)
- [ ] Export functionality (CSV, PDF)

**9.2 Audit Logging**

- [ ] Track all admin actions
- [ ] Display audit log in UI
- [ ] Filter and search audit events

**9.3 Platform Settings**

- [ ] Global platform configuration
- [ ] Email templates management
- [ ] Feature flags administration

**9.4 Advanced User Management**

- [ ] Bulk user operations
- [ ] User impersonation
- [ ] Permission management UI

---

## Migration Checklist Summary

### Critical Path (Must Have for MVP)

- [x] ✅ Phase 1: Folder structure alignment
- [x] ✅ Phase 2: TanStack Router integration
- [x] ✅ Phase 3: Keycloak authentication
- [x] ✅ Phase 4: Zustand auth store
- [x] ✅ Phase 5: Configuration and utilities
- [x] ✅ Phase 6: Update config files
- [x] ✅ Phase 7: Theme and styling alignment
- [x] ✅ Phase 8: Testing and documentation

### Nice to Have (Post-MVP)

- [ ] Phase 9: Advanced features

---

## Key Architectural Decisions

### ADR-001: No Plugin System in Super-Admin

**Decision**: Do not implement Module Federation in super-admin  
**Rationale**: Super-admin is a trusted, internal tool. No need for dynamic plugin loading.  
**Status**: Accepted

### ADR-002: No Tenant Context in API Calls

**Decision**: Never send `X-Tenant-Slug` or `X-Workspace-ID` headers  
**Rationale**: Super-admin operates at platform level, not tenant level  
**Status**: Accepted

### ADR-003: Separate Keycloak Realm

**Decision**: Use dedicated `plexica-admin` realm for super-admin  
**Rationale**: Isolate platform admin credentials from tenant users  
**Status**: Accepted

### ADR-004: File-Based Routing

**Decision**: Migrate from tab-based to file-based routing with TanStack Router  
**Rationale**: Enables deep linking, better UX, consistency with web app  
**Status**: Accepted

### ADR-005: Hybrid Modal + Detail Pages

**Decision**: Use modals for quick actions (create, edit), detail pages for viewing  
**Rationale**: Balance between quick actions and detailed information display  
**Status**: Proposed

---

## Risk Assessment

| Risk                            | Impact | Mitigation                                    |
| ------------------------------- | ------ | --------------------------------------------- |
| Breaking existing functionality | High   | Thorough testing, feature parity checklist    |
| Authentication migration issues | High   | Keep mock auth as fallback during development |
| Routing complexity              | Medium | Follow web app patterns, extensive testing    |
| Data loss during migration      | Medium | No data changes, only UI refactor             |
| Timeline overrun                | Low    | Phased approach, can ship incremental changes |

---

## Success Criteria

✅ **Architecture Alignment**

- Folder structure matches apps/web pattern
- Same routing library (TanStack Router)
- Same state management approach (Zustand + React Query)
- Same authentication library (Keycloak)

✅ **Functionality Preserved**

- All existing features work (tenants, plugins, users, analytics)
- No regressions in CRUD operations
- Theme switching works
- Search and filters work

✅ **Code Quality**

- TypeScript strict mode with no errors
- ESLint passes with no warnings
- Consistent code style with apps/web
- Proper error handling and loading states

✅ **Developer Experience**

- Clear folder structure
- Easy to add new features
- Good documentation
- Hot module reload works

✅ **Performance**

- Fast page loads
- Smooth navigation
- No unnecessary re-renders
- Proper code splitting

---

## Timeline Estimate

| Phase                     | Estimated Time | Complexity      |
| ------------------------- | -------------- | --------------- |
| Phase 1: Folder structure | 2-3 days       | Medium          |
| Phase 2: Routing          | 2-3 days       | Medium          |
| Phase 3: Authentication   | 3-4 days       | High            |
| Phase 4: State management | 1-2 days       | Low             |
| Phase 5: Config/utilities | 1 day          | Low             |
| Phase 6: Config files     | 1 day          | Low             |
| Phase 7: Theme alignment  | 1 day          | Low             |
| Phase 8: Testing/docs     | 2-3 days       | Medium          |
| **Total**                 | **13-20 days** | **Medium-High** |

---

## Next Steps

1. **Review this plan** with the team
2. **Prioritize phases** based on business needs
3. **Create detailed tasks** for Phase 1
4. **Set up development branch** (already done: `review/super-admin-complete`)
5. **Begin implementation** with Phase 1

---

_Migration Plan v1.0_  
_Author: Plexica Engineering Team_  
_Last Updated: January 23, 2026_
