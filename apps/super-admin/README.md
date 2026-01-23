# Plexica Super-Admin Application

## Overview

The **Super-Admin Application** is a platform administration interface for managing the entire Plexica ecosystem. It provides global oversight across all tenants, plugins, users, and analytics - completely separate from the tenant-facing web app.

## Application Details

- **Package**: `@plexica/super-admin`
- **Port**: `3002` (development)
- **Production URL**: https://admin.plexica.com (internal/VPN only)
- **Users**: Platform administrators only (super-admin role required)
- **Context**: NO tenant context - global platform view

## Key Differences from Web App

| Feature               | Web App (`apps/web`)              | Super-Admin (`apps/super-admin`)   |
| --------------------- | --------------------------------- | ---------------------------------- |
| **Port**              | 3001                              | 3002                               |
| **Context**           | Single tenant workspace           | Global platform (all tenants)      |
| **Users**             | Workspace members                 | Platform administrators            |
| **Auth Realm**        | Keycloak tenant realm (dynamic)   | `plexica-admin` realm (fixed)      |
| **Tenant Header**     | ✅ Required (`X-Tenant-Slug`)     | ❌ **NEVER sent** (critical)       |
| **Workspace Header**  | ✅ Required (`X-Workspace-ID`)    | ❌ **NEVER sent** (critical)       |
| **Routes**            | `/plugins` = my installed plugins | `/plugins` = global marketplace    |
| **Deployment**        | Public (`app.plexica.com`)        | Internal/VPN (`admin.plexica.com`) |
| **Module Federation** | ✅ Enabled (dynamic plugin load)  | ❌ Disabled (no plugins)           |
| **Role Required**     | Workspace member                  | `super-admin` Keycloak role        |

## Technology Stack

### Core

- **Framework**: React 18.3.1 + TypeScript 5.6.2 (strict mode)
- **Build Tool**: Vite 5.4.21
- **Routing**: TanStack Router 1.99.1 (file-based)
- **State Management**: Zustand 5.0.2
- **Authentication**: Keycloak JS 26.0.7

### Data & Forms

- **API Client**: Axios 1.6.5
- **Data Fetching**: TanStack Query 5.62.0
- **Form Validation**: Zod 3.24.1

### Styling

- **CSS Framework**: Tailwind CSS 4.x
- **UI Components**: @plexica/ui (shared with web app)
- **Font**: JetBrains Mono Variable (monospace)
- **Dark Mode**: CSS class-based (`darkMode: 'class'`)

### Storage

- **Token Storage**: sessionStorage (secure, cleared on tab close)
- **State Persistence**: Zustand persist middleware

## Architecture

### Folder Structure (Post-Migration)

```
apps/super-admin/
├── public/
│   ├── silent-check-sso.html    # Keycloak SSO silent check
│   └── vite.svg
├── src/
│   ├── routes/                  # TanStack Router (file-based)
│   │   ├── __root.tsx           # Root layout with providers
│   │   ├── index.tsx            # Dashboard / redirect
│   │   ├── login.tsx            # Keycloak SSO login
│   │   ├── tenants/
│   │   │   └── index.tsx        # Tenant management
│   │   ├── plugins/
│   │   │   └── index.tsx        # Plugin marketplace
│   │   ├── users/
│   │   │   └── index.tsx        # User management
│   │   └── analytics.tsx        # Platform analytics
│   │
│   ├── components/
│   │   ├── Layout/              # AppLayout, Header, Sidebar
│   │   ├── providers/           # AuthProvider, ProtectedRoute, ToastProvider
│   │   ├── tenants/             # Tenant-specific components
│   │   ├── plugins/             # Plugin-specific components
│   │   ├── users/               # User-specific components
│   │   ├── analytics/           # Analytics-specific components
│   │   └── ui/                  # ThemeToggle, shared UI
│   │
│   ├── hooks/                   # Custom React hooks
│   │   ├── useForm.ts           # Form management with Zod
│   │   ├── useTenants.ts        # Tenant CRUD operations
│   │   ├── usePlugins.ts        # Plugin marketplace
│   │   ├── useUsers.ts          # User management
│   │   ├── useAnalytics.ts      # Platform analytics
│   │   └── index.ts             # Barrel exports
│   │
│   ├── stores/
│   │   └── auth-store.ts        # Zustand auth state (NO tenant fields)
│   │
│   ├── lib/
│   │   ├── keycloak.ts          # Keycloak config (plexica-admin realm)
│   │   ├── api-client.ts        # Axios client (NO tenant headers)
│   │   ├── config.ts            # Environment validation
│   │   ├── utils.ts             # Tailwind cn() helper
│   │   └── secure-storage.ts    # Token storage (sessionStorage)
│   │
│   ├── types/
│   │   └── index.ts             # TypeScript definitions
│   │
│   ├── contexts/
│   │   └── ThemeContext.tsx     # Theme state management
│   │
│   ├── App.tsx                  # RouterProvider setup
│   ├── main.tsx                 # Entry point
│   └── index.css                # Tailwind v4 imports + CSS vars
│
├── .env.example                 # Environment template
├── package.json
├── vite.config.ts               # TanStack Router plugin + Tailwind v4
├── tsr.config.json              # TanStack Router configuration
├── tailwind.config.js           # Theme aligned with web app
├── tsconfig.json                # TypeScript strict mode
└── PROGRESS.md                  # Migration tracking (90% complete)
```

## Authentication Flow

### Keycloak Configuration

**CRITICAL**: This app uses a **separate Keycloak realm** from tenant apps.

- **Realm**: `plexica-admin` (fixed, never changes)
- **Client ID**: `plexica-super-admin`
- **Required Role**: `super-admin` (Keycloak role)
- **Token Storage**: sessionStorage (cleared on browser close)
- **Token Refresh**: Automatic every 60 seconds
- **SSO Check**: Silent check on app load

### Login Flow

1. User visits http://localhost:3002
2. AuthProvider checks for existing token
3. If no token → redirect to `/login`
4. User clicks "Login with Keycloak"
5. Redirect to Keycloak `plexica-admin` realm
6. After successful auth → redirect back with token
7. Token stored in sessionStorage
8. Role verification: must have `super-admin` role
9. Redirect to `/tenants` (default view)

### Protected Routes

All routes except `/login` require:

- Valid Keycloak token
- `super-admin` role in token claims

If unauthorized → redirect to `/login`

### Logout Flow

1. User clicks logout in Header
2. Clear sessionStorage tokens
3. Call Keycloak logout endpoint
4. Redirect to `/login`

## API Client Configuration

### CRITICAL: No Tenant Headers

The API client in `src/lib/api-client.ts` is configured to **NEVER** send tenant context:

```typescript
// ❌ NEVER include these headers:
// X-Tenant-Slug
// X-Workspace-ID

// ✅ ALWAYS include:
// Authorization: Bearer <keycloak-token>
```

This ensures all API calls are **platform-wide**, not scoped to a single tenant.

### API Endpoints

Base URL: `http://localhost:3000` (development)

#### Tenants

- `GET /api/admin/tenants` - List all tenants
- `POST /api/admin/tenants` - Create tenant
- `PATCH /api/admin/tenants/:id` - Update tenant
- `POST /api/admin/tenants/:id/suspend` - Suspend tenant
- `POST /api/admin/tenants/:id/activate` - Activate tenant
- `DELETE /api/admin/tenants/:id` - Delete tenant

#### Plugins (Marketplace)

- `GET /api/admin/plugins` - List all plugins
- `GET /api/admin/plugins/:id` - Plugin details
- `POST /api/admin/plugins` - Publish plugin
- `PATCH /api/admin/plugins/:id` - Update plugin
- `POST /api/admin/plugins/:id/unpublish` - Unpublish plugin

#### Users

- `GET /api/admin/users` - List all users (cross-tenant)
- `GET /api/admin/users/:id` - User details
- `PATCH /api/admin/users/:id` - Update user
- `DELETE /api/admin/users/:id` - Delete user

#### Analytics

- `GET /api/admin/analytics/overview` - Platform stats
- `GET /api/admin/analytics/tenants` - Tenant growth
- `GET /api/admin/analytics/plugins` - Plugin usage
- `GET /api/admin/analytics/api-calls` - API metrics

## Features

### 1. Tenant Management (`/tenants`)

**Capabilities**:

- List all tenants with pagination
- View tenant status (Active/Suspended/Provisioning)
- Create new tenant with auto-slug generation
- Edit tenant details
- Suspend/activate tenants
- Delete tenants (with confirmation)
- Search and filter tenants
- Real-time stats (total, active, suspended, provisioning)

**Tech**:

- Uses `useTenants` hook
- TanStack Query for caching
- Optimistic updates
- Toast notifications for success/error

### 2. Plugin Marketplace (`/plugins`)

**Capabilities**:

- Browse all available plugins
- View plugin details (version, category, description, author)
- Filter by category
- Search plugins
- Publish new plugins
- Unpublish plugins
- View installation statistics across all tenants

**Tech**:

- Uses `usePlugins` hook
- Grid layout with cards
- Category filtering
- Real-time data from backend

### 3. User Management (`/users`)

**Capabilities**:

- List all users across all tenants
- Filter by tenant
- View user roles and status
- Edit user details
- Toggle user active/inactive
- Cross-tenant user search

**Tech**:

- Uses `useUsers` hook
- Table layout (data-dense)
- Tenant association visible

### 4. Platform Analytics (`/analytics`)

**Capabilities**:

- Platform-wide metrics dashboard
- Tenant growth over time
- Plugin usage statistics
- API call metrics
- Export analytics data

**Tech**:

- Uses `useAnalytics` hook
- Charts and visualizations
- Date range filters

## Development

### Prerequisites

1. **Node.js**: 18.x or higher
2. **pnpm**: 8.x or higher
3. **Keycloak**: Running with `plexica-admin` realm configured
4. **Backend API**: `@plexica/core-api` running on port 3000

### Environment Setup

1. Copy `.env.example` to `.env`:

```bash
cd apps/super-admin
cp .env.example .env
```

2. Configure environment variables:

```env
# Keycloak Configuration (REQUIRED)
VITE_KEYCLOAK_URL=http://localhost:8080
VITE_KEYCLOAK_REALM=plexica-admin
VITE_KEYCLOAK_CLIENT_ID=plexica-super-admin

# Backend API
VITE_API_URL=http://localhost:3000
```

### Running the App

```bash
# Install dependencies (from root)
pnpm install

# Start super-admin app
cd apps/super-admin
pnpm dev

# Or from root with turbo
pnpm dev --filter @plexica/super-admin
```

App will be available at: **http://localhost:3002**

### Full Stack Development

```bash
# Terminal 1: Infrastructure (Postgres, Keycloak)
pnpm infra:start

# Terminal 2: Backend API
pnpm dev --filter @plexica/core-api

# Terminal 3: Web app (optional)
pnpm dev --filter @plexica/web

# Terminal 4: Super-admin app
pnpm dev --filter @plexica/super-admin
```

### Building for Production

```bash
# Build only super-admin
cd apps/super-admin
pnpm build

# Preview production build
pnpm preview

# Build from root
pnpm build --filter @plexica/super-admin
```

## Testing

### Manual Testing Checklist

#### Authentication

- [ ] Keycloak login redirect works
- [ ] Token stored in sessionStorage
- [ ] Token refresh every 60 seconds
- [ ] Protected routes redirect to login when unauthenticated
- [ ] Super-admin role verified
- [ ] Logout clears tokens and redirects

#### Navigation

- [ ] All sidebar links work
- [ ] Deep linking (refresh on any route)
- [ ] Browser back/forward buttons
- [ ] Active route highlighted in sidebar

#### Tenant Management

- [ ] List tenants with correct data
- [ ] Create tenant modal works
- [ ] Edit tenant works
- [ ] Suspend/activate with confirmation
- [ ] Delete tenant with confirmation
- [ ] Search/filter tenants
- [ ] Stats cards update

#### Plugin Marketplace

- [ ] List all plugins
- [ ] Filter by category
- [ ] Search plugins
- [ ] View plugin details
- [ ] Enable/disable plugin

#### User Management

- [ ] List users across tenants
- [ ] Filter by tenant
- [ ] Edit user details
- [ ] Toggle user status

#### Analytics

- [ ] Platform metrics load
- [ ] Charts render correctly
- [ ] Date filters work
- [ ] Export data works

#### Theme

- [ ] Dark/light toggle works
- [ ] Theme persists on refresh
- [ ] All components render in both themes
- [ ] @plexica/ui components work

#### API Headers (CRITICAL)

- [ ] **NO X-Tenant-Slug header sent**
- [ ] **NO X-Workspace-ID header sent**
- [ ] Authorization Bearer token included
- [ ] Errors handled gracefully

### Automated Testing

```bash
# Run type checking
pnpm type-check

# Run linting
pnpm lint

# Run tests (when implemented)
pnpm test
```

## Deployment

### Staging

- **URL**: https://admin-staging.plexica.com
- **Network**: Internal VPN required
- **Keycloak**: Staging realm
- **Backend**: Staging API

### Production

- **URL**: https://admin.plexica.com
- **Network**: Internal VPN + IP whitelist
- **Keycloak**: Production `plexica-admin` realm
- **Backend**: Production API
- **MFA**: Required for all users
- **Audit Logging**: All actions logged
- **Session Timeout**: 15 minutes

### Security Considerations

✅ **NEVER expose to public internet**  
✅ **VPN/IP whitelist required**  
✅ **Keycloak super-admin role required**  
✅ **No tenant context mixing**  
✅ **Audit logging for all actions**  
⚠️ **MFA to be implemented**  
⚠️ **Session timeout to be implemented**

## Migration Status

**Current Progress**: 90% complete

See [PROGRESS.md](./PROGRESS.md) for detailed migration tracking.

**Completed**:

- ✅ Folder structure alignment
- ✅ TanStack Router implementation
- ✅ Custom hooks (useForm, useTenants, usePlugins, useUsers, useAnalytics)
- ✅ Keycloak authentication (plexica-admin realm)
- ✅ Zustand auth store (no tenant fields)
- ✅ Theme alignment with web app
- ✅ Obsolete file cleanup

**In Progress**:

- ⏳ Testing and documentation

## Troubleshooting

### Issue: "Keycloak is not initialized"

**Solution**: Ensure Keycloak is running and `VITE_KEYCLOAK_URL` is correct.

```bash
# Check Keycloak is running
curl http://localhost:8080

# Verify realm exists
# Visit: http://localhost:8080/admin
```

### Issue: "401 Unauthorized" on API calls

**Possible causes**:

1. Token expired (should auto-refresh every 60s)
2. Missing super-admin role
3. Wrong Keycloak realm

**Solution**: Check browser console for detailed error. Logout and login again.

### Issue: Tenant headers being sent (X-Tenant-Slug)

**THIS IS CRITICAL**: Super-admin should NEVER send tenant headers.

**Solution**: Check `src/lib/api-client.ts` - ensure interceptor does NOT add tenant headers.

### Issue: Module Federation errors

**Solution**: Super-admin does NOT use Module Federation. If you see these errors, check Vite config - Module Federation plugin should NOT be present.

## Design Principles

### Admin-Focused UX

- Data-dense layouts (tables over cards)
- Compact spacing
- Fast navigation
- Minimal animations
- Keyboard shortcuts (planned)

### Security-First

- No tenant context mixing
- Role-based access control
- Audit logging (planned)
- Confirmation for destructive actions
- Session management

### Performance

- Bundle size: ~200KB (no dynamic plugins)
- Initial load: <1s
- Route transitions: instant
- Optimistic updates

## Contributing

### Code Style

- **TypeScript**: Strict mode enabled
- **Formatting**: Prettier (auto-format on save)
- **Linting**: ESLint with strict rules
- **Imports**: Absolute imports from `src/`

### Commit Convention

```
feat(super-admin): add user management page
fix(super-admin): correct token refresh logic
docs(super-admin): update README with auth flow
```

### Pull Requests

1. Create feature branch from `main`
2. Implement changes
3. Update PROGRESS.md if applicable
4. Test all affected features
5. Submit PR with detailed description

---

**Milestone**: M2.2 - Super-Admin App  
**Status**: 🟢 90% Complete  
**Last Updated**: January 23, 2026  
**Branch**: `review/super-admin-complete`

---

_Plexica Super-Admin - Platform Management Interface_  
_Internal tool for platform administrators_  
_Separate from tenant app with global oversight_
