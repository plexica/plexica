# Feature Flags

**Date**: March 2026  
**Status**: Active  
**Author**: Plexica Engineering Team

This document describes all feature flags used in the Plexica platform and how to enable them.

---

## Overview

Feature flags allow gradual rollout of user-facing changes without a code deployment. There are two categories:

| Category           | Scope                   | Storage                                        |
| ------------------ | ----------------------- | ---------------------------------------------- |
| **Frontend flags** | Client-side UI only     | Vite `import.meta.env` / environment variables |
| **Tenant flags**   | Per-tenant backend + UI | `Tenant.settings` JSON field (PostgreSQL)      |

Constitution Art. 9.1.1 requires feature flags for all user-facing changes.

---

## Frontend Flags (Environment Variables)

Set via `VITE_<FLAG_NAME>=true` in `.env` or the Vite `define` block.

| Flag                         | Default | Description                                              | Spec     |
| ---------------------------- | ------- | -------------------------------------------------------- | -------- |
| `ENABLE_NEW_SIDEBAR`         | `false` | Use redesigned SidebarNav instead of Sidebar.tsx         | —        |
| `ENABLE_TENANT_BRANDING`     | `false` | Show branding settings & live theme preview              | Spec 010 |
| `ENABLE_AUTH_WARNINGS`       | `false` | Display banner when token refresh has failed             | Spec 002 |
| `ENABLE_DARK_MODE`           | `false` | Expose dark-mode toggle in UI                            | —        |
| `ENABLE_PLUGIN_WIDGETS`      | `false` | Allow plugins to embed cross-plugin widgets              | Spec 010 |
| `ENABLE_ADMIN_INTERFACES`    | `false` | Show Tenant Admin portal routes                          | Spec 008 |
| `ENABLE_WORKSPACE_HIERARCHY` | `false` | Show workspace hierarchy tree & template picker          | Spec 011 |
| `ENABLE_EXTENSION_POINTS`    | `false` | Enable plugin extension slots and contribution rendering | Spec 013 |

### Usage in Code

```typescript
// File: apps/web/src/lib/feature-flags.ts
import { useFeatureFlag } from '@/lib/feature-flags';

// In a React component
const isExtensionPointsEnabled = useFeatureFlag('ENABLE_EXTENSION_POINTS');

if (!isExtensionPointsEnabled) return null;
```

### Setting in Development

```bash
# .env.local
VITE_ENABLE_EXTENSION_POINTS=true
VITE_ENABLE_TENANT_BRANDING=true
```

---

## Tenant Flags (Per-Tenant Settings)

Stored in the `Tenant.settings` JSON field. Each flag is scoped to a single tenant and can be toggled without redeploying.

| Flag                       | Default | Description                                    | Spec     | ADR     |
| -------------------------- | ------- | ---------------------------------------------- | -------- | ------- |
| `extension_points_enabled` | `false` | Enable Extension Points system for this tenant | Spec 013 | ADR-031 |
| `layout_engine_enabled`    | `false` | Enable Frontend Layout Engine for this tenant  | Spec 014 | —       |

### Setting via API

```bash
# Enable extension points for a tenant (super-admin only)
PATCH /api/v1/admin/tenants/{tenantId}/settings
Content-Type: application/json

{
  "extension_points_enabled": true
}
```

### Checking in Backend Services

```typescript
// Extension registry service pattern
function isExtensionPointsEnabled(settings: Record<string, unknown>): boolean {
  return (
    settings['extension_points_enabled'] === true ||
    process.env['ENABLE_EXTENSION_POINTS'] === 'true'
  );
}

// Usage
if (!isExtensionPointsEnabled(tenant.settings)) {
  throw new Error('EXTENSION_POINTS_DISABLED: ...');
}
```

The `ENABLE_EXTENSION_POINTS` environment variable can be used to bypass the per-tenant flag globally (development environments only — never set in production).

---

## extension_points_enabled (Spec 013)

**Type**: Tenant flag  
**Default**: `false`  
**ADR**: ADR-031

Enables the Extension Points system for a specific tenant. When `false`:

- `ExtensionRegistryService` returns early from all queries without hitting the database
- `syncManifest()` is a no-op (plugin manifests with extension declarations are silently ignored)
- `<ExtensionSlot>` components render `null` (no visible output, no error)
- All extension registry API endpoints return `403 EXTENSION_POINTS_DISABLED`

When `true`:

- Plugin activation syncs slot/contribution/entity declarations from the manifest
- `<ExtensionSlot>` renders active contributions from contributing plugins
- The Settings → Extensions page becomes available to workspace admins
- Super-admin can view and override contribution permissions globally

**Health check**: `GET /health` includes an `extension_registry` check that probes `core.extension_slots`. Returns `ok` when the table is accessible, `degraded` when the migration has not yet been applied.

---

## ENABLE_EXTENSION_POINTS (Spec 013)

**Type**: Environment variable (frontend + backend)  
**Default**: unset (treated as `false`)  
**ADR**: ADR-031

Global override that enables Extension Points for **all** tenants regardless of their individual `extension_points_enabled` setting.

> ⚠️ **Development only.** Never set `ENABLE_EXTENSION_POINTS=true` in production. This bypasses the per-tenant flag and enables the feature globally, which may expose incomplete or partially-migrated data.

```bash
# Backend (core-api)
ENABLE_EXTENSION_POINTS=true node dist/index.js

# Frontend (Vite dev server)
VITE_ENABLE_EXTENSION_POINTS=true pnpm dev
```

---

## Adding a New Feature Flag

1. **Frontend flag**: Add to `FeatureFlagName` union in `apps/web/src/lib/feature-flags.ts` and document in the table above.
2. **Tenant flag**: Add to `Tenant.settings` JSON field usage and document in the table above. No schema migration required (JSONB is schema-free).
3. **Backend env var**: Document in this file. Add to `isXxxEnabled()` helper in the relevant service.
4. **Update this document**: Add the new flag to the appropriate table with `Default`, `Description`, `Spec`, and `ADR` columns.

---

## See Also

- [Architecture — Extension Points System](./ARCHITECTURE.md#extension-points-system-spec-013)
- [Security — Extension Points Security](./SECURITY.md#extension-points-security-spec-013--adr-031)
- [Plugin SDK — Extension Points SDK](./PLUGIN_SDK.md#extension-points-sdk-spec-013)
- [ADR-031: Extension Tables Core Shared Schema](../.forge/knowledge/adr/adr-031-extension-tables-core-shared-schema.md)

---

_Plexica Feature Flags v1.0_  
_Last Updated: March 2026_  
_Author: Plexica Engineering Team_
