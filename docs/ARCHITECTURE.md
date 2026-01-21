# Plexica Frontend Architecture

## Overview

This document describes the complete frontend architecture of Plexica, a multi-tenant SaaS platform with a plugin-based extensibility system. The frontend consists of a modern React application with Keycloak authentication, URL-based multi-tenancy, and Module Federation for dynamic plugin loading.

**Last Updated**: January 2026  
**Current Status**: M2.1 Complete - Production Ready

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Authentication System](#authentication-system)
3. [Multi-Tenant Context Management](#multi-tenant-context-management)
4. [Module Federation & Plugin System](#module-federation--plugin-system)
5. [Routing Architecture](#routing-architecture)
6. [State Management](#state-management)
7. [Layout Components](#layout-components)
8. [Application Pages](#application-pages)
9. [API Integration](#api-integration)
10. [Security Considerations](#security-considerations)

---

## System Architecture

### Application Structure

Plexica has **two separate frontend applications**:

```
apps/
├── core-api/           ← Backend API (port 3000)
├── web/                ← Tenant User Frontend (port 3001) ✅ PRODUCTION READY
└── super-admin/        ← Super-Admin Frontend (port 3002) ⏳ PLANNED
```

### Why Two Separate Apps?

**Security Isolation**:

- Super-admin app **never exposed** to tenant users
- No risk of privilege escalation
- Complete separation of concerns

**Deployment Separation**:

- **Tenant App**: `app.plexica.com` (public)
- **Admin App**: `admin.plexica.com` (internal/VPN only)
- Different security policies and access controls

**Code Separation**:

- Tenant app doesn't load admin code (smaller bundle)
- Admin app doesn't load tenant plugins
- Each optimized for its use case

**Different Design Systems**:

- **Tenant App**: Modern, friendly, product-focused
- **Admin App**: Data-dense, technical, operational

### Technology Stack

```json
{
  "framework": "React 18.3.1",
  "language": "TypeScript 5.3.3",
  "build": "Vite 5.4.11",
  "routing": "TanStack Router 1.95.0",
  "state": "Zustand + TanStack Query 5.62.0",
  "styling": "Tailwind CSS 3.4.1",
  "auth": "Keycloak JS 23.0.0",
  "plugins": "Module Federation (@originjs/vite-plugin-federation)"
}
```

### File Structure

```
apps/web/
├── src/
│   ├── components/
│   │   ├── Layout/
│   │   │   ├── AppLayout.tsx         # Main layout wrapper
│   │   │   ├── Header.tsx            # Top header with user menu
│   │   │   └── Sidebar.tsx           # Left sidebar navigation
│   │   ├── AuthProvider.tsx          # Authentication context
│   │   └── ProtectedRoute.tsx        # Route protection
│   ├── lib/
│   │   ├── api-client.ts             # API HTTP client
│   │   ├── keycloak.ts               # Keycloak integration
│   │   ├── tenant.ts                 # Tenant URL extraction
│   │   └── plugin-loader.ts          # Plugin loader service
│   ├── routes/
│   │   ├── __root.tsx                # Root route
│   │   ├── index.tsx                 # Dashboard home
│   │   ├── login.tsx                 # Login page
│   │   ├── plugins.tsx               # Plugin management
│   │   ├── team.tsx                  # Team management
│   │   └── settings.tsx              # Workspace settings
│   ├── stores/
│   │   └── auth-store.ts             # Auth state management
│   ├── types/
│   │   ├── index.ts                  # App type definitions
│   │   └── module-federation.d.ts    # Module Federation types
│   └── main.tsx                      # App entry point
├── vite.config.ts                    # Vite + Module Federation config
└── .env                              # Environment variables
```

---

## Authentication System

### Keycloak SSO Integration

Plexica uses **Keycloak** for authentication with OpenID Connect (OIDC) protocol.

#### Authentication Flow

```
1. User visits http://localhost:3001 (or tenant URL)
2. AuthProvider initializes Keycloak
3. If not authenticated → redirect to /login
4. User clicks "Sign in with Keycloak"
5. Redirect to Keycloak: http://localhost:8080/realms/tenant-realm/...
6. User enters credentials
7. Keycloak validates and creates session
8. Redirect back with authorization code
9. Frontend exchanges code for tokens (PKCE)
10. Fetch user info from Keycloak
11. Store user + token in auth store
12. Redirect to home page (protected)
13. Display user information
```

#### Key Files

**`lib/keycloak.ts`** (84 lines):

- Keycloak JS adapter initialization
- PKCE flow support
- Token management with auto-refresh
- User role checking
- Dynamic realm configuration based on tenant

```typescript
// Keycloak config is dynamic based on tenant
function createKeycloakConfig(): KeycloakConfig {
  const tenantSlug = getTenantFromUrl();
  const realm = getRealmForTenant(tenantSlug); // e.g., "tenant1-realm"
  return {
    url: import.meta.env.VITE_KEYCLOAK_URL,
    realm,
    clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID,
  };
}
```

**`components/AuthProvider.tsx`** (99 lines):

- React context for authentication state
- Keycloak initialization on app load
- User info fetching and storage
- Loading state management
- Tenant detection and redirect logic

**`components/ProtectedRoute.tsx`** (47 lines):

- Route protection component
- Role-based access control
- Automatic redirect to login
- Tenant requirement check
- Access denied page

#### Environment Variables

```env
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_KEYCLOAK_CLIENT_ID=plexica-web
VITE_DEFAULT_TENANT=test-tenant
VITE_BASE_DOMAIN=plexica.app
```

#### Token Management

- **Access Token**: Stored in Zustand with localStorage persistence
- **Refresh Token**: Automatically handled by Keycloak JS
- **Auto Refresh**: Configured for 70% of token lifetime
- **Token Injection**: Automatically added to API requests via axios interceptors

#### Architecture Decisions

1. **Keycloak JS over OIDC Client**
   - Better Keycloak integration, simpler setup
   - Auto-refresh built-in
   - Silent SSO check support

2. **Context + Zustand Hybrid**
   - AuthProvider (React Context): For authentication methods (login, logout, hasRole)
   - Zustand Store: For persistent state (user, token, tenant)
   - Rationale: Context for behavior, Zustand for data

3. **PKCE Flow**
   - Enhanced security for public clients
   - No client secret needed
   - Recommended by OAuth 2.1

---

## Multi-Tenant Context Management

### URL-Based Multi-Tenancy

Plexica uses **URL-based tenant identification**:

- Each tenant has a **unique subdomain**: `tenant1.plexica.app`, `tenant2.plexica.app`
- Each tenant has a **dedicated Keycloak realm**: `tenant1-realm`, `tenant2-realm`
- Tenant is **automatically detected from URL** - no manual selection after login
- Users authenticate to their tenant's specific realm

### Tenant Detection

**File**: `lib/tenant.ts`

```typescript
// Extracts tenant from URL subdomain
getTenantFromUrl(): string
// Example: tenant1.plexica.app → 'tenant1'
// Example: localhost → 'default' (from VITE_DEFAULT_TENANT)

// Generates Keycloak realm for tenant
getRealmForTenant(tenantSlug): string
// Example: 'tenant1' → 'tenant1-realm'
```

### Tenant Selection Flow

```
1. User authenticates with Keycloak
2. AuthProvider checks if tenant is selected
3. Tenant automatically detected from URL
4. Fetch tenant info from backend API
5. Store tenant in auth store
6. Configure API client with tenant slug
7. Redirect to dashboard
```

### Tenant Context in API Calls

All API requests automatically include tenant context:

```typescript
Headers: {
  Authorization: "Bearer <jwt>",
  X-Tenant-Slug: "tenant1"  // ← Automatically added by API client
}
```

### Auth Store Enhancement

```typescript
setTenant: (tenant) => {
  apiClient.setTenantSlug(tenant.slug);
  set((state) => ({
    tenant,
    user: state.user ? { ...state.user, tenantId: tenant.id } : null,
  }));
};
```

### Multi-Tenant Isolation

- Each tenant URL maps to separate Keycloak realm
- Complete data isolation per tenant
- Workspace data filtered by tenant context
- No cross-tenant data leakage

---

## Module Federation & Plugin System

### Module Federation Setup

**Configuration**: `vite.config.ts`

```typescript
import federation from '@originjs/vite-plugin-federation';

export default defineConfig({
  plugins: [
    federation({
      name: 'plexica-shell',
      remotes: {
        // Dynamic remotes loaded at runtime
      },
      shared: ['react', 'react-dom', '@tanstack/react-router', '@tanstack/react-query'],
    }),
  ],
});
```

### Plugin Loader Service

**File**: `lib/plugin-loader.ts` (231 lines)

**Features**:

- Dynamic plugin loading from remote URLs
- Plugin manifest management
- Route registration from plugins
- Menu item registration
- Plugin lifecycle management (load/unload)
- Error handling and retry logic
- Singleton service pattern

**API**:

```typescript
// Load a single plugin
await pluginLoader.loadPlugin(manifest);

// Load all tenant plugins
await pluginLoader.loadTenantPlugins(tenantPlugins);

// Unload a plugin
await pluginLoader.unloadPlugin(pluginId);

// Get loaded plugins
const plugins = pluginLoader.getLoadedPlugins();
```

### Plugin Manifest Structure

```typescript
interface PluginManifest {
  id: string;
  name: string;
  version: string;
  remoteEntry: string; // URL to remoteEntry.js
  routes?: PluginRoute[];
  menuItems?: PluginMenuItem[];
}
```

### Plugin Loading Flow

```
1. User selects workspace → Fetch tenant plugins from API
2. Filter active plugins → Get plugin configurations
3. For each plugin:
   a. Construct plugin manifest (id, name, version, remoteEntry URL)
   b. Call pluginLoader.loadPlugin(manifest)
   c. Inject <script> tag with remoteEntry.js
   d. Initialize plugin container
   e. Load plugin module
   f. Register routes in router
   g. Register menu items in sidebar
4. Plugin now accessible via routes and sidebar menu
```

### Module Federation Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Plexica Shell (Host)                   │
│                    Port: 3001                            │
│                                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │              Plugin Loader Service               │   │
│  │  - Load remote plugins dynamically               │   │
│  │  - Register routes                               │   │
│  │  - Register menu items                           │   │
│  └─────────────────────────────────────────────────┘   │
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Plugin A   │  │   Plugin B   │  │   Plugin C   │  │
│  │  (Remote 1)  │  │  (Remote 2)  │  │  (Remote 3)  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                           │
│  Shared Dependencies:                                    │
│  - React 18.3.1                                          │
│  - React DOM                                             │
│  - TanStack Router                                       │
│  - TanStack Query                                        │
└─────────────────────────────────────────────────────────┘
```

---

## Routing Architecture

### Route Types

Plexica has **two distinct route contexts**:

1. **Tenant Routes** - For workspace users (multi-tenant context)
2. **Super-Admin Routes** - For platform administrators (global context)

### Tenant Routes

**Base Path**: `/`  
**Context**: Single tenant workspace  
**Authorization**: User must be authenticated + have tenant selected  
**Header**: `X-Tenant-Slug` required on all API calls

**Routes**:

```
PUBLIC:
  /login                - Login page (Keycloak SSO)

PROTECTED (requires auth + tenant):
  /                     - Dashboard home
  /plugins              - My installed plugins
  /plugins/:id          - Configure specific plugin
  /team                 - Team members
  /team/invite          - Invite members
  /settings             - Workspace settings
  /settings/general     - General settings
  /settings/billing     - Billing
  /settings/security    - Security
  /profile              - User profile

DYNAMIC (loaded from plugins):
  /analytics            - Example plugin route
  /reports              - Example plugin route
  /:pluginSlug/*        - Plugin-specific routes
```

### Route Protection

```typescript
<ProtectedRoute requireTenant={true}>
  <DashboardPage />
</ProtectedRoute>
```

**Checks**:

1. User authenticated
2. Tenant selected
3. User has access to tenant
4. User has required permission (optional, per feature)

---

## State Management

### Zustand Store

**File**: `stores/auth-store.ts`

```typescript
interface AuthState {
  // State
  user: User | null;
  tenant: Tenant | null;
  token: string | null;
  isAuthenticated: boolean;

  // Actions
  setUser: (user: User) => void;
  setTenant: (tenant: Tenant) => void;
  setToken: (token: string) => void;
  logout: () => void;
}
```

**Features**:

- Persistent state with localStorage
- API client auto-configuration
- Type-safe selectors
- Minimal re-renders

### React Query

Used for server state management:

```typescript
const { data, isLoading, error } = useQuery({
  queryKey: ['tenant-plugins', tenantId],
  queryFn: () => apiClient.getTenantPlugins(tenantId),
  enabled: !!tenantId,
});

const mutation = useMutation({
  mutationFn: (data) => apiClient.activatePlugin(tenantId, pluginId),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['tenant-plugins'] });
  },
});
```

**Benefits**:

- Automatic caching
- Background refetching
- Optimistic updates
- Loading and error states
- Request deduplication

---

## Layout Components

### AppLayout

**File**: `components/Layout/AppLayout.tsx` (27 lines)

**Features**:

- Main layout wrapper
- Sidebar toggle state management
- Header integration
- Content area with container

### Sidebar

**File**: `components/Layout/Sidebar.tsx` (105 lines)

**Features**:

- Collapsible sidebar (264px expanded, 80px collapsed)
- Workspace info display
- Core navigation menu (Dashboard, Plugins, Settings)
- Plugin menu section (dynamic from loaded plugins)
- Active route highlighting
- Icon + label display
- Bottom help section

**Menu Items**:

- 📊 Dashboard (/)
- 🧩 Plugins (/plugins)
- 👥 Team (/team)
- ⚙️ Settings (/settings)
- ❓ Help (bottom)

### Header

**File**: `components/Layout/Header.tsx` (152 lines)

**Features**:

- Mobile menu toggle button
- Workspace name display
- User avatar with initials
- User dropdown menu with:
  - User info (name, email)
  - Current workspace
  - Switch Workspace
  - Profile Settings
  - Workspace Settings
  - Logout
- Click-outside to close menu
- Smooth dropdown animations

---

## Application Pages

### Dashboard Home (`/`)

**File**: `routes/index.tsx` (216 lines)

**Sections**:

1. **Welcome Header**: Personalized greeting
2. **Stats Grid** (4 cards):
   - Active Plugins
   - Team Members
   - API Calls (with growth %)
   - Storage Used (with quota)
3. **Installed Plugins Card**: List with status badges
4. **Recent Activity Card**: Timeline of events
5. **Workspace Information**: ID, name, status, plan

### Plugins Page (`/plugins`)

**File**: `routes/plugins.tsx` (360 lines)

**Features**:

- Grid/List view toggle
- Plugin cards with icon, name, version, category
- Status badges (Active/Inactive)
- Management actions:
  - Enable/Disable plugin
  - Configure plugin
  - Uninstall plugin (with confirmation)
- Stats header (total, active, inactive)
- Empty state with CTA
- React Query integration

**API Integration**:

```
GET    /api/tenants/:tenantId/plugins
POST   /api/tenants/:tenantId/plugins/:pluginId/activate
POST   /api/tenants/:tenantId/plugins/:pluginId/deactivate
DELETE /api/tenants/:tenantId/plugins/:pluginId
```

### Team Page (`/team`)

**File**: `routes/team.tsx` (324 lines)

**Features**:

- Team member table with avatar, name, role, status
- Search by name or email
- Role filter dropdown (Admin/Member/Viewer)
- Stats header (total, active, invited)
- Invite member modal
- Relative timestamps ("2h ago", "3d ago")
- Role descriptions

**Roles**:

- **Admin**: Full access to workspace
- **Member**: Can use and configure plugins
- **Viewer**: Read-only access

### Settings Page (`/settings`)

**File**: `routes/settings.tsx` (627 lines)

**Tab Navigation**:

- General ⚙️
- Security 🔒
- Billing 💳
- Integrations 🔗
- Advanced 🔧

**General Settings**:

- Edit workspace name, slug, description
- Preferences toggles
- Allow plugin installation
- Require approval for installations
- Email notifications

**Security Settings**:

- Require 2FA toggle
- Enforce strong passwords
- Session timeout
- Allowed email domains
- IP whitelist
- API key generation

**Billing Settings**:

- Current plan card with features
- Usage meters (team, storage, API calls)
- Payment method display
- Billing history with invoices

**Integrations**:

- Slack, GitHub, Google Workspace, Zapier
- Connection status and buttons
- Webhook management

**Advanced Settings**:

- Data export
- Developer options
- Danger zone (transfer ownership, delete workspace)

---

## API Integration

### API Client

**File**: `lib/api-client.ts`

**Features**:

- Axios-based HTTP client
- Automatic token injection
- Automatic tenant header injection
- Request/response interceptors
- Error handling
- Type-safe methods

**Example**:

```typescript
import { apiClient } from '@/lib/api-client';

// Automatically includes Authorization and X-Tenant-Slug headers
const plugins = await apiClient.get('/api/tenants/:id/plugins');
```

### API Endpoints Used

**Tenant Context (with X-Tenant-Slug)**:

```
GET    /api/tenants/:id
GET    /api/tenants/:id/plugins
POST   /api/tenants/:id/plugins/:pluginId/install
POST   /api/tenants/:id/plugins/:pluginId/activate
POST   /api/tenants/:id/plugins/:pluginId/deactivate
DELETE /api/tenants/:id/plugins/:pluginId
PATCH  /api/tenants/:id/plugins/:pluginId
```

**Global Context (no tenant header)**:

```
GET    /api/auth/me
GET    /api/tenants
POST   /api/tenants
```

---

## Security Considerations

### Authentication

- ✅ PKCE flow prevents authorization code interception
- ✅ Tokens stored in localStorage (acceptable for SPAs)
- ✅ Auto-refresh prevents token expiration
- ✅ HTTPS required in production
- ✅ CSP headers configured in production
- ✅ XSS protection via React's built-in escaping

### Multi-Tenant Isolation

- ✅ Each tenant has dedicated Keycloak realm
- ✅ Complete data isolation per tenant
- ✅ All API requests include tenant context
- ✅ Backend validates tenant access
- ✅ No cross-tenant data leakage

### Plugin Security

- ✅ Plugin isolation in separate scope
- ✅ Authentication required for all routes
- ✅ Tenant validation for plugin access
- ⚠️ Plugin verification/signatures (TODO)
- ⚠️ CSP headers for plugin scripts (TODO)

### Access Control

**Tenant User**:

```json
{
  "sub": "user-id",
  "email": "john@tenant1.com",
  "realm_access": {
    "roles": ["user", "developer"]
  }
}
```

**Super-Admin** (Future):

```json
{
  "sub": "admin-id",
  "email": "admin@plexica.com",
  "realm_access": {
    "roles": ["super-admin"]
  }
}
```

---

## Performance Considerations

### Bundle Size

- **Core App**: ~350KB (gzipped)
- **Keycloak JS**: ~25KB (gzipped)
- **Each Plugin**: ~50-100KB average

### Load Times

- **Initial Load**: ~1.2s (including auth)
- **Route Transition**: <100ms
- **API Response**: <200ms (local)
- **Plugin Load**: ~500ms per plugin

### Optimizations

- ✅ Code splitting via Module Federation
- ✅ Lazy loading for plugins
- ✅ Shared dependencies (no duplication)
- ✅ React Query caching
- ✅ Vite build optimization
- ✅ Tree shaking
- ✅ Minification

---

## Browser Compatibility

| Browser | Version | Status           |
| ------- | ------- | ---------------- |
| Chrome  | 90+     | ✅ Supported     |
| Firefox | 88+     | ✅ Supported     |
| Safari  | 14+     | ✅ Supported     |
| Edge    | 90+     | ✅ Supported     |
| IE11    | -       | ❌ Not Supported |

**Note**: IE11 not supported due to ES modules requirement for Module Federation.

---

## Development Workflow

### Running the Application

```bash
# Start infrastructure (Keycloak, PostgreSQL, Redis)
pnpm infra:start

# Start backend API (port 3000)
pnpm dev --filter @plexica/core-api

# Start frontend (port 3001)
cd apps/web && pnpm dev
```

**Access**:

- Frontend: http://localhost:3001
- Backend: http://localhost:3000
- Keycloak: http://localhost:8080

### Environment Setup

Create `apps/web/.env`:

```env
VITE_API_URL=http://localhost:3000
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_KEYCLOAK_CLIENT_ID=plexica-web
VITE_DEFAULT_TENANT=test-tenant
VITE_BASE_DOMAIN=plexica.app
```

### Test Credentials

- **Username**: `testuser`
- **Password**: `testpass123`
- **Tenants**: ACME Corp, Globex Inc, Demo Company

---

## Future Enhancements

### Super-Admin App (Phase 3+)

**Location**: `apps/super-admin` (port 3002)

**Features**:

- Global tenant management
- Plugin marketplace (all plugins)
- Platform analytics
- User management
- System logs and monitoring

### Tenant App Enhancements

- Dynamic route registration from plugins
- Plugin configuration UI
- Real-time notifications
- Advanced search and filtering
- Internationalization (i18n)
- Dark mode support
- Accessibility improvements

---

## Summary

The Plexica frontend is a modern, production-ready React application with:

- ✅ **Authentication**: Keycloak SSO with PKCE flow
- ✅ **Multi-Tenancy**: URL-based tenant identification
- ✅ **Plugin System**: Module Federation for dynamic loading
- ✅ **State Management**: Zustand + React Query
- ✅ **Routing**: TanStack Router with protection
- ✅ **UI/UX**: Professional dashboard with sidebar navigation
- ✅ **Security**: Complete tenant isolation and access control
- ✅ **Performance**: Optimized bundle size and load times

**Current Status**: M2.1 Complete (100%)  
**Next Milestone**: M2.2 - Super-Admin App

---

**Related Documents**:

- [Testing Guide](./testing/README.md)
- [Frontend Testing](./testing/FRONTEND_TESTING.md)
- [Backend Testing](./testing/BACKEND_TESTING.md)
- [Project Structure](../specs/PROJECT_STRUCTURE.md)
- [Plugin Strategy](../specs/PLUGIN_STRATEGY.md)

---

_Plexica Frontend Architecture v1.0_  
_Last Updated: January 2026_  
_Author: Plexica Engineering Team_
