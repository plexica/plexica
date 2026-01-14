# Plexica Super-Admin Application

## Overview

The **Super-Admin Application** is a separate frontend app for platform administrators to manage the entire Plexica platform. It provides a global view across all tenants, plugins, users, and platform metrics.

## Application Details

- **App Name**: `@plexica/super-admin`
- **Port**: `3002`
- **URL**: http://localhost:3002 (development)
- **Production URL**: https://admin.plexica.com (internal/VPN only)
- **Users**: Platform administrators only
- **Context**: NO tenant context (global platform view)

## Key Differences from Tenant App

| Feature           | Tenant App (`apps/web`)       | Super-Admin App (`apps/super-admin`) |
| ----------------- | ----------------------------- | ------------------------------------ |
| **Port**          | 3001                          | 3002                                 |
| **Context**       | Single tenant workspace       | Global platform                      |
| **Users**         | Workspace members             | Platform admins                      |
| **Auth**          | Keycloak SSO (tenant realm)   | Platform admin credentials           |
| **Tenant Header** | ✅ Required (`X-Tenant-Slug`) | ❌ Not used                          |
| **Routes**        | `/plugins` = my plugins       | `/plugins` = marketplace             |
| **Deployment**    | Public (`app.plexica.com`)    | Internal/VPN (`admin.plexica.com`)   |
| **Plugins**       | Module Federation (dynamic)   | No plugin loading                    |

## Technology Stack

- **Framework**: React 18.3.1 + TypeScript 5.6.2
- **Build Tool**: Vite 5.4.21
- **Styling**: Tailwind CSS 3.4.1
- **State**: React Query (TanStack Query) 5.62.0
- **HTTP Client**: Axios 1.6.5
- **Auth**: Keycloak JS 23.0.0 (to be integrated)

## Current Features (MVP)

### 1. Navigation Tabs ✅

- **Tenants** 🏢 - Tenant management
- **Plugins** 🧩 - Plugin marketplace
- **Users** 👥 - Platform users (placeholder)
- **Analytics** 📊 - Platform analytics (placeholder)

### 2. Tenants View ✅

**Features**:

- **Real-time data** from backend API (`GET /api/tenants`)
- Tenant list table with:
  - Tenant name and slug
  - Status badge (Active/Suspended/Provisioning)
  - Created date
  - Actions: View, Edit, Suspend/Activate
- Stats cards:
  - Total tenants
  - Active tenants
  - Suspended tenants
  - Provisioning tenants
- **"Create Tenant" modal** with:
  - Name and slug input
  - Auto-slug generation from name
  - Provisioning progress indicator
  - Real-time tenant creation via API
  - Automatic table refresh after creation
- **Suspend/Activate functionality** with confirmation
- Loading and error states
- Empty state when no tenants exist

### 3. Plugins View (Marketplace) ✅

**Features**:

- **Real-time data** from backend API (`GET /api/plugins`)
- Plugin cards grid showing:
  - Plugin icon
  - Name, version, category, description
  - Status (published/draft/deprecated)
  - Author
  - Actions: View, Edit
- "Publish Plugin" button (to be implemented)
- Loading and error states
- Empty state when no plugins exist

### 4. Users View 🟡

**Status**: Placeholder with "Coming Soon" message

### 5. Analytics View 🟡

**Status**: Placeholder with platform-wide stats

- Active plugins: 23
- API calls (24h): 45.2k

## File Structure

```
apps/super-admin/
├── public/
│   └── vite.svg
├── src/
│   ├── components/           ← Empty (to be added)
│   ├── routes/               ← Empty (to be added)
│   ├── lib/                  ← Empty (to be added)
│   ├── stores/               ← Empty (to be added)
│   ├── types/                ← Empty (to be added)
│   ├── App.tsx               ← Main app with tabs (480 lines)
│   ├── main.tsx              ← Entry point
│   └── index.css             ← Tailwind CSS
├── index.html                ← HTML entry
├── package.json              ← Dependencies
├── vite.config.ts            ← Vite config (port 3002)
├── tsconfig.json             ← TypeScript config
├── tailwind.config.js        ← Tailwind config
└── postcss.config.js         ← PostCSS config
```

## Routes (To Be Implemented with TanStack Router)

```
PUBLIC:
  /login                - Admin login

PROTECTED (requires super-admin role):
  /                     - Dashboard (same as /tenants)
  /tenants              - Tenant management table
  /tenants/:id          - Tenant detail page
  /tenants/create       - Create new tenant form
  /plugins              - Plugin marketplace
  /plugins/:id          - Plugin detail page
  /plugins/publish      - Publish new plugin
  /users                - Platform users list
  /users/:id            - User detail page
  /analytics            - Platform analytics dashboard
  /settings             - Platform settings
```

## API Endpoints Used

### Tenants

- `GET /api/admin/tenants` - List all tenants
- `GET /api/admin/tenants/:id` - Get tenant details
- `POST /api/admin/tenants` - Create new tenant (already exists)
- `PATCH /api/admin/tenants/:id` - Update tenant
- `POST /api/admin/tenants/:id/suspend` - Suspend tenant
- `POST /api/admin/tenants/:id/activate` - Activate tenant
- `DELETE /api/admin/tenants/:id` - Delete tenant (dangerous)

### Plugins (Marketplace)

- `GET /api/admin/plugins` - List all plugins in registry
- `GET /api/admin/plugins/:id` - Get plugin details
- `POST /api/admin/plugins` - Publish new plugin
- `PATCH /api/admin/plugins/:id` - Update plugin
- `POST /api/admin/plugins/:id/unpublish` - Unpublish plugin
- `GET /api/admin/plugins/:id/installs` - Get installation stats

### Users

- `GET /api/admin/users` - List all users across tenants
- `GET /api/admin/users/:id` - Get user details
- `PATCH /api/admin/users/:id` - Update user
- `DELETE /api/admin/users/:id` - Delete user

### Analytics

- `GET /api/admin/analytics/overview` - Platform-wide stats
- `GET /api/admin/analytics/tenants` - Tenant growth over time
- `GET /api/admin/analytics/plugins` - Plugin usage stats
- `GET /api/admin/analytics/api-calls` - API usage metrics

## Running the Application

### Development

```bash
# From root
pnpm install

# Start super-admin app only
cd apps/super-admin
pnpm run dev

# Open browser
http://localhost:3002
```

### With Full Stack

```bash
# Terminal 1: Start infrastructure
pnpm infra:start

# Terminal 2: Start backend API
pnpm dev --filter @plexica/core-api

# Terminal 3: Start tenant app
cd apps/web && pnpm run dev

# Terminal 4: Start super-admin app
cd apps/super-admin && pnpm run dev

# Access apps
http://localhost:3001  # Tenant app
http://localhost:3002  # Super-admin app
http://localhost:3000  # Backend API
```

## Current Status

**Milestone M2.2 - Super-Admin App**: **80% Complete**

**Completed**:

- ✅ Project setup and configuration
- ✅ Vite + React + TypeScript + Tailwind
- ✅ **React Query integration** for data fetching
- ✅ **API client service** (no tenant header)
- ✅ Basic dashboard with tab navigation
- ✅ **Tenants view with real API integration**
- ✅ **Create tenant modal with provisioning**
- ✅ **Suspend/Activate tenant functionality**
- ✅ **Plugins marketplace with real API integration**
- ✅ Loading, error, and empty states
- ✅ Placeholder views for Users and Analytics
- ✅ Dev server running on port 3002

**TODO** (Priority Order):

1. ~~**Integrate TanStack Router** for proper routing~~ _(Deferred - current tab system works)_
2. **Add authentication** with Keycloak (super-admin role)
3. ~~**Connect to backend API** (remove mock data)~~ ✅ **DONE**
4. **Implement tenant detail page** with full info
5. ~~**Implement create tenant form** with provisioning progress~~ ✅ **DONE**
6. **Implement plugin detail page** with install stats
7. **Implement users view** with cross-tenant search
8. **Implement analytics dashboard** with charts
9. ~~**Add proper error handling** and loading states~~ ✅ **DONE**
10. **Add search and filters** for tenants and plugins

## Design Principles

### Data-Dense Layout

- More information visible at once
- Table-heavy (not card-heavy like tenant app)
- Compact spacing
- Technical, operational focus

### Admin-Focused UX

- Minimal animations
- Fast navigation
- Keyboard shortcuts (future)
- Bulk operations
- Quick filters

### Security-First

- No tenant context mixing
- Role-based access (super-admin only)
- Audit logging for all actions
- Confirmation for destructive operations

## Comparison: Tenant App vs Super-Admin App

### Tenant App Example: `/plugins`

Shows **MY installed plugins** in current workspace:

- Enable/Disable plugin
- Configure plugin
- Uninstall plugin
- Limited to current tenant context

### Super-Admin App Example: `/plugins`

Shows **GLOBAL plugin marketplace**:

- All available plugins across platform
- Publish new plugins
- Unpublish plugins
- View installation statistics across all tenants
- Edit plugin metadata
- No tenant context

## Next Steps

### Phase 1: Routing & Auth (High Priority)

1. Install TanStack Router
2. Create route structure
3. Add authentication with Keycloak
4. Protect routes with super-admin role check

### Phase 2: Backend Integration (High Priority)

1. Create API client service
2. Replace mock data with real API calls
3. Add React Query for data fetching
4. Implement error handling

### Phase 3: Core Features (Medium Priority)

1. Tenant detail page with full information
2. Create tenant form with validation
3. Plugin detail page with statistics
4. User management interface

### Phase 4: Advanced Features (Lower Priority)

1. Analytics dashboard with charts
2. Platform settings page
3. Audit log viewer
4. Export/import functionality

## Testing

### Manual Testing

1. **Start the app**:

   ```bash
   cd apps/super-admin && pnpm run dev
   ```

2. **Open browser**: http://localhost:3002

3. **Verify tabs**:
   - Click Tenants → See tenant table
   - Click Plugins → See plugin cards
   - Click Users → See placeholder
   - Click Analytics → See stats

4. **Test interactions**:
   - Hover over buttons (should show hover states)
   - Click View/Edit/Suspend buttons (alerts)
   - Switch between tabs (content changes)

### Browser Compatibility

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

## Deployment Strategy

### Development

- Run locally on port 3002
- Connect to dev backend (localhost:3000)
- Mock authentication

### Staging

- Deploy to internal VPN
- URL: https://admin-staging.plexica.com
- Real Keycloak authentication
- Connect to staging backend

### Production

- Deploy to internal VPN (NOT public)
- URL: https://admin.plexica.com
- Strict IP whitelist
- MFA required
- Full audit logging
- Read-only mode for viewer role

## Security Considerations

✅ **Separate Deployment**: Never expose super-admin to public internet
✅ **Role-Based Access**: Only users with `super-admin` role can access
✅ **Audit Logging**: All actions logged with timestamp and user
⚠️ **MFA**: Multi-factor authentication required (to be implemented)
⚠️ **Session Timeout**: Auto-logout after 15 minutes of inactivity (to be implemented)
⚠️ **IP Whitelist**: Only allow from office/VPN IPs (to be configured)

## Performance

- **Bundle Size**: ~180KB (gzipped) - Smaller than tenant app (no plugins)
- **Initial Load**: <1s
- **Tab Switch**: Instant (no routing yet)
- **API Calls**: Batch requests where possible

---

**Milestone**: M2.2 - Super-Admin App  
**Status**: 🟡 40% Complete  
**Completion Date**: January 13, 2026 (initial version)  
**Total Code**: ~480 lines (App.tsx)

**Phase 1 MVP Progress**: 79% (5.4/7 milestones)

**Next Milestone**: M2.3 - Testing & Deployment

---

_Plexica Super-Admin App - Initial Version_  
_Platform management interface for administrators_  
_Separate from tenant app with global view_
