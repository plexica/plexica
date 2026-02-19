# Plan: 006 - Internationalization (i18n)

> Technical implementation plan for the Plexica namespace-based
> internationalization system with plugin and tenant override support.
> Created by the `forge-architect` agent via `/forge-plan`.

| Field  | Value               |
| ------ | ------------------- |
| Status | Draft               |
| Author | forge-architect     |
| Date   | 2026-02-13          |
| Track  | Feature             |
| Spec   | [006-i18n](spec.md) |

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

**Approach**: Bottom-up implementation — database migration first, then shared
package, then backend service/routes, then plugin manifest integration, then
frontend integration. Each layer is independently testable.

**Key ADR**: [ADR-012](../../knowledge/adr/adr-012-icu-messageformat-library.md)
(FormatJS selected over i18next and LinguiJS for ICU MessageFormat support).

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

### 4.1 TranslationService

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

### 4.2 TranslationRoutes

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

### 4.6 TranslationCacheService

- **Purpose**: Dedicated Redis caching layer for translations with
  tenant-prefixed keys and content-hash tracking.
- **Location**: `apps/core-api/src/modules/i18n/translation-cache.service.ts`
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

---

## 5. File Map

### 5.1 New Files

| Path                                                   | Action | Purpose                                                    |
| ------------------------------------------------------ | ------ | ---------------------------------------------------------- |
| `packages/i18n/package.json`                           | Create | Package manifest for `@plexica/i18n`                       |
| `packages/i18n/tsconfig.json`                          | Create | TypeScript configuration                                   |
| `packages/i18n/src/index.ts`                           | Create | Package entry — re-exports all public APIs                 |
| `packages/i18n/src/flatten.ts`                         | Create | `flattenMessages` and `unflattenMessages` utilities        |
| `packages/i18n/src/hash.ts`                            | Create | `generateContentHash` (SHA-256 → 8-char hex)               |
| `packages/i18n/src/locale.ts`                          | Create | `resolveLocale` fallback chain logic                       |
| `packages/i18n/src/merge.ts`                           | Create | `mergeOverrides` — tenant overrides onto base translations |
| `packages/i18n/src/intl.ts`                            | Create | `createNamespacedIntl` FormatJS wrapper                    |
| `packages/i18n/src/types.ts`                           | Create | Shared types: `TranslationBundle`, `TenantOverrides`, etc. |
| `apps/core-api/src/modules/i18n/i18n.service.ts`       | Create | Core translation service (see §4.1)                        |
| `apps/core-api/src/modules/i18n/i18n.controller.ts`    | Create | Fastify route handlers (see §4.2)                          |
| `apps/core-api/src/modules/i18n/i18n.schemas.ts`       | Create | Zod validation schemas (see §4.3)                          |
| `apps/core-api/src/modules/i18n/i18n-cache.service.ts` | Create | Redis caching layer (see §4.6)                             |
| `apps/core-api/src/modules/i18n/index.ts`              | Create | Module barrel export                                       |
| `apps/core-api/translations/en/core.json`              | Create | Core platform English translations (seed)                  |
| `apps/core-api/translations/en/README.md`              | Create | Translation file structure documentation                   |

### 5.2 Modified Files

| Path                                                  | Action | Purpose                                                                      |
| ----------------------------------------------------- | ------ | ---------------------------------------------------------------------------- |
| `packages/database/prisma/schema.prisma`              | Modify | Add `translationOverrides` and `defaultLocale` to Tenant                     |
| `apps/core-api/src/index.ts`                          | Modify | Register i18n routes (`/api/v1/translations`, `/api/v1/tenant/translations`) |
| `apps/core-api/src/types/plugin.types.ts`             | Modify | Add `translations` field to `PluginManifest` interface                       |
| `apps/core-api/src/schemas/plugin-manifest.schema.ts` | Modify | Add `translations` Zod schema to `PluginManifestSchema`                      |
| `apps/core-api/package.json`                          | Modify | Add `@plexica/i18n` workspace dependency                                     |
| `pnpm-workspace.yaml`                                 | Modify | Add `packages/i18n` to workspace packages (if not glob)                      |

### 5.3 Test Files

| Path                                                                    | Action | Purpose                                                |
| ----------------------------------------------------------------------- | ------ | ------------------------------------------------------ |
| `packages/i18n/src/__tests__/flatten.test.ts`                           | Create | Unit: flatten/unflatten                                |
| `packages/i18n/src/__tests__/hash.test.ts`                              | Create | Unit: content hash generation                          |
| `packages/i18n/src/__tests__/locale.test.ts`                            | Create | Unit: locale fallback chain resolution                 |
| `packages/i18n/src/__tests__/merge.test.ts`                             | Create | Unit: tenant override merging                          |
| `packages/i18n/src/__tests__/intl.test.ts`                              | Create | Unit: FormatJS wrapper, ICU plural formatting          |
| `apps/core-api/src/__tests__/i18n/unit/i18n.service.test.ts`            | Create | Unit: TranslationService business logic                |
| `apps/core-api/src/__tests__/i18n/unit/i18n.schemas.test.ts`            | Create | Unit: Zod schema validation                            |
| `apps/core-api/src/__tests__/i18n/unit/i18n-cache.service.test.ts`      | Create | Unit: Redis cache operations (mocked)                  |
| `apps/core-api/src/__tests__/i18n/integration/i18n.controller.test.ts`  | Create | Integration: API endpoint tests with DB                |
| `apps/core-api/src/__tests__/i18n/integration/tenant-overrides.test.ts` | Create | Integration: tenant override CRUD + cache invalidation |
| `apps/core-api/src/__tests__/i18n/e2e/locale-switching.test.ts`         | Create | E2E: full locale switch flow with fallback             |
| `apps/core-api/src/__tests__/i18n/e2e/plugin-translations.test.ts`      | Create | E2E: plugin enable → namespace available → translate   |

---

## 6. Dependencies

### 6.1 New Dependencies

| Package              | Version | Scope             | Purpose                              |
| -------------------- | ------- | ----------------- | ------------------------------------ |
| `@formatjs/intl`     | ^2.x    | `packages/i18n`   | Core intl API (backend + frontend)   |
| `intl-messageformat` | ^10.x   | `packages/i18n`   | ICU MessageFormat parser (peer dep)  |
| `react-intl`         | ^7.x    | Frontend (future) | React components and hooks (Phase 2) |
| `@formatjs/cli`      | ^6.x    | Dev               | Message extraction and compilation   |

> All approved via [ADR-012](../../knowledge/adr/adr-012-icu-messageformat-library.md).
> Dependency policy compliance (Art. 2.2): >1000 weekly downloads ✅,
> no known vulnerabilities ✅, TypeScript support ✅, ADR approval ✅.

### 6.2 Internal Dependencies

- **`@plexica/database`** — Prisma client for Tenant model operations
  (override reads/writes)
- **`@plexica/i18n`** — Shared utilities consumed by `core-api` and future
  frontend packages
- **`ioredis`** — Existing Redis client (`apps/core-api/src/lib/redis.ts`)
  used by `TranslationCacheService`
- **`zod`** — Existing validation library used for translation key and
  override payload schemas
- **`PluginService`** — Existing service for determining enabled plugins
  (namespace filtering per FR-005)
- **`TenantContext`** — Existing middleware for tenant identification on
  authenticated endpoints

---

## 7. Testing Strategy

### 7.1 Unit Tests

| Component                 | Test Focus                                                                  | Target Coverage |
| ------------------------- | --------------------------------------------------------------------------- | --------------- |
| `flattenMessages`         | Nested to dotted paths; edge cases (empty, deep nesting, arrays)            | 100%            |
| `unflattenMessages`       | Dotted paths back to nested; round-trip with flatten                        | 100%            |
| `generateContentHash`     | Deterministic hashing; different input → different hash; empty input        | 100%            |
| `resolveLocale`           | All 4 fallback levels; missing values; invalid locale codes                 | 100%            |
| `mergeOverrides`          | Base + override merge; empty overrides; orphaned keys; nested overrides     | 100%            |
| `createNamespacedIntl`    | ICU plurals (all 6 categories); interpolation; select; missing key fallback | ≥90%            |
| `TranslationService`      | File loading; namespace filtering; cache interaction (mocked Redis)         | ≥85%            |
| `TranslationCacheService` | Get/set/invalidate operations (mocked Redis)                                | ≥85%            |
| `TranslationKeySchema`    | Valid keys; max length; forbidden chars; `_system.` prefix; nesting depth   | 100%            |
| `TenantOverrideSchema`    | Valid structures; invalid locale; invalid namespace; payload size           | 100%            |

### 7.2 Integration Tests

| Scenario                                | Dependencies               | Validates                     |
| --------------------------------------- | -------------------------- | ----------------------------- |
| GET translations for valid locale/ns    | DB (Prisma), filesystem    | FR-001, FR-002, FR-003        |
| GET translations with tenant overrides  | DB, Redis, filesystem      | FR-006, FR-007                |
| GET translations for disabled plugin ns | DB, PluginService          | FR-005 (404 response)         |
| GET available locales                   | Filesystem                 | Locale listing accuracy       |
| GET tenant overrides (authenticated)    | DB, auth middleware        | Art. 5.1 (auth required)      |
| PUT tenant overrides (tenant_admin)     | DB, Redis, auth + RBAC     | FR-006, FR-007, Art. 5 (RBAC) |
| PUT overrides with invalid keys         | DB, Zod validation         | FR-011 (400 response)         |
| PUT overrides exceeding 1MB             | Request body size          | 413 response                  |
| ETag / 304 Not Modified                 | Redis (hash store)         | NFR-005 (caching)             |
| Cache invalidation on override update   | DB, Redis                  | Cache consistency             |
| Plugin manifest with translations field | Plugin validation pipeline | FR-004                        |
| Plugin manifest with oversized file     | Plugin validation pipeline | FR-012 (rejected)             |

### 7.3 E2E Tests

| Scenario                               | Flow                                                                                         |
| -------------------------------------- | -------------------------------------------------------------------------------------------- |
| Locale switching with fallback         | Set user locale → load translations → verify correct locale → change → verify fallback to en |
| Plugin enable → translations available | Enable plugin → GET its namespace → verify translations returned                             |
| Tenant override lifecycle              | Create override → verify in GET → update → verify change → delete → verify removed           |
| Plugin disable → namespace unavailable | Disable plugin → GET its namespace → verify 404 response                                     |

### 7.4 Coverage Targets

- **`@plexica/i18n` package**: ≥90% (pure utility code, easily testable)
- **`i18n` module (core-api)**: ≥85% (core module per Art. 4.1)
- **Translation schemas**: 100% (security-critical validation per Art. 5.3)
- **Overall i18n feature**: ≥85% (above the 80% floor, targeting core module standard)

---

## 8. Architectural Decisions

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

---

## 9. Requirement Traceability

| Requirement | Plan Section     | Implementation Path                                                                                                      |
| ----------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| FR-001      | §4.1, §4.4       | `TranslationService.getTranslations()`, `@plexica/i18n` namespace loading                                                |
| FR-002      | §4.1, §5.1       | File structure `translations/{locale}/{namespace}.json`, `loadNamespaceFile()`                                           |
| FR-003      | §4.4             | `resolveLocale()` in `@plexica/i18n/locale.ts` — fallback to `en`                                                        |
| FR-004      | §4.5             | `PluginManifest.translations` type + Zod schema extension                                                                |
| FR-005      | §4.1             | `TranslationService.getEnabledNamespaces()` filters by enabled plugins                                                   |
| FR-006      | §2.2, §3.3, §3.4 | `translation_overrides` JSONB column on `Tenant`; PUT API endpoint                                                       |
| FR-007      | §4.1, §4.4       | `mergeOverrides()` in `@plexica/i18n/merge.ts`; `TranslationService.getTranslations()`                                   |
| FR-008      | §4.4             | `createNamespacedIntl()` — React `IntlProvider` context re-render (frontend phase)                                       |
| FR-009      | §4.4, §2.2       | `resolveLocale()` chain: browser → `User.locale` → `Tenant.defaultLocale` → `"en"`                                       |
| FR-010      | §4.4             | `flattenMessages()` produces dotted path format (e.g., `contacts.title`); namespace prefix applied by TranslationService |
| FR-011      | §4.3             | `TranslationKeySchema` Zod validation (max 128, allowed chars, no `_system.`, max 5 levels)                              |
| FR-012      | §4.1             | `loadNamespaceFile()` checks file size; plugin registration rejects > 200KB                                              |
| FR-013      | §4.4, §6.1       | FormatJS `@formatjs/intl` (ADR-012); `createNamespacedIntl()` wraps ICU API                                              |
| FR-014      | §3.3, §3.4       | Override keys compared against current plugin translations; orphans preserved with metadata                              |
| NFR-001     | §4.6, §4.4       | Redis caching (< 50ms cached reads); compile-time message compilation                                                    |
| NFR-002     | §4.1, §4.6       | Parallel namespace loading; Redis cache; only enabled plugin namespaces loaded                                           |
| NFR-003     | §4.1             | Only active locale loaded per request; 10+ locales registered without loading all                                        |
| NFR-004     | §4.4             | `createNamespacedIntl()` returns key path as fallback; unit tests verify all fallback paths                              |
| NFR-005     | §3.1, §4.6       | Content-hashed URLs; `Cache-Control: immutable, max-age=31536000`; ETag support                                          |

---

## 10. Constitution Compliance

| Article | Status | Notes                                                                                                                                                                                                                                                |
| ------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Art. 1  | ✅     | Actionable error messages on all API errors (§3.1–3.4). WCAG 2.1 AA: language selector uses native names, no flag icons (spec §9). Fallback ensures no empty text.                                                                                   |
| Art. 2  | ✅     | FormatJS approved via ADR-012 (Art. 2.2 checklist passed). All other dependencies from approved stack. `@plexica/i18n` follows monorepo package pattern (ADR-001).                                                                                   |
| Art. 3  | ✅     | Layered architecture: Routes → Service → Prisma (Art. 3.2). Service layer for all DB access (Art. 3.3). REST conventions with versioning (Art. 3.4). Parameterized queries only.                                                                     |
| Art. 4  | ✅     | Coverage targets: ≥85% for i18n module, ≥90% for shared package, 100% for schemas. Unit + integration + E2E tests planned (Art. 4.1). Performance: < 200ms API (Art. 4.3).                                                                           |
| Art. 5  | ✅     | Translation GET endpoints explicitly public (Art. 5.1 exemption documented in spec). Override endpoints require Bearer + RBAC (Art. 5.1). Zod validation on all inputs (Art. 5.3). No PII in translation data (Art. 5.2).                            |
| Art. 6  | ✅     | Standard error format `{ error: { code, message, details } }` (Art. 6.2). Error codes: `LOCALE_NOT_FOUND`, `NAMESPACE_NOT_FOUND`, `INVALID_TRANSLATION_KEY`, etc. Pino structured logging (Art. 6.3).                                                |
| Art. 7  | ✅     | Files: kebab-case (`i18n.service.ts`, `i18n.controller.ts`). Classes: PascalCase (`TranslationService`). DB columns: snake_case (`translation_overrides`, `default_locale`). API: REST kebab-case (`/translations/locales`).                         |
| Art. 8  | ✅     | Unit tests for all business logic. Integration tests for all API endpoints. E2E tests for locale switching + plugin translations. Contract tests for plugin manifest validation. AAA pattern. Descriptive names.                                     |
| Art. 9  | ✅     | Migration is backward compatible (default values, no breaking changes) (Art. 9.1). Content-hashed URLs with immutable cache for zero-downtime translation updates (Art. 9.1). Feature flag recommended for gradual rollout. Health check unaffected. |

---

## Cross-References

| Document                  | Path                                                        |
| ------------------------- | ----------------------------------------------------------- |
| Spec                      | `.forge/specs/006-i18n/spec.md`                             |
| System Architecture       | `.forge/architecture/system-architecture.md`                |
| Security Architecture     | `.forge/architecture/security-architecture.md`              |
| ADR-012 (FormatJS)        | `.forge/knowledge/adr/adr-012-icu-messageformat-library.md` |
| ADR-001 (Monorepo)        | `.forge/knowledge/adr/adr-001-monorepo-strategy.md`         |
| ADR-003 (Plugin Language) | `.forge/knowledge/adr/adr-003-plugin-language-support.md`   |
| ADR-010 (Shared Types)    | `.forge/knowledge/adr/adr-010-shared-types-package.md`      |
| Constitution              | `.forge/constitution.md`                                    |
| Decision Log              | `.forge/knowledge/decision-log.md`                          |
| Tasks                     | <!-- Created by /forge-tasks -->                            |
