# Plan: 006 - Internationalization (i18n)

> Technical implementation plan for the Plexica namespace-based
> internationalization system with plugin and tenant override support.
> Created by the `forge-architect` agent via `/forge-plan`.

| Field   | Value               |
| ------- | ------------------- |
| Status  | Implemented         |
| Author  | forge-architect     |
| Date    | 2026-02-13          |
| Updated | 2026-03-01          |
| Track   | Feature             |
| Spec    | [006-i18n](spec.md) |

---

## 1. Overview

This plan details the implementation of Plexica's namespace-based i18n system
(Spec 006). The feature adds:

1. A **`@plexica/i18n` shared package** (`packages/i18n/`) providing FormatJS
   wrappers, namespace loading, locale resolution, and tenant override merging
   for both backend (Node.js) and frontend (React).
2. An **i18n module** in core-api (`apps/core-api/src/modules/i18n/`) with a
   `TranslationService`, Fastify routes, and Redis caching.
3. **Prisma schema changes** adding `translation_overrides` (JSONB) and
   `default_locale` columns to the `Tenant` model.
4. **Plugin manifest extension** adding an optional `translations` section
   with `namespaces` and `supportedLocales` fields.
5. **Content-hashed translation delivery** with immutable cache headers for
   CDN-friendly distribution.
6. **Frontend integration** with React `IntlContext`, `useTranslations` hook,
   `LanguageSelector` component, and Translation Override Admin UI.

**Approach**: Bottom-up implementation — database migration first, then shared
package, then backend service/routes, then plugin manifest integration, then
frontend integration. Each layer is independently testable.

**Key ADR**: [ADR-012](../../knowledge/adr/adr-012-icu-messageformat-library.md)
(FormatJS selected over i18next and LinguiJS for ICU MessageFormat support).

**Implementation Status**: ✅ **100% COMPLETE** — 6/6 milestones delivered
across Sprint 1 (backend, Feb 15) and Sprint 2 (frontend, Feb 16). 378 tests
(333 backend + 45 frontend) across 16 test files. Coverage: ≥85% backend,
≥82% frontend.

---

## 2. Data Model

### 2.1 New Tables

No new tables are created. The i18n system uses file-based translation storage
(FR-002) and extends the existing `Tenant` model with two new columns.

### 2.2 Modified Tables

#### tenants (core.tenants)

| Column                  | Change | Before | After                                                            |
| ----------------------- | ------ | ------ | ---------------------------------------------------------------- |
| `translation_overrides` | Add    | —      | `JSONB NOT NULL DEFAULT '{}'` — per-tenant translation overrides |
| `default_locale`        | Add    | —      | `VARCHAR(10) NOT NULL DEFAULT 'en'` — tenant default locale      |

**Prisma schema additions** (in `packages/database/prisma/schema.prisma`):

```prisma
model Tenant {
  // ... existing fields ...
  translationOverrides Json   @default("{}") @map("translation_overrides")
  defaultLocale        String @default("en") @map("default_locale")
}
```

**JSONB structure for `translation_overrides`** (FR-006, FR-007):

```json
{
  "en": {
    "crm": {
      "deals.title": "Opportunities",
      "deals.subtitle": "Your sales pipeline"
    }
  },
  "it": {
    "crm": {
      "deals.title": "Opportunità"
    }
  }
}
```

### 2.3 Indexes

| Table   | Index Name                   | Columns          | Type  |
| ------- | ---------------------------- | ---------------- | ----- |
| tenants | `idx_tenants_default_locale` | `default_locale` | BTREE |

> The `translation_overrides` column does not need a dedicated index; it is
> read as a whole JSON document per tenant, not queried by individual keys.
> If future query patterns emerge (e.g., searching tenants by override keys),
> a GIN index can be added then.

### 2.4 Migrations

1. **Migration: `add_tenant_i18n_columns`**
   - Add `translation_overrides JSONB NOT NULL DEFAULT '{}'` to `core.tenants`
   - Add `default_locale VARCHAR(10) NOT NULL DEFAULT 'en'` to `core.tenants`
   - Create index `idx_tenants_default_locale` on `core.tenants(default_locale)`
   - **Backward compatible**: Both columns have defaults; existing rows are
     unaffected (Art. 9.1: safe migrations)

2. **Run**: `pnpm db:migrate` → `pnpm db:generate`

### 2.5 Data Validation Rules

| Field                   | Validation                                                               |
| ----------------------- | ------------------------------------------------------------------------ |
| `default_locale`        | BCP 47 format, max 10 chars (e.g., `en`, `it`, `de`, `en-US`)            |
| `translation_overrides` | JSONB, max 1MB payload; keys validated per FR-011 rules                  |
| Override key format     | Max 128 chars, `[a-zA-Z0-9._]` only, max 5 nesting levels, no `_system.` |
| Override value          | String, max 4096 chars per value                                         |

---

## 3. API Endpoints

### 3.1 GET /api/v1/translations/:locale/:namespace

- **Description**: Retrieve compiled translations for a specific locale and
  plugin namespace. Returns content-hashed response for immutable caching.
- **Auth**: **Public** (unauthenticated — translations are static,
  non-sensitive content; explicit Art. 5.1 exemption per spec)
- **Rate Limit**: Standard public rate limit (100 req/s per IP)
- **Request**:

  ```
  GET /api/v1/translations/en/crm HTTP/1.1
  Accept: application/json
  If-None-Match: "a1b2c3d4"
  ```

  - **Path params**:
    - `locale` (string, required): BCP 47 locale code (e.g., `en`, `it`, `de`)
    - `namespace` (string, required): Plugin namespace (e.g., `core`, `crm`)
  - **Query params**:
    - `tenant` (string, optional): Tenant slug — if provided, tenant overrides
      are merged into the response

- **Response (200)**:

  ```json
  {
    "locale": "en",
    "namespace": "crm",
    "hash": "a1b2c3d4",
    "messages": {
      "contacts.title": "Contacts",
      "contacts.new": "New Contact",
      "contacts.count": "{count, plural, =0 {No contacts} one {# contact} other {# contacts}}",
      "contacts.fields.name": "Name",
      "contacts.fields.email": "Email"
    }
  }
  ```

  - **Headers**:
    - `Cache-Control: public, immutable, max-age=31536000`
    - `ETag: "a1b2c3d4"` (content hash)
    - `Content-Type: application/json; charset=utf-8`

- **Response (304)**: Not Modified (when `If-None-Match` matches current hash)
- **Error Responses**:

  | Status | Code                  | When                                                 |
  | ------ | --------------------- | ---------------------------------------------------- |
  | 400    | `INVALID_LOCALE`      | Locale code fails BCP 47 validation                  |
  | 404    | `LOCALE_NOT_FOUND`    | No translations exist for the requested locale       |
  | 404    | `NAMESPACE_NOT_FOUND` | Namespace not found or associated plugin is disabled |

### 3.2 GET /api/v1/translations/locales

- **Description**: List all available locales with their display names and
  supported namespace counts.
- **Auth**: **Public** (unauthenticated)
- **Request**:
  ```
  GET /api/v1/translations/locales HTTP/1.1
  Accept: application/json
  ```
- **Response (200)**:
  ```json
  {
    "locales": [
      { "code": "en", "name": "English", "nativeName": "English", "namespaceCount": 5 },
      { "code": "it", "name": "Italian", "nativeName": "Italiano", "namespaceCount": 3 },
      { "code": "es", "name": "Spanish", "nativeName": "Español", "namespaceCount": 3 },
      { "code": "de", "name": "German", "nativeName": "Deutsch", "namespaceCount": 2 }
    ],
    "defaultLocale": "en"
  }
  ```
- **Error Responses**: None expected (always returns at least `en`).

### 3.3 GET /api/v1/tenant/translations/overrides

- **Description**: Get the current tenant's translation overrides.
- **Auth**: Bearer token required (tenant member)
- **Request**:
  ```
  GET /api/v1/tenant/translations/overrides HTTP/1.1
  Authorization: Bearer <token>
  X-Tenant-Slug: acme-corp
  ```
- **Response (200)**:
  ```json
  {
    "overrides": {
      "en": {
        "crm": {
          "deals.title": "Opportunities"
        }
      }
    },
    "updatedAt": "2026-02-13T10:30:00Z"
  }
  ```
- **Error Responses**:

  | Status | Code           | When                             |
  | ------ | -------------- | -------------------------------- |
  | 401    | `UNAUTHORIZED` | Missing or invalid bearer token  |
  | 403    | `FORBIDDEN`    | User not a member of this tenant |

### 3.4 PUT /api/v1/tenant/translations/overrides

- **Description**: Update the current tenant's translation overrides. Replaces
  the entire overrides object (full replacement, not patch).
- **Auth**: Bearer token + `tenant_admin` role required
- **Request**:
  ```json
  {
    "overrides": {
      "en": {
        "crm": {
          "deals.title": "Opportunities",
          "deals.subtitle": "Your sales pipeline"
        }
      },
      "it": {
        "crm": {
          "deals.title": "Opportunità"
        }
      }
    }
  }
  ```
- **Response (200)**:
  ```json
  {
    "overrides": {
      "en": {
        "crm": {
          "deals.title": "Opportunities",
          "deals.subtitle": "Your sales pipeline"
        }
      },
      "it": {
        "crm": {
          "deals.title": "Opportunità"
        }
      }
    },
    "updatedAt": "2026-02-13T10:35:00Z"
  }
  ```
- **Side effects**:
  - Invalidate Redis cache for this tenant's translations
  - Regenerate content hashes for affected locale/namespace combinations
- **Error Responses**:

  | Status | Code                      | When                                       |
  | ------ | ------------------------- | ------------------------------------------ |
  | 400    | `INVALID_TRANSLATION_KEY` | Override key fails Zod validation (FR-011) |
  | 401    | `UNAUTHORIZED`            | Missing or invalid bearer token            |
  | 403    | `FORBIDDEN`               | User lacks `tenant_admin` role             |
  | 413    | `PAYLOAD_TOO_LARGE`       | Override payload exceeds 1MB               |

---

## 4. Component Design

### 4.1 TranslationService (Backend)

- **Purpose**: Core backend service for translation resolution, caching,
  tenant override merging, and content hash generation.
- **Location**: `apps/core-api/src/modules/i18n/i18n.service.ts`
- **Responsibilities**:
  - Load translation files from disk (file-based structure)
  - Merge tenant overrides from database onto plugin translations
  - Generate content hashes (SHA-256, truncated to 8 hex chars) for
    immutable caching
  - Cache resolved translations in Redis with tenant-prefixed keys
  - Invalidate cache on tenant override updates
  - Validate translation keys against Zod schema (FR-011)
  - Enforce 200KB file size limit per namespace (FR-012)
  - Resolve locale fallback chain: requested → `en` (FR-003)
- **Dependencies**:
  - `PrismaClient` (tenant override reads/writes)
  - `Redis` (caching layer)
  - `PluginService` (enabled plugin lookup for namespace filtering)
  - `@plexica/i18n` (shared utilities — key flattening, hash generation)
- **Key Methods**:

  | Method                    | Parameters                                               | Returns                  | Description                                                       |
  | ------------------------- | -------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------- |
  | `getTranslations`         | `locale: string, namespace: string, tenantSlug?: string` | `TranslationBundle`      | Load translations with optional tenant override merge             |
  | `getAvailableLocales`     | `(none)`                                                 | `LocaleInfo[]`           | List all available locales with metadata                          |
  | `getTenantOverrides`      | `tenantId: string`                                       | `TenantOverrides`        | Get raw tenant translation overrides from database                |
  | `updateTenantOverrides`   | `tenantId: string, overrides: TenantOverrides`           | `TenantOverrides`        | Update tenant overrides; invalidate cache                         |
  | `getContentHash`          | `locale: string, namespace: string, tenantSlug?: string` | `string`                 | Generate content hash for cache-busting URLs                      |
  | `invalidateTenantCache`   | `tenantSlug: string`                                     | `void`                   | Clear all cached translations for a tenant                        |
  | `validateTranslationKeys` | `keys: string[]`                                         | `ValidationResult`       | Validate keys against FR-011 rules (max 128 chars, allowed chars) |
  | `loadNamespaceFile`       | `locale: string, namespace: string`                      | `Record<string, string>` | Load and flatten a single namespace JSON file                     |
  | `getEnabledNamespaces`    | `tenantId: string`                                       | `string[]`               | Get namespaces for enabled plugins only (FR-005)                  |

### 4.2 TranslationRoutes (Backend)

- **Purpose**: Fastify route handlers for the 4 translation API endpoints.
- **Location**: `apps/core-api/src/modules/i18n/i18n.controller.ts`
- **Responsibilities**:
  - Register routes with Fastify JSON Schema validation
  - Apply auth middleware selectively (public for GET translations/locales;
    authenticated for tenant override endpoints)
  - Apply `requireRole('tenant_admin')` for PUT override endpoint
  - Set cache headers on translation responses
  - Handle ETag/304 Not Modified responses
- **Dependencies**:
  - `TranslationService`
  - `authMiddleware`, `requireRole` from `../../middleware/auth.js`
  - `TenantContext` from `../../middleware/tenant-context.js`

### 4.3 TranslationKeySchema (Zod)

- **Purpose**: Zod validation schemas for translation keys and override
  payloads (FR-011, Art. 5.3).
- **Location**: `apps/core-api/src/modules/i18n/i18n.schemas.ts`
- **Responsibilities**:
  - Validate individual translation key format: max 128 chars, `[a-zA-Z0-9._]`,
    max 5 nesting levels, no `_system.` prefix
  - Validate tenant override payload structure: locale → namespace → key → value
  - Validate payload size (max 1MB)
  - Export `TranslationKeySchema`, `TenantOverrideSchema`,
    `TranslationOverridePayloadSchema`
- **Key Schemas**:

  | Schema                             | Validates                                        |
  | ---------------------------------- | ------------------------------------------------ |
  | `TranslationKeySchema`             | Single dotted key (e.g., `contacts.fields.name`) |
  | `LocaleCodeSchema`                 | BCP 47 locale code (e.g., `en`, `it-IT`)         |
  | `NamespaceSchema`                  | Plugin namespace identifier                      |
  | `TenantOverrideSchema`             | Full `{ locale: { ns: { key: value } } }` object |
  | `TranslationOverridePayloadSchema` | Request body for PUT overrides endpoint          |

### 4.4 @plexica/i18n Package

- **Purpose**: Shared i18n utilities for backend and frontend, wrapping
  FormatJS APIs.
- **Location**: `packages/i18n/`
- **Responsibilities**:
  - Flatten nested translation JSON into dotted key paths
  - Unflatten dotted keys back to nested objects (for editing UI)
  - Generate content hashes from translation bundles (SHA-256)
  - Provide `createNamespacedIntl()` factory wrapping `createIntl` from
    `@formatjs/intl`
  - Provide `resolveLocale()` for fallback chain logic (FR-009):
    `browser → user.locale → tenant.defaultLocale → "en"`
  - Provide `mergeOverrides()` for applying tenant overrides onto base
    translations
  - Provide `isValidLocale()` for BCP 47 locale code validation
  - Export TypeScript types: `TranslationBundle`, `TenantOverrides`,
    `LocaleInfo`, `NamespacedMessages`
- **Dependencies**:
  - `@formatjs/intl` (core intl API)
  - `intl-messageformat` (peer dependency)
- **Key Exports**:

  | Export                 | Type     | Description                                             |
  | ---------------------- | -------- | ------------------------------------------------------- |
  | `flattenMessages`      | Function | `Record<string, any> → Record<string, string>`          |
  | `unflattenMessages`    | Function | `Record<string, string> → Record<string, any>`          |
  | `generateContentHash`  | Function | `messages → string` (8-char hex SHA-256)                |
  | `createNamespacedIntl` | Function | Factory for namespace-scoped `IntlShape` instances      |
  | `resolveLocale`        | Function | Fallback chain resolution                               |
  | `mergeOverrides`       | Function | Base messages + tenant overrides → merged messages      |
  | `isValidLocale`        | Function | BCP 47 locale code validation                           |
  | `TranslationBundle`    | Type     | `{ locale, namespace, hash, messages }`                 |
  | `TenantOverrides`      | Type     | `Record<locale, Record<namespace, Record<key, value>>>` |
  | `LocaleInfo`           | Type     | `{ code, name, nativeName, namespaceCount }`            |

### 4.5 Plugin Manifest Extension

- **Purpose**: Extend the plugin manifest type and Zod schema to support the
  `translations` section (FR-004).
- **Locations**:
  - `apps/core-api/src/types/plugin.types.ts` (TypeScript interface)
  - `apps/core-api/src/schemas/plugin-manifest.schema.ts` (Zod schema)
- **Changes**:

  **TypeScript interface addition** (in `PluginManifest`):

  ```typescript
  translations?: {
    namespaces: string[];
    supportedLocales: string[];
  };
  ```

  **Zod schema addition** (in `PluginManifestSchema`):

  ```typescript
  translations: z.object({
    namespaces: z.array(z.string().regex(/^[a-z0-9\-]+$/)).min(1),
    supportedLocales: z.array(z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/)).min(1),
  }).optional(),
  ```

### 4.6 TranslationCacheService (Backend)

- **Purpose**: Dedicated Redis caching layer for translations with
  tenant-prefixed keys and content-hash tracking.
- **Location**: `apps/core-api/src/modules/i18n/i18n-cache.service.ts`
- **Responsibilities**:
  - Cache resolved translation bundles in Redis
  - Store content hashes per locale/namespace/tenant combination
  - Invalidate cache on tenant override updates
  - Support TTL-based expiration (1 hour default, configurable)
- **Key patterns**:
  - Cache key: `i18n:{locale}:{namespace}` (no tenant) or
    `i18n:{tenantSlug}:{locale}:{namespace}` (with tenant overrides)
  - Hash key: `i18n:hash:{locale}:{namespace}` or
    `i18n:hash:{tenantSlug}:{locale}:{namespace}`
- **Key Methods**:

  | Method             | Parameters                                     | Returns              | Description                      |
  | ------------------ | ---------------------------------------------- | -------------------- | -------------------------------- |
  | `getCached`        | `locale, namespace, tenantSlug?`               | `TranslationBundle?` | Get cached bundle or null        |
  | `setCached`        | `bundle: TranslationBundle, tenantSlug?, ttl?` | `void`               | Store bundle in Redis            |
  | `getHash`          | `locale, namespace, tenantSlug?`               | `string?`            | Get stored content hash          |
  | `invalidateTenant` | `tenantSlug: string`                           | `void`               | Clear all cached data for tenant |
  | `invalidateAll`    | `(none)`                                       | `void`               | Clear entire i18n cache          |

### 4.7 IntlContext (Frontend)

- **Purpose**: React context providing locale state management and
  `react-intl` integration for the entire app.
- **Location**: `apps/web/src/contexts/IntlContext.tsx`
- **Responsibilities**:
  - Manage current locale state via React `useState`
  - Resolve initial locale via `@plexica/i18n` `resolveLocale()` (FR-009)
  - Persist locale preference to `localStorage`
  - Wrap children with `react-intl` `IntlProvider`
  - Provide `setLocale`, `messages`, `setMessages`, `mergeMessages` to
    consumers
- **Dependencies**:
  - `react-intl` (`IntlProvider`)
  - `@plexica/i18n` (`resolveLocale`, `isValidLocale`)
- **Key Exports**:

  | Export         | Type      | Description                                                              |
  | -------------- | --------- | ------------------------------------------------------------------------ |
  | `IntlProvider` | Component | Context provider wrapping `react-intl`                                   |
  | `useIntl`      | Hook      | Access `locale`, `setLocale`, `messages`, `setMessages`, `mergeMessages` |

### 4.8 useTranslations Hook (Frontend)

- **Purpose**: React hook for fetching translations from the API and
  caching them in-memory via TanStack Query.
- **Location**: `apps/web/src/hooks/useTranslations.ts`
- **Responsibilities**:
  - Fetch translations from `GET /api/v1/translations/:locale/:namespace`
  - Support tenant-specific overrides for authenticated users
  - Cache via TanStack Query with namespace-scoped query keys
  - Merge fetched messages into `IntlContext` via `mergeMessages`
  - Handle loading, error, success states
  - Respect ETag for 304 Not Modified (via axios interceptor)
- **Dependencies**:
  - `@tanstack/react-query` (`useQuery`, `useQueries`)
  - `IntlContext` (via `useIntl`)
  - `apiClient` (HTTP client)
- **Key Exports**:

  | Export            | Type | Description                                             |
  | ----------------- | ---- | ------------------------------------------------------- |
  | `useTranslations` | Hook | Fetch and cache single namespace translations           |
  | `useNamespaces`   | Hook | Fetch multiple namespaces in parallel (enabled plugins) |

### 4.9 LanguageSelector Component (Frontend UI)

- **Purpose**: Dropdown component for selecting the active locale. Displayed
  in the app header and user profile settings.
- **Location**: `packages/ui/src/components/LanguageSelector/LanguageSelector.tsx`
- **Responsibilities**:
  - Render a Radix UI `Select` with locale options in native script names
    (no flag icons per WCAG 2.1 AA / spec §9)
  - Show check icon for currently active locale
  - Globe (`Languages` icon from lucide-react) as trigger
  - Accept `locales`, `value`, `onChange`, `disabled`, `ariaLabel` props
- **Dependencies**:
  - `@radix-ui/react-select` (accessible select primitive)
  - `lucide-react` (`Check`, `ChevronDown`, `Languages` icons)
- **Props**:

  | Prop          | Type                     | Required | Description                    |
  | ------------- | ------------------------ | -------- | ------------------------------ |
  | `locales`     | `LocaleOption[]`         | Yes      | Available locale codes + names |
  | `value`       | `string`                 | Yes      | Currently selected locale code |
  | `onChange`    | `(code: string) => void` | Yes      | Callback on locale change      |
  | `disabled`    | `boolean`                | No       | Disable selector               |
  | `className`   | `string`                 | No       | Additional CSS classes         |
  | `placeholder` | `string`                 | No       | Placeholder text               |
  | `ariaLabel`   | `string`                 | No       | Custom ARIA label              |

- **Accessibility** (design-spec §3, Screen 1):
  - `aria-haspopup="true"`, `aria-expanded` on trigger
  - `role="menu"` with `role="menuitem"` for options
  - Arrow key navigation, Enter/Space selection, Esc to close
  - Language names in native script (self-describing)

### 4.10 Translation Override Admin UI (Frontend)

- **Purpose**: Full-page admin interface for viewing and editing per-tenant
  translation overrides.
- **Location**: `apps/web/src/routes/admin.translation-overrides.tsx`
- **Responsibilities**:
  - Render locale selector, search input, namespace filter chips
  - Display translation key table with Original and Override columns
  - Inline editing with live preview for ICU MessageFormat keys
  - Orphaned key detection and warning badges (FR-014)
  - Dirty state tracking with unsaved changes indicator
  - Save/discard controls calling `PUT /api/v1/tenant/translations/overrides`
  - Zod validation of override keys before submission
- **Dependencies**:
  - `@plexica/ui` components (`Button`, `Input`, `Card`, `Alert`, `Badge`, `Select`)
  - `useTranslations` hook
  - `useAuthStore` (RBAC check)
  - `apiClient` (PUT endpoint)
  - `lucide-react` icons (`Search`, `Save`, `AlertCircle`, `Check`, `AlertTriangle`)
  - `zod` (client-side validation)
- **Access Control**: `tenant_admin` role required (guards via `ProtectedRoute`)
- **Responsive Behavior** (design-spec §3, Screen 2):
  - 1440px: Full 3-column table with sidebar
  - 1024px: Sidebar collapsed to icons
  - 768px: Table stacks to 2 rows per key
  - 375px: Card layout, sticky save bar

---

## 5. File Map

### 5.1 New Files

#### Backend — Shared Package (`packages/i18n/`)

| Path                           | Purpose                                                    | Size |
| ------------------------------ | ---------------------------------------------------------- | ---- |
| `packages/i18n/package.json`   | Package manifest for `@plexica/i18n`                       | S    |
| `packages/i18n/tsconfig.json`  | TypeScript configuration                                   | S    |
| `packages/i18n/src/index.ts`   | Package entry — re-exports all public APIs                 | S    |
| `packages/i18n/src/flatten.ts` | `flattenMessages` and `unflattenMessages` utilities        | S    |
| `packages/i18n/src/hash.ts`    | `generateContentHash` (SHA-256 → 8-char hex)               | S    |
| `packages/i18n/src/locale.ts`  | `resolveLocale` fallback chain logic, `isValidLocale`      | S    |
| `packages/i18n/src/merge.ts`   | `mergeOverrides` — tenant overrides onto base translations | S    |
| `packages/i18n/src/intl.ts`    | `createNamespacedIntl` FormatJS wrapper                    | M    |
| `packages/i18n/src/types.ts`   | Shared types: `TranslationBundle`, `TenantOverrides`, etc. | S    |

#### Backend — Core API Module (`apps/core-api/src/modules/i18n/`)

| Path                                                   | Purpose                                   | Size |
| ------------------------------------------------------ | ----------------------------------------- | ---- |
| `apps/core-api/src/modules/i18n/i18n.service.ts`       | Core translation service (see §4.1)       | L    |
| `apps/core-api/src/modules/i18n/i18n.controller.ts`    | Fastify route handlers (see §4.2)         | M    |
| `apps/core-api/src/modules/i18n/i18n.schemas.ts`       | Zod validation schemas (see §4.3)         | M    |
| `apps/core-api/src/modules/i18n/i18n-cache.service.ts` | Redis caching layer (see §4.6)            | M    |
| `apps/core-api/src/modules/i18n/index.ts`              | Module barrel export                      | S    |
| `apps/core-api/translations/en/core.json`              | Core platform English translations (seed) | S    |

#### Frontend — React Integration

| Path                                                                       | Purpose                                                        | Size |
| -------------------------------------------------------------------------- | -------------------------------------------------------------- | ---- |
| `apps/web/src/contexts/IntlContext.tsx`                                    | React context for locale state + react-intl wrapper (see §4.7) | M    |
| `apps/web/src/hooks/useTranslations.ts`                                    | Translation fetching hook with TanStack Query (see §4.8)       | M    |
| `packages/ui/src/components/LanguageSelector/LanguageSelector.tsx`         | Locale selector dropdown component (see §4.9)                  | M    |
| `packages/ui/src/components/LanguageSelector/LanguageSelector.stories.tsx` | Storybook stories (9 stories)                                  | M    |
| `apps/web/src/routes/admin.translation-overrides.tsx`                      | Translation override admin page (see §4.10)                    | XL   |

### 5.2 Modified Files

| Path                                                  | Section/Lines | Change Description                                                           | Size |
| ----------------------------------------------------- | ------------- | ---------------------------------------------------------------------------- | ---- |
| `packages/database/prisma/schema.prisma`              | Tenant model  | Add `translationOverrides` and `defaultLocale` to Tenant                     | S    |
| `apps/core-api/src/index.ts`                          | Route setup   | Register i18n routes (`/api/v1/translations`, `/api/v1/tenant/translations`) | S    |
| `apps/core-api/src/types/plugin.types.ts`             | Interface     | Add `translations` field to `PluginManifest` interface                       | S    |
| `apps/core-api/src/schemas/plugin-manifest.schema.ts` | Zod schema    | Add `translations` Zod schema to `PluginManifestSchema`                      | S    |
| `apps/core-api/package.json`                          | Dependencies  | Add `@plexica/i18n` workspace dependency                                     | S    |
| `apps/web/package.json`                               | Dependencies  | Add `react-intl`, `@plexica/i18n` dependencies                               | S    |
| `apps/web/src/main.tsx`                               | Root          | Wrap app with `IntlProvider`                                                 | S    |
| `apps/web/src/contexts/index.ts`                      | Re-exports    | Add `IntlContext` export                                                     | S    |
| `apps/web/src/routes/__root.tsx`                      | Layout        | Add `LanguageSelector` to app header                                         | S    |
| `pnpm-workspace.yaml`                                 | Packages      | Add `packages/i18n` to workspace packages (if not covered by glob)           | S    |

### 5.3 Test Files

#### Backend — @plexica/i18n Package Tests

| Path                                          | Purpose                                       | Type |
| --------------------------------------------- | --------------------------------------------- | ---- |
| `packages/i18n/src/__tests__/flatten.test.ts` | Unit: flatten/unflatten                       | Unit |
| `packages/i18n/src/__tests__/hash.test.ts`    | Unit: content hash generation                 | Unit |
| `packages/i18n/src/__tests__/locale.test.ts`  | Unit: locale fallback chain resolution        | Unit |
| `packages/i18n/src/__tests__/merge.test.ts`   | Unit: tenant override merging                 | Unit |
| `packages/i18n/src/__tests__/intl.test.ts`    | Unit: FormatJS wrapper, ICU plural formatting | Unit |

#### Backend — Core API i18n Module Tests

| Path                                                                       | Purpose                                                | Type        |
| -------------------------------------------------------------------------- | ------------------------------------------------------ | ----------- |
| `apps/core-api/src/__tests__/i18n/unit/translation.service.test.ts`        | Unit: TranslationService business logic                | Unit        |
| `apps/core-api/src/__tests__/i18n/unit/translation.schemas.test.ts`        | Unit: Zod schema validation                            | Unit        |
| `apps/core-api/src/__tests__/i18n/unit/translation-cache.service.test.ts`  | Unit: Redis cache operations (mocked)                  | Unit        |
| `apps/core-api/src/__tests__/i18n/integration/translation.routes.test.ts`  | Integration: API endpoint tests with DB                | Integration |
| `apps/core-api/src/__tests__/i18n/integration/tenant-overrides.test.ts`    | Integration: tenant override CRUD + cache invalidation | Integration |
| `apps/core-api/src/__tests__/i18n/integration/plugin-translations.test.ts` | Integration: plugin manifest translation validation    | Integration |
| `apps/core-api/src/__tests__/i18n/e2e/locale-switching.test.ts`            | E2E: full locale switch flow with fallback             | E2E         |
| `apps/core-api/src/__tests__/i18n/e2e/plugin-translations.test.ts`         | E2E: plugin enable → namespace available → translate   | E2E         |

#### Frontend Tests

| Path                                                                    | Purpose                                        | Type |
| ----------------------------------------------------------------------- | ---------------------------------------------- | ---- |
| `apps/web/src/contexts/IntlContext.test.tsx`                            | Unit: IntlContext provider and hook (16 tests) | Unit |
| `apps/web/src/hooks/useTranslations.test.tsx`                           | Unit: useTranslations hook (15 tests)          | Unit |
| `packages/ui/src/components/LanguageSelector/LanguageSelector.test.tsx` | Unit: LanguageSelector component (15 tests)    | Unit |
| `apps/web/tests/e2e/locale-switching.spec.ts`                           | E2E: Playwright locale switch flow (14 tests)  | E2E  |

---

## 6. Dependencies

### 6.1 New Dependencies

| Package              | Version | Scope           | Purpose                                                         |
| -------------------- | ------- | --------------- | --------------------------------------------------------------- |
| `@formatjs/intl`     | ^2.x    | `packages/i18n` | Core intl API (backend + frontend)                              |
| `intl-messageformat` | ^10.x   | `packages/i18n` | ICU MessageFormat parser (peer dep)                             |
| `react-intl`         | ^7.x    | `apps/web`      | React components and hooks for i18n (`IntlProvider`, `useIntl`) |
| `@formatjs/cli`      | ^6.x    | Dev             | Message extraction and compilation                              |

> All approved via [ADR-012](../../knowledge/adr/adr-012-icu-messageformat-library.md).
> Dependency policy compliance (Art. 2.2): >1000 weekly downloads ✅,
> no known vulnerabilities ✅, TypeScript support ✅, ADR approval ✅.

### 6.2 Internal Dependencies

- **`@plexica/database`** — Prisma client for Tenant model operations
  (override reads/writes)
- **`@plexica/i18n`** — Shared utilities consumed by `core-api` and `apps/web`
- **`@plexica/ui`** — UI component library hosting `LanguageSelector`
- **`ioredis`** — Existing Redis client (`apps/core-api/src/lib/redis.ts`)
  used by `TranslationCacheService`
- **`zod`** — Existing validation library used for translation key and
  override payload schemas
- **`PluginService`** — Existing service for determining enabled plugins
  (namespace filtering per FR-005)
- **`TenantContext`** — Existing middleware for tenant identification on
  authenticated endpoints
- **`@tanstack/react-query`** — Existing query library used by
  `useTranslations` hook for caching and deduplication
- **`@radix-ui/react-select`** — Existing accessible select primitive used
  by `LanguageSelector`
- **`lucide-react`** — Existing icon library (`Languages`, `Check`, etc.)

### 6.3 Configuration Changes

| File / Location           | Change                                                      |
| ------------------------- | ----------------------------------------------------------- |
| `apps/core-api/.env`      | No new env vars required (translations use filesystem path) |
| `pnpm-workspace.yaml`     | Add `packages/i18n` if not covered by existing glob pattern |
| `apps/web/vite.config.ts` | No changes (existing alias resolution covers new paths)     |

---

## 7. Implementation Phases

### Phase 1: Database Schema & Migrations

**Objective**: Add i18n-related columns to the `Tenant` model and create
necessary indexes.

**Files to Create**:

- `packages/database/prisma/migrations/NNNN_add_tenant_i18n_columns/migration.sql`
  - Purpose: Prisma migration for `translation_overrides` and `default_locale`
  - Dependencies: None (foundation layer)
  - Estimated effort: 2h

**Files to Modify**:

- `packages/database/prisma/schema.prisma`
  - Section: `model Tenant { ... }`
  - Change: Add `translationOverrides` and `defaultLocale` fields
  - Estimated effort: 30min

**Tasks**:

1. [x] Add Prisma schema fields to Tenant model `[FR-006, FR-009]`
2. [x] Create and test migration `[FR-006]`
3. [x] Verify backward compatibility (defaults on existing rows)
4. [x] Create 11 migration validation tests

### Phase 2: Shared Package (`@plexica/i18n`)

**Objective**: Build the shared i18n utility package with FormatJS wrappers,
key flattening, hash generation, locale resolution, and override merging.

**Files to Create**:

- `packages/i18n/package.json` — Package manifest
- `packages/i18n/tsconfig.json` — TypeScript config
- `packages/i18n/src/index.ts` — Entry point
- `packages/i18n/src/flatten.ts` — Key flattening/unflattening
- `packages/i18n/src/hash.ts` — SHA-256 content hash
- `packages/i18n/src/locale.ts` — Locale resolution chain
- `packages/i18n/src/merge.ts` — Override merging
- `packages/i18n/src/intl.ts` — FormatJS wrapper
- `packages/i18n/src/types.ts` — Shared TypeScript types
- `packages/i18n/src/__tests__/*.test.ts` — 5 test files

**Dependencies**: Phase 1 (migration provides `default_locale` type)

**Estimated effort**: 1 day

**Tasks**:

1. [x] Scaffold `@plexica/i18n` package `[ADR-012, ADR-001]`
2. [x] Implement `flattenMessages` / `unflattenMessages` `[FR-010]`
3. [x] Implement `generateContentHash` `[NFR-005]`
4. [x] Implement `resolveLocale` fallback chain `[FR-003, FR-009]`
5. [x] Implement `mergeOverrides` `[FR-007]`
6. [x] Implement `createNamespacedIntl` with ICU support `[FR-013]`
7. [x] Write 115 unit tests (target ≥90% coverage)

### Phase 3: Backend i18n Service & Routes

**Objective**: Build the core-api i18n module with TranslationService,
TranslationCacheService, and 4 API endpoints.

**Files to Create**:

- `apps/core-api/src/modules/i18n/i18n.service.ts`
- `apps/core-api/src/modules/i18n/i18n.controller.ts`
- `apps/core-api/src/modules/i18n/i18n.schemas.ts`
- `apps/core-api/src/modules/i18n/i18n-cache.service.ts`
- `apps/core-api/src/modules/i18n/index.ts`
- `apps/core-api/translations/en/core.json`
- 8 test files (3 unit, 3 integration, 2 E2E)

**Files to Modify**:

- `apps/core-api/src/index.ts` — Register i18n routes
- `apps/core-api/package.json` — Add `@plexica/i18n` dependency

**Dependencies**: Phase 2 (`@plexica/i18n` utilities)

**Estimated effort**: 2 days

**Tasks**:

1. [x] Implement `TranslationService` `[FR-001–FR-003, FR-005–FR-007, FR-010–FR-012]`
2. [x] Implement `TranslationCacheService` `[NFR-001, NFR-002, NFR-005]`
3. [x] Implement Zod schemas `[FR-011, Art. 5.3]`
4. [x] Implement 4 API routes with auth middleware `[§3.1–3.4]`
5. [x] Write unit, integration, and E2E tests (218 tests)

### Phase 4: Plugin Manifest Integration

**Objective**: Extend plugin manifest to support `translations` section;
validate translation files at plugin registration.

**Files to Modify**:

- `apps/core-api/src/types/plugin.types.ts` — Add interface
- `apps/core-api/src/schemas/plugin-manifest.schema.ts` — Add Zod schema

**Dependencies**: Phase 3 (TranslationService for file validation)

**Estimated effort**: 4h

**Tasks**:

1. [x] Extend `PluginManifest` interface `[FR-004]`
2. [x] Add Zod validation for `translations` section `[FR-004, FR-011]`
3. [x] Enforce 200KB namespace file size limit `[FR-012]`
4. [x] Write plugin manifest translation integration tests

### Phase 5: Testing & Quality Assurance

**Objective**: Achieve ≥85% coverage across the i18n backend and ≥90%
for the shared package; security review.

**Dependencies**: Phases 1–4

**Estimated effort**: 1 day

**Tasks**:

1. [x] Run full test suite — 218 backend tests passing
2. [x] Achieve 94.9% coverage on `@plexica/i18n`
3. [x] Achieve ≥85% coverage on core-api i18n module
4. [x] Fix 9 security issues (4 HIGH, 4 MEDIUM, 1 LOW)

### Phase 6: Frontend Integration

**Objective**: Build React i18n integration with `IntlContext`,
`useTranslations` hook, `LanguageSelector` component, translation override
admin UI, and E2E tests.

**Files to Create**:

- `apps/web/src/contexts/IntlContext.tsx` — React context
- `apps/web/src/contexts/IntlContext.test.tsx` — 16 unit tests
- `apps/web/src/hooks/useTranslations.ts` — Translation hook
- `apps/web/src/hooks/useTranslations.test.tsx` — 15 unit tests
- `packages/ui/src/components/LanguageSelector/LanguageSelector.tsx` — Component
- `packages/ui/src/components/LanguageSelector/LanguageSelector.test.tsx` — 15 unit tests
- `packages/ui/src/components/LanguageSelector/LanguageSelector.stories.tsx` — 9 stories
- `apps/web/src/routes/admin.translation-overrides.tsx` — Admin page (600+ lines)
- `apps/web/tests/e2e/locale-switching.spec.ts` — 14 Playwright tests

**Files to Modify**:

- `apps/web/package.json` — Add `react-intl`, `@plexica/i18n`
- `apps/web/src/main.tsx` — Wrap with `IntlProvider`
- `apps/web/src/contexts/index.ts` — Re-export `IntlContext`
- `apps/web/src/routes/__root.tsx` — Add `LanguageSelector` to header

**Dependencies**: Phase 3 (API endpoints must be stable)

**Estimated effort**: 1 day

**Tasks**:

1. [x] Implement `IntlContext` with `react-intl` `[FR-008, FR-009]`
2. [x] Implement `useTranslations` hook `[FR-001, FR-005, NFR-001, NFR-002]`
3. [x] Build `LanguageSelector` in `@plexica/ui` `[FR-003, FR-008, Art. 1.3 WCAG]`
4. [x] Build Translation Override Admin UI `[FR-006, FR-007, FR-014]`
5. [x] Write E2E locale-switching tests `[FR-008]`
6. [x] Write 45 frontend tests (31 unit + 14 E2E)

---

## 8. Testing Strategy

### 8.1 Unit Tests

| Component                 | Test Focus                                                                  | Target Coverage | Actual    |
| ------------------------- | --------------------------------------------------------------------------- | --------------- | --------- |
| `flattenMessages`         | Nested to dotted paths; edge cases (empty, deep nesting, arrays)            | 100%            | ✅ 100%   |
| `unflattenMessages`       | Dotted paths back to nested; round-trip with flatten                        | 100%            | ✅ 100%   |
| `generateContentHash`     | Deterministic hashing; different input → different hash; empty input        | 100%            | ✅ 100%   |
| `resolveLocale`           | All 4 fallback levels; missing values; invalid locale codes                 | 100%            | ✅ 100%   |
| `mergeOverrides`          | Base + override merge; empty overrides; orphaned keys; nested overrides     | 100%            | ✅ 100%   |
| `createNamespacedIntl`    | ICU plurals (all 6 categories); interpolation; select; missing key fallback | ≥90%            | ✅ 94%    |
| `TranslationService`      | File loading; namespace filtering; cache interaction (mocked Redis)         | ≥85%            | ✅ ≥85%   |
| `TranslationCacheService` | Get/set/invalidate operations (mocked Redis)                                | ≥85%            | ✅ ≥85%   |
| `TranslationKeySchema`    | Valid keys; max length; forbidden chars; `_system.` prefix; nesting depth   | 100%            | ✅ 100%   |
| `TenantOverrideSchema`    | Valid structures; invalid locale; invalid namespace; payload size           | 100%            | ✅ 100%   |
| `IntlContext`             | Provider rendering; locale state; localStorage persistence; mergeMessages   | ≥80%            | ✅ 82.85% |
| `useTranslations`         | Hook fetching; TanStack Query caching; error handling; loading states       | 100%            | ✅ 100%   |
| `LanguageSelector`        | Rendering; selection; disabled state; accessibility attributes              | 100%            | ✅ 100%   |

### 8.2 Integration Tests

| Scenario                                | Dependencies               | Validates                     | Status |
| --------------------------------------- | -------------------------- | ----------------------------- | ------ |
| GET translations for valid locale/ns    | DB (Prisma), filesystem    | FR-001, FR-002, FR-003        | ✅     |
| GET translations with tenant overrides  | DB, Redis, filesystem      | FR-006, FR-007                | ✅     |
| GET translations for disabled plugin ns | DB, PluginService          | FR-005 (404 response)         | ✅     |
| GET available locales                   | Filesystem                 | Locale listing accuracy       | ✅     |
| GET tenant overrides (authenticated)    | DB, auth middleware        | Art. 5.1 (auth required)      | ✅     |
| PUT tenant overrides (tenant_admin)     | DB, Redis, auth + RBAC     | FR-006, FR-007, Art. 5 (RBAC) | ✅     |
| PUT overrides with invalid keys         | DB, Zod validation         | FR-011 (400 response)         | ✅     |
| PUT overrides exceeding 1MB             | Request body size          | 413 response                  | ✅     |
| ETag / 304 Not Modified                 | Redis (hash store)         | NFR-005 (caching)             | ✅     |
| Cache invalidation on override update   | DB, Redis                  | Cache consistency             | ✅     |
| Plugin manifest with translations field | Plugin validation pipeline | FR-004                        | ✅     |
| Plugin manifest with oversized file     | Plugin validation pipeline | FR-012 (rejected)             | ✅     |

### 8.3 E2E Tests

| Scenario                               | Flow                                                                                         | Status |
| -------------------------------------- | -------------------------------------------------------------------------------------------- | ------ |
| Locale switching with fallback         | Set user locale → load translations → verify correct locale → change → verify fallback to en | ✅     |
| Plugin enable → translations available | Enable plugin → GET its namespace → verify translations returned                             | ✅     |
| Tenant override lifecycle              | Create override → verify in GET → update → verify change → delete → verify removed           | ✅     |
| Plugin disable → namespace unavailable | Disable plugin → GET its namespace → verify 404 response                                     | ✅     |
| E2E: Playwright locale switching       | Browser locale switch → UI re-render → preference persistence → fallback behavior            | ✅     |

### 8.4 Coverage Summary

| Component                | Target   | Actual   | Tests   |
| ------------------------ | -------- | -------- | ------- |
| `@plexica/i18n` package  | ≥90%     | 94.9%    | 115     |
| `i18n` module (core-api) | ≥85%     | ≥85%     | 218     |
| `IntlContext`            | ≥80%     | 82.85%   | 16      |
| `useTranslations`        | ≥80%     | 100%     | 15      |
| `LanguageSelector`       | ≥80%     | 100%     | 15      |
| Playwright E2E           | N/A      | N/A      | 14      |
| **Total**                | **≥85%** | **≥85%** | **378** |

---

## 9. Architectural Decisions

| ADR     | Decision                                                                     | Status   |
| ------- | ---------------------------------------------------------------------------- | -------- |
| ADR-012 | FormatJS for ICU MessageFormat (over i18next)                                | Accepted |
| ADR-003 | TypeScript-only plugins (translation files are JSON shipped with TS plugins) | Accepted |
| ADR-001 | Monorepo strategy (new `@plexica/i18n` package)                              | Accepted |
| ADR-010 | Shared types package pattern (followed for i18n)                             | Accepted |

**Design decisions made in this plan** (not requiring full ADRs):

1. **File-based translation storage** (not database): Translations stored as
   JSON files on disk, loaded into memory at startup and cached in Redis.
   Database used only for tenant overrides. Rationale: translations are
   static content deployed with plugins; file-based enables CDN distribution
   and compile-time optimization per ADR-012.

2. **Full replacement for override PUT** (not JSON Patch): The PUT endpoint
   replaces the entire `translation_overrides` JSONB column rather than
   supporting partial JSON Patch. Rationale: overrides are a small document
   (typically < 50KB); full replacement is simpler, avoids merge conflicts,
   and matches Prisma's `update` semantics.

3. **Content hash strategy**: SHA-256 of the JSON-stringified sorted message
   keys + values, truncated to 8 hex characters. Provides 4 billion unique
   hashes — sufficient for translation versioning. Collision risk is negligible
   for this use case.

4. **React IntlContext pattern**: Separate `IntlContext` wrapping `react-intl`
   `IntlProvider` rather than using `react-intl` directly. Rationale: provides
   `mergeMessages()` for incremental namespace loading and `setLocale()` for
   runtime switching without full page reload (FR-008). TanStack Query handles
   API caching; IntlContext manages the merged message state.

5. **LanguageSelector in `@plexica/ui`** (not inline): Built as a reusable
   component in the UI library using Radix `Select` primitive. Rationale:
   consistent with existing component library pattern; enables use in both
   header dropdown and profile settings (design-spec Screen 1A/1B).

---

## 10. Requirement Traceability

| Requirement | Plan Section            | Implementation Path                                                                            | Test File(s)                                             |
| ----------- | ----------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| FR-001      | §4.1, §4.4              | `TranslationService.getTranslations()`, `@plexica/i18n` namespace loading                      | `translation.routes.test.ts`, `flatten.test.ts`          |
| FR-002      | §4.1, §5.1              | File structure `translations/{locale}/{namespace}.json`, `loadNamespaceFile()`                 | `translation.service.test.ts`                            |
| FR-003      | §4.4, §4.7              | `resolveLocale()` in `@plexica/i18n/locale.ts`; `IntlContext` initial locale                   | `locale.test.ts`, `IntlContext.test.tsx`                 |
| FR-004      | §4.5                    | `PluginManifest.translations` type + Zod schema extension                                      | `plugin-translations.test.ts`                            |
| FR-005      | §4.1                    | `TranslationService.getEnabledNamespaces()` filters by enabled plugins                         | `translation.routes.test.ts`                             |
| FR-006      | §2.2, §3.3, §3.4, §4.10 | `translation_overrides` JSONB column; PUT API; Admin Override UI                               | `tenant-overrides.test.ts`                               |
| FR-007      | §4.1, §4.4, §4.10       | `mergeOverrides()` in `@plexica/i18n/merge.ts`; `TranslationService`; Override Editor          | `merge.test.ts`, `tenant-overrides.test.ts`              |
| FR-008      | §4.7, §4.8, §4.9        | `IntlContext.setLocale()` → React context re-render; `LanguageSelector` trigger                | `IntlContext.test.tsx`, `locale-switching.spec.ts`       |
| FR-009      | §4.4, §2.2, §4.7        | `resolveLocale()`: browser → `User.locale` → `Tenant.defaultLocale` → `"en"`                   | `locale.test.ts`, `IntlContext.test.tsx`                 |
| FR-010      | §4.4                    | `flattenMessages()` produces dotted path format; namespace prefix by TranslationService        | `flatten.test.ts`                                        |
| FR-011      | §4.3                    | `TranslationKeySchema` Zod validation (max 128, allowed chars, no `_system.`, max 5 levels)    | `translation.schemas.test.ts`                            |
| FR-012      | §4.1                    | `loadNamespaceFile()` checks file size; plugin registration rejects > 200KB                    | `plugin-translations.test.ts`                            |
| FR-013      | §4.4, §6.1              | FormatJS `@formatjs/intl` (ADR-012); `createNamespacedIntl()` wraps ICU API                    | `intl.test.ts`                                           |
| FR-014      | §4.10                   | Override keys compared against current plugin translations; orphans shown with warning badge   | `tenant-overrides.test.ts`                               |
| NFR-001     | §4.6, §4.4              | Redis caching (< 50ms cached reads); compile-time message compilation                          | `translation-cache.service.test.ts`                      |
| NFR-002     | §4.1, §4.6, §4.8        | Parallel namespace loading; Redis cache; TanStack Query deduplication; only enabled namespaces | `translation.routes.test.ts`, `useTranslations.test.tsx` |
| NFR-003     | §4.1                    | Only active locale loaded per request; 10+ locales registered without loading all              | `translation.routes.test.ts`                             |
| NFR-004     | §4.4, §4.7              | `createNamespacedIntl()` returns key path as fallback; `IntlContext` `defaultMessage` behavior | `intl.test.ts`, `IntlContext.test.tsx`                   |
| NFR-005     | §3.1, §4.6              | Content-hashed URLs; `Cache-Control: immutable, max-age=31536000`; ETag support                | `translation.routes.test.ts`                             |

---

## 11. Constitution Compliance

| Article | Status | Notes                                                                                                                                                                                                                                             |
| ------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Art. 1  | ✅     | Actionable error messages on all API errors (§3.1–3.4). WCAG 2.1 AA: language selector uses native names, no flag icons (spec §9, design-spec Screen 1). Fallback ensures no empty text. Mobile responsive (design-spec responsive notes).        |
| Art. 2  | ✅     | FormatJS approved via ADR-012 (Art. 2.2 checklist passed). `react-intl` ^7.x, Radix UI Select, TanStack Query — all from approved stack. `@plexica/i18n` follows monorepo package pattern (ADR-001).                                              |
| Art. 3  | ✅     | Layered architecture: Routes → Service → Prisma (Art. 3.2). Service layer for all DB access (Art. 3.3). REST conventions with versioning (Art. 3.4). Parameterized queries only. Frontend: Context → Hook → Component (standard React DDD).       |
| Art. 4  | ✅     | Coverage: 94.9% shared package, ≥85% backend module, 82–100% frontend components. 378 total tests. Unit + integration + E2E tests (Art. 4.1). Performance: < 200ms API, < 50ms cached (Art. 4.3).                                                 |
| Art. 5  | ✅     | Translation GET endpoints explicitly public (Art. 5.1 exemption documented in spec). Override endpoints require Bearer + RBAC. Admin UI protected by `ProtectedRoute` + `tenant_admin` role. Zod validation on all inputs (Art. 5.3). No PII.     |
| Art. 6  | ✅     | Standard error format `{ error: { code, message, details } }` (Art. 6.2). Error codes: `LOCALE_NOT_FOUND`, `NAMESPACE_NOT_FOUND`, `INVALID_TRANSLATION_KEY`, etc. Pino structured logging (Art. 6.3). Frontend: toast notifications with actions. |
| Art. 7  | ✅     | Files: kebab-case (`i18n.service.ts`, `i18n.controller.ts`). Classes: PascalCase (`TranslationService`). DB columns: snake_case (`translation_overrides`, `default_locale`). API: REST kebab-case. Components: PascalCase (`LanguageSelector`).   |
| Art. 8  | ✅     | Unit tests for all business logic. Integration tests for all API endpoints. E2E tests for locale switching + plugin translations + Playwright. Contract tests for plugin manifest validation. AAA pattern. Descriptive names.                     |
| Art. 9  | ✅     | Migration is backward compatible (default values, no breaking changes) (Art. 9.1). Content-hashed URLs with immutable cache for zero-downtime translation updates. Feature flag recommended for gradual rollout. Health check unaffected.         |

---

## Cross-References

| Document                  | Path                                                        |
| ------------------------- | ----------------------------------------------------------- |
| Spec                      | `.forge/specs/006-i18n/spec.md`                             |
| Design Spec               | `.forge/specs/006-i18n/design-spec.md`                      |
| User Journeys             | `.forge/specs/006-i18n/user-journey.md`                     |
| Tasks                     | `.forge/specs/006-i18n/tasks.md`                            |
| System Architecture       | `.forge/architecture/architecture.md`                       |
| ADR-012 (FormatJS)        | `.forge/knowledge/adr/adr-012-icu-messageformat-library.md` |
| ADR-001 (Monorepo)        | `.forge/knowledge/adr/adr-001-monorepo-strategy.md`         |
| ADR-003 (Plugin Language) | `.forge/knowledge/adr/adr-003-plugin-language-support.md`   |
| ADR-010 (Shared Types)    | `.forge/knowledge/adr/adr-010-shared-types-package.md`      |
| Constitution              | `.forge/constitution.md`                                    |
| Decision Log              | `.forge/knowledge/decision-log.md`                          |
