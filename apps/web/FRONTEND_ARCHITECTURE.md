# Frontend Applications Architecture

## Overview

Plexica has **TWO separate frontend applications** in the monorepo:

```
apps/
├── core-api/           ← Backend API (port 3000)
├── web/                ← Tenant User Frontend (port 3001) ✅ CURRENT
└── super-admin/        ← Super-Admin Frontend (port 3002) ⏳ TO BE CREATED
```

## Why Two Separate Apps?

### Security Isolation

- Super-admin app **never exposed** to tenant users
- No risk of privilege escalation
- Complete separation of concerns

### Deployment Separation

- **Tenant App**: `app.plexica.com` (public)
- **Admin App**: `admin.plexica.com` (internal/VPN only)
- Different security policies and access controls

### Code Separation

- Tenant app doesn't load admin code (smaller bundle)
- Admin app doesn't load tenant plugins
- Each optimized for its use case

### Different Design Systems

- **Tenant App**: Modern, friendly, product-focused
- **Admin App**: Data-dense, technical, operational

---

## 1. Tenant User Frontend (`apps/web`)

### Current Status: ✅ IN DEVELOPMENT (M2.1 - 80% complete)

**Port**: 3001  
**URL**: http://localhost:3001 (dev) | https://app.plexica.com (prod)  
**Users**: Workspace members (developers, managers, team members)  
**Context**: Single workspace (tenant) at a time  
**Authentication**: Keycloak SSO via master realm

### Technology Stack

- **Framework**: React 18.3.1 + TypeScript 5.3.3
- **Build**: Vite 5.4.11
- **Routing**: TanStack Router v1.95.0
- **State**: Zustand + TanStack Query v5.62.0
- **Styling**: Tailwind CSS 3.4.1
- **Auth**: Keycloak JS 23.0.0
- **Plugins**: Module Federation

### Routes

```
PUBLIC:
  /login                - Login page (Keycloak SSO)
  /select-tenant        - Workspace selection

PROTECTED (requires auth + tenant):
  /                     - Dashboard home
  /plugins              - My installed plugins
  /plugins/:id          - Configure specific plugin
  /plugins/:id/settings - Plugin settings
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

### Features Implemented ✅

- ✅ Keycloak authentication (SSO)
- ✅ Tenant selection flow
- ✅ Protected routes with auth + tenant checks
- ✅ Professional dashboard UI
- ✅ Sidebar navigation with collapsible menu
- ✅ Header with user menu + workspace switcher
- ✅ Module Federation for plugin loading
- ✅ Plugin loader service
- ✅ API client with tenant context

### Features TODO ⏳

- ⏳ `/plugins` page - My installed plugins
- ⏳ `/team` page - Team management
- ⏳ `/settings` page - Workspace settings
- ⏳ Dynamic plugin route registration
- ⏳ Sample plugin for testing

### API Calls

All API calls include tenant context:

```typescript
Headers: {
  Authorization: "Bearer <jwt>",
  X-Tenant-Slug: "acme-corp"  // ← Required for all tenant routes
}
```

**Endpoints Used**:

```
GET  /api/auth/me
GET  /api/tenants
GET  /api/tenants/:id
GET  /api/tenants/:id/plugins
POST /api/tenants/:id/plugins/:pluginId/install
PATCH /api/tenants/:id/plugins/:pluginId
DELETE /api/tenants/:id/plugins/:pluginId
```

---

## 2. Super-Admin Frontend (`apps/super-admin`)

### Current Status: ⏳ NOT STARTED (Planned for Phase 3)

**Port**: 3002  
**URL**: http://localhost:3002 (dev) | https://admin.plexica.com (prod)  
**Users**: Platform administrators only  
**Context**: Global platform (no tenant context)  
**Authentication**: Keycloak SSO via master realm (super-admin role required)

### Technology Stack (Proposed)

Same as `apps/web` for consistency:

- React 18 + TypeScript
- Vite
- TanStack Router + Query
- Tailwind CSS
- Keycloak JS

**OR** could use different stack:

- Next.js 14 (for SSR if needed)
- Tailwind + shadcn/ui
- NextAuth

### Routes (Planned)

```
PUBLIC:
  /login                - Admin login (requires super-admin role)

PROTECTED (requires super-admin role):
  /                     - Platform dashboard
  /tenants              - All tenants list
  /tenants/new          - Create new tenant
  /tenants/:id          - Tenant details & management
  /tenants/:id/users    - Tenant users
  /tenants/:id/plugins  - Tenant installed plugins

  /plugins              - Plugin marketplace (all plugins)
  /plugins/new          - Publish new plugin
  /plugins/:id          - Plugin details/edit
  /plugins/:id/versions - Plugin version management
  /plugins/:id/stats    - Plugin usage statistics

  /users                - Platform users management
  /analytics            - Platform-wide analytics
  /logs                 - System logs
  /settings             - Platform settings
  /settings/keycloak    - Keycloak configuration
  /settings/storage     - Storage (MinIO) settings
  /settings/database    - Database settings
```

### Features (Planned)

**Tenant Management**:

- Create/edit/delete tenants
- Provision resources (DB schema, Keycloak realm, MinIO bucket)
- View tenant statistics
- Suspend/activate tenants
- Manage tenant subscriptions

**Plugin Management**:

- Browse all plugins in registry
- Publish new plugins
- Update plugin metadata
- Manage plugin versions
- View global install statistics (which tenants use which plugins)
- Approve/reject plugin submissions
- Deprecate/unpublish plugins

**User Management**:

- View all platform users
- Assign super-admin roles
- View user activity across tenants
- Manage global permissions

**Analytics & Monitoring**:

- Platform health dashboard
- Tenant growth metrics
- Plugin popularity
- API usage statistics
- Error monitoring

**Platform Settings**:

- Keycloak realm configuration
- Database connection settings
- Storage quota management
- Email templates
- Branding customization

### API Calls

API calls do **NOT** include tenant context:

```typescript
Headers: {
  Authorization: "Bearer <jwt>",
  // NO X-Tenant-Slug header
}
```

**Endpoints Used**:

```
GET  /api/plugins                    # All plugins
POST /api/plugins                    # Create plugin
GET  /api/plugins/:id                # Plugin details
PATCH /api/plugins/:id               # Update plugin
DELETE /api/plugins/:id              # Delete plugin

GET  /api/tenants                    # All tenants
POST /api/tenants                    # Create tenant
GET  /api/tenants/:id                # Tenant details
PATCH /api/tenants/:id               # Update tenant
DELETE /api/tenants/:id              # Delete tenant

GET  /api/admin/stats                # Platform stats
GET  /api/admin/logs                 # System logs
GET  /api/admin/health               # System health
```

---

## Comparison Table

| Feature           | Tenant App (`apps/web`)           | Super-Admin App (`apps/super-admin`) |
| ----------------- | --------------------------------- | ------------------------------------ |
| **Port**          | 3001                              | 3002                                 |
| **Users**         | Workspace members                 | Platform admins only                 |
| **Context**       | Single tenant                     | Global platform                      |
| **Tenant Header** | ✅ Required                       | ❌ Not used                          |
| **Auth Role**     | Any authenticated user            | `super-admin` role required          |
| **Deployment**    | Public (app.plexica.com)          | Internal (admin.plexica.com)         |
| **Plugins**       | Can configure installed plugins   | Can manage all plugins globally      |
| **Tenants**       | Can switch between user's tenants | Can manage ALL tenants               |
| **Status**        | ✅ In Development (M2.1)          | ⏳ Not Started (Phase 3+)            |

---

## Access Control

### Tenant User (apps/web)

**Keycloak Check**:

```typescript
✅ User authenticated
✅ User has tenant selected
✅ User belongs to tenant (via Keycloak realm)
✅ User has workspace permissions (optional, per feature)
```

**Example Keycloak Token**:

```json
{
  "sub": "user-id",
  "email": "john@acme.com",
  "realm_access": {
    "roles": ["user", "developer"] // ← Tenant-level roles
  }
}
```

### Super-Admin (apps/super-admin)

**Keycloak Check**:

```typescript
✅ User authenticated
✅ User has "super-admin" role in master realm
❌ NO tenant context required
```

**Example Keycloak Token**:

```json
{
  "sub": "admin-id",
  "email": "admin@plexica.com",
  "realm_access": {
    "roles": ["super-admin"] // ← Platform-level role
  }
}
```

---

## Development Workflow

### Current Phase (M2.1 - Tenant App)

```bash
# Start infrastructure
pnpm infra:start

# Start backend
pnpm dev --filter @plexica/core-api

# Start tenant frontend
cd apps/web && pnpm run dev
# → http://localhost:3001
```

### Future Phase (Super-Admin App)

```bash
# Start infrastructure
pnpm infra:start

# Start backend
pnpm dev --filter @plexica/core-api

# Start super-admin frontend
cd apps/super-admin && pnpm run dev
# → http://localhost:3002
```

**Note**: Both frontends can run simultaneously!

---

## When to Create `apps/super-admin`?

### Recommended Timing: Phase 3+ (After M2.3)

**Rationale**:

1. **M2.1-M2.3**: Focus on tenant app (core user experience)
2. **Phase 3**: Once tenant app is stable, build admin tools
3. **Admin features** can be prototyped in backend API first
4. **Super-admin UI** is less critical for MVP launch

### Prerequisites Before Creating Super-Admin App:

- ✅ Tenant app fully functional
- ✅ Plugin system working end-to-end
- ✅ Multi-tenancy proven stable
- ✅ Backend admin endpoints implemented
- ✅ Super-admin role in Keycloak configured

---

## Summary

### Current Focus: `apps/web` (Tenant App) ✅

**What we built**:

- Professional dashboard UI
- Sidebar navigation
- Header with user menu
- Module Federation for plugins
- Plugin loader service

**What's next for M2.1**:

- `/plugins` page (my installed plugins)
- `/team` page (team management)
- `/settings` page (workspace settings)

### Future: `apps/super-admin` ⏳

**Completely separate app** for platform administration:

- Different deployment
- Different security context
- No tenant header
- Global plugin marketplace
- All tenants management

---

**Key Takeaway**: `/plugins` in `apps/web` shows **MY installed plugins**, while `/plugins` in `apps/super-admin` shows **ALL available plugins globally**. Two different apps, two different contexts! 🎯
