# Route Architecture - Tenant vs Super-Admin

## Architecture Overview

Plexica has **two distinct route contexts**:

1. **Tenant Routes** - For workspace users (multi-tenant context)
2. **Super-Admin Routes** - For platform administrators (global context)

## 1. Tenant Routes (Workspace Context)

**Base Path**: `/`
**Context**: Single tenant workspace
**Authorization**: User must be authenticated + have tenant selected
**Header**: `X-Tenant-Slug` required on all API calls

### Routes:

```
/                       - Dashboard home (workspace stats)
/plugins                - My installed plugins (configure/enable/disable)
/plugins/:id            - Configure specific plugin
/plugins/:id/settings   - Plugin settings page
/team                   - Team members management
/team/invite            - Invite new members
/settings               - Workspace settings
/settings/general       - General workspace info
/settings/billing       - Billing and subscription
/settings/security      - Security settings
/profile                - User profile settings
```

### `/plugins` Page (Tenant Context)

**Purpose**: Manage plugins **installed in this workspace**

**Features**:

- List installed plugins with status (active/inactive)
- Configure plugin settings
- Enable/disable plugins
- View plugin usage stats
- Uninstall plugins

**API Endpoint**: `GET /api/tenants/:tenantId/plugins`

**Access Control**: Workspace member with plugin management permission

**UI Sections**:

```
┌──────────────────────────────────────────┐
│         My Installed Plugins             │
├──────────────────────────────────────────┤
│  🧩 Analytics Dashboard     [Active]     │
│     v2.1.0 • Configure                   │
│                                          │
│  📊 Reporting Tools        [Inactive]    │
│     v1.5.0 • Enable                      │
│                                          │
│  💬 Chat Widget            [Active]      │
│     v3.0.1 • Configure                   │
└──────────────────────────────────────────┘

[+ Browse Plugin Marketplace] → Links to super-admin
```

## 2. Super-Admin Routes (Platform Context)

**Base Path**: `/admin`
**Context**: Global platform management
**Authorization**: User must have `super-admin` role
**Header**: No `X-Tenant-Slug` (operates at platform level)

### Routes:

```
/admin                      - Platform dashboard
/admin/tenants              - All tenants management
/admin/tenants/new          - Create new tenant
/admin/tenants/:id          - Tenant details
/admin/plugins              - Plugin marketplace (all plugins)
/admin/plugins/new          - Publish new plugin
/admin/plugins/:id          - Plugin details/edit
/admin/plugins/:id/versions - Manage plugin versions
/admin/users                - Platform users
/admin/analytics            - Platform-wide analytics
/admin/settings             - Platform settings
```

### `/admin/plugins` Page (Super-Admin Context)

**Purpose**: Manage **global plugin registry**

**Features**:

- Browse all available plugins
- Publish new plugins
- Update plugin metadata
- Manage plugin versions
- View global install statistics
- Deprecate/unpublish plugins
- Approve plugin submissions

**API Endpoint**: `GET /api/plugins` (no tenant filter)

**Access Control**: Super-admin role required

**UI Sections**:

```
┌──────────────────────────────────────────────────┐
│          Plugin Marketplace                      │
│                                                  │
│  [+ Publish New Plugin]  [Filter] [Search]      │
├──────────────────────────────────────────────────┤
│  🧩 Analytics Dashboard         142 installs     │
│     v2.1.0 • Published • ★ 4.8                  │
│     by Plexica Team                             │
│     [Edit] [Versions] [Deprecate]               │
│                                                  │
│  📊 Reporting Tools             89 installs      │
│     v1.5.0 • Published • ★ 4.2                  │
│     by Third Party Dev                          │
│     [Edit] [Versions] [Deprecate]               │
└──────────────────────────────────────────────────┘
```

## Route Protection

### Tenant Routes Protection

```typescript
<ProtectedRoute requireTenant={true}>
  <TenantPluginsPage />
</ProtectedRoute>
```

**Checks**:

1. User authenticated
2. Tenant selected
3. User has access to tenant
4. User has required permission (e.g., `plugins.manage`)

### Super-Admin Routes Protection

```typescript
<ProtectedRoute requireRole="super-admin" requireTenant={false}>
  <AdminPluginMarketplace />
</ProtectedRoute>
```

**Checks**:

1. User authenticated
2. User has `super-admin` role
3. NO tenant context required

## Sidebar Navigation

### Tenant User Sidebar

```
┌─────────────────────┐
│ Plexica             │
├─────────────────────┤
│ Workspace           │
│ ACME Corporation    │
├─────────────────────┤
│ CORE                │
│ 📊 Dashboard        │
│ 🧩 My Plugins       │  ← Installed plugins only
│ 👥 Team             │
│ ⚙️ Settings         │
├─────────────────────┤
│ PLUGINS             │
│ 📈 Analytics        │  ← Dynamic from loaded plugins
│ 💬 Chat             │
└─────────────────────┘
```

### Super-Admin Sidebar (when in /admin)

```
┌─────────────────────┐
│ Plexica Admin       │
├─────────────────────┤
│ Platform            │
├─────────────────────┤
│ 📊 Dashboard        │
│ 🏢 Tenants          │
│ 🧩 Plugins          │  ← Global plugin marketplace
│ 👥 Users            │
│ 📈 Analytics        │
│ ⚙️ Settings         │
└─────────────────────┘
```

## User Menu Behavior

### Tenant User

```
┌─────────────────────────────────┐
│ John Doe                        │
│ john@acme.com                   │
│ Workspace: ACME Corporation     │
├─────────────────────────────────┤
│ Switch Workspace                │
│ Profile Settings                │
│ Workspace Settings              │
├─────────────────────────────────┤
│ Logout                          │
└─────────────────────────────────┘
```

### Super-Admin User

```
┌─────────────────────────────────┐
│ Admin User                      │
│ admin@plexica.com               │
│ Role: Super Admin               │
├─────────────────────────────────┤
│ Platform Dashboard              │  ← Link to /admin
│ My Workspace                    │  ← Link to tenant view
│ Profile Settings                │
├─────────────────────────────────┤
│ Logout                          │
└─────────────────────────────────┘
```

## API Endpoints Summary

### Tenant Context (with X-Tenant-Slug header)

```
GET    /api/tenants/:tenantId/plugins          # List installed plugins
POST   /api/tenants/:tenantId/plugins          # Install plugin
GET    /api/tenants/:tenantId/plugins/:id      # Get plugin config
PATCH  /api/tenants/:tenantId/plugins/:id      # Update plugin config
DELETE /api/tenants/:tenantId/plugins/:id      # Uninstall plugin
POST   /api/tenants/:tenantId/plugins/:id/activate
POST   /api/tenants/:tenantId/plugins/:id/deactivate
```

### Super-Admin Context (no tenant header)

```
GET    /api/plugins                             # List all plugins
POST   /api/plugins                             # Publish new plugin
GET    /api/plugins/:id                         # Get plugin details
PATCH  /api/plugins/:id                         # Update plugin
DELETE /api/plugins/:id                         # Delete plugin
GET    /api/plugins/:id/installs                # Get install statistics
POST   /api/plugins/:id/versions                # Add new version
```

## Implementation Priority

### Phase 1 (Current - M2.1)

- ✅ Tenant routes structure
- ✅ `/` - Dashboard
- ⏳ `/plugins` - My installed plugins page
- ⏳ `/settings` - Workspace settings

### Phase 2 (M2.2)

- `/team` - Team management
- `/profile` - User profile
- Plugin configuration pages

### Phase 3 (Later)

- `/admin/*` - All super-admin routes
- `/admin/plugins` - Plugin marketplace
- `/admin/tenants` - Tenant management

## Summary

**Correzione chiave**:

- **`/plugins`** = I **miei** plugin installati nel workspace corrente (tenant context)
- **`/admin/plugins`** = **Tutti** i plugin disponibili nella piattaforma (super-admin context)

Questa separazione è fondamentale per mantenere l'isolamento multi-tenant e la sicurezza della piattaforma! 🔒
