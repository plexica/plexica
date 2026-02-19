# Spec: 006 - Internationalization (i18n)

> Feature specification for the Plexica namespace-based internationalization system with plugin and tenant override support.

| Field   | Value      |
| ------- | ---------- |
| Status  | Approved   |
| Author  | forge-pm   |
| Date    | 2026-02-13 |
| Track   | Feature    |
| Spec ID | 006        |

---

## 1. Overview

Plexica implements a **namespace-based i18n system** where each plugin contributes its own translation namespace (e.g., `core`, `crm`, `billing`). Translations are organized by locale and namespace in a file-based structure. Tenants can override specific translation keys for their organization, allowing domain-specific terminology (e.g., renaming "Deals" to "Opportunities"). The i18n system integrates with the plugin manifest, enabling plugins to declare supported locales and contribute translations on enable.

## 2. Problem Statement

A multi-tenant plugin platform needs internationalization that scales with the number of plugins, supports per-tenant terminology customization, and avoids translation key conflicts between independently developed plugins. The system must load translations efficiently (only loading namespaces for enabled plugins), support runtime locale switching, and allow tenant admins to override specific keys without modifying the plugin's translation files.

## 3. User Stories

### US-001: Locale-Based Translation

**As a** tenant user,
**I want** the application to display in my preferred language,
**so that** I can use the platform comfortably.

**Acceptance Criteria:**

- Given my browser locale is `it`, when I load the application, then all UI text renders in Italian (for keys with Italian translations).
- Given a key has no translation in my locale, when rendered, then the English (en) fallback is used.
- Given I change my locale preference in settings, when the page re-renders, then all text updates to the new locale.

### US-002: Plugin Namespace Isolation

**As a** plugin developer,
**I want** my translations to be in a separate namespace,
**so that** my translation keys do not conflict with other plugins.

**Acceptance Criteria:**

- Given the CRM plugin with namespace `crm`, when the key `crm:contacts.title` is resolved, then it loads from `crm.json` in the locale directory.
- Given two plugins both define a key `title`, when resolved, then each plugin's `title` is scoped to its namespace (no conflict).
- Given a plugin is disabled, when translations load, then the disabled plugin's namespace is not loaded.

### US-003: Tenant Translation Override

**As a** tenant admin,
**I want** to override specific translation keys for my tenant,
**so that** the platform uses my organization's terminology.

**Acceptance Criteria:**

- Given a tenant override `{ "crm": { "deals.title": "Opportunities" } }`, when a CRM user sees the deals page title, then it displays "Opportunities" instead of "Deals".
- Given a tenant override exists, when the underlying plugin translation updates, then the override still takes precedence for the overridden key.
- Given no tenant override for a key, when resolved, then the plugin's default translation is used.

### US-004: Plugin Translation Contribution

**As a** plugin developer,
**I want** to declare supported locales and ship translations in my manifest,
**so that** the platform loads my translations when my plugin is enabled.

**Acceptance Criteria:**

- Given a plugin manifest with `translations: { namespaces: ["crm"], supportedLocales: ["en", "it", "es", "de"] }`, when the plugin is enabled, then translation files for all supported locales are loaded.
- Given a plugin supports `en` and `it` but a user's locale is `fr`, when resolved, then the `en` fallback is used for CRM keys.

## 4. Functional Requirements

| ID     | Requirement                                                                                                                                                                   | Priority | Story Ref |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- |
| FR-001 | Namespace-based i18n: each plugin gets its own namespace (e.g., `core`, `crm`)                                                                                                | Must     | US-002    |
| FR-002 | File-based translation structure: `translations/{locale}/{namespace}.json`                                                                                                    | Must     | US-001    |
| FR-003 | Default locale: English (`en`); fallback to `en` when key missing in requested locale                                                                                         | Must     | US-001    |
| FR-004 | Plugin manifest declares `translations.namespaces` and `translations.supportedLocales`                                                                                        | Must     | US-004    |
| FR-005 | Only load namespaces for enabled plugins (lazy namespace loading)                                                                                                             | Must     | US-002    |
| FR-006 | Per-tenant translation overrides stored as a dedicated `translation_overrides` JSONB column on the `tenants` table (Prisma migration required)                                | Must     | US-003    |
| FR-007 | Tenant overrides take precedence over plugin defaults for matching keys                                                                                                       | Must     | US-003    |
| FR-008 | Runtime locale switching without full page reload (React context-based re-render)                                                                                             | Must     | US-001    |
| FR-009 | Locale detection: browser locale → user preference (`User.locale`) → tenant default (`Tenant.default_locale`) → `en`                                                          | Must     | US-001    |
| FR-010 | Translation key format: `{namespace}:{dotted.key.path}` (e.g., `crm:contacts.title`)                                                                                          | Must     | US-002    |
| FR-011 | Translation key validation via Zod schema: max 128 chars, alphanumeric + dots + underscores only (e.g., `contacts.fields.first_name`). Validated at plugin registration time. | Must     | US-004    |
| FR-012 | Translation file size limit: max 200KB per namespace file. Plugin manifests with oversized files rejected at registration with actionable error.                              | Must     | US-004    |
| FR-013 | ICU MessageFormat support for plurals and interpolation (all CLDR plural categories: zero, one, two, few, many, other)                                                        | Must     | US-001    |
| FR-014 | Orphaned tenant override detection: overrides for keys no longer present in plugin translations are kept but marked with a warning indicator in the tenant admin UI           | Should   | US-003    |

## 5. Non-Functional Requirements

| ID      | Category    | Requirement                                                                                                                                                                                         | Target                                                                                                                                                                                |
| ------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-001 | Performance | Translation bundle load time per namespace                                                                                                                                                          | < 50ms per namespace (cached)                                                                                                                                                         |
| NFR-002 | Performance | Total initial translation load (core + enabled plugins)                                                                                                                                             | < 200ms                                                                                                                                                                               |
| NFR-003 | Scalability | Support ≥10 locales per plugin; total translation bundle load for the active locale across all namespaces                                                                                           | < 100ms with 10+ locales registered (only active locale loaded)                                                                                                                       |
| NFR-004 | UX          | Missing translation keys display key path (dev mode) or fallback (production)                                                                                                                       | 100% of rendered keys resolve to non-empty text (translation, fallback, or key path in dev mode); verified by unit tests covering all fallback paths                                  |
| NFR-005 | Caching     | Translation files served at content-hashed URLs (e.g., `/translations/en/crm.a1b2c3.json`) with `Cache-Control: immutable, max-age=31536000`. New content hash generated on any translation change. | Cache hit rate ≥99% for unchanged translation files; 0 server revalidation requests for unchanged content (verified by `Cache-Control: immutable` header and content-hash URL scheme) |

## 6. Edge Cases & Error Scenarios

| #   | Scenario                                                       | Expected Behavior                                                                                                                                                |
| --- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Plugin declares locale not yet supported by core               | Plugin locale loaded; core keys fall back to `en`                                                                                                                |
| 2   | Tenant override references a key that doesn't exist            | Override stored but has no effect; no error                                                                                                                      |
| 3   | Translation file fails to load (CDN error)                     | Fallback to `en`; warning logged; user sees English text                                                                                                         |
| 4   | Plugin update changes translation keys                         | New keys used; tenant overrides for old keys become orphaned; orphaned overrides kept silently but marked with warning indicator in tenant admin override editor |
| 5   | Very large translation file (>200KB)                           | Plugin registration rejected with error: "Translation file for namespace '{ns}' exceeds 200KB limit. Split into multiple namespaces."                            |
| 6   | Concurrent locale switch while translations loading            | Cancel in-flight request; load new locale                                                                                                                        |
| 7   | Plugin drops support for a locale with active tenant overrides | Overrides kept but have no effect; admin UI shows warning: "Plugin no longer supports locale '{locale}'"                                                         |
| 8   | Invalid translation key format in plugin manifest              | Plugin registration rejected with Zod validation error detailing the invalid key and expected format                                                             |

## 7. Data Requirements

### Translation File Structure

```
translations/
  en/
    core.json        # Core platform translations
    crm.json         # CRM plugin translations
    billing.json     # Billing plugin translations
  it/
    core.json
    crm.json
    billing.json
```

### Translation File Format

```json
{
  "contacts": {
    "title": "Contacts",
    "new": "New Contact",
    "count": "{count, plural, =0 {No contacts} one {# contact} other {# contacts}}",
    "fields": {
      "name": "Name",
      "email": "Email",
      "phone": "Phone"
    }
  }
}
```

> **Note**: Translations use [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/)
> for plurals and interpolation. All CLDR plural categories are supported:
> `zero`, `one`, `two`, `few`, `many`, `other`.

### Translation Key Validation Rules

Translation keys submitted by plugins are validated at registration time:

| Rule            | Constraint                                                 |
| --------------- | ---------------------------------------------------------- |
| Max length      | 128 characters                                             |
| Allowed chars   | `a-z`, `A-Z`, `0-9`, `.` (dot separator), `_` (underscore) |
| Format          | Dotted path (e.g., `contacts.fields.first_name`)           |
| Reserved prefix | `_system.` prefix reserved for core platform               |
| Nesting depth   | Max 5 levels (e.g., `a.b.c.d.e`)                           |

### Tenant Override Storage (dedicated JSONB column on `tenants`)

```sql
-- New column added to existing tenants table via Prisma migration
ALTER TABLE core.tenants
  ADD COLUMN translation_overrides JSONB DEFAULT '{}';
```

Prisma schema addition:

```prisma
model Tenant {
  // ... existing fields ...
  translationOverrides Json @default("{}") @map("translation_overrides")
}
```

JSONB structure:

```json
{
  "en": {
    "crm": {
      "deals.title": "Opportunities"
    }
  },
  "it": {
    "crm": {
      "deals.title": "Opportunità"
    }
  }
}
```

### Tenant Default Locale (new column on `tenants`)

FR-009 requires a tenant-level default locale for the fallback chain. This requires a new column on the `Tenant` model:

```prisma
model Tenant {
  // ... existing fields ...
  defaultLocale String @default("en") @map("default_locale")
}
```

```sql
-- Prisma migration
ALTER TABLE core.tenants
  ADD COLUMN default_locale VARCHAR(10) NOT NULL DEFAULT 'en';
```

Locale detection priority: `browser locale → User.locale → Tenant.default_locale → "en"`

## 8. API Requirements

| Method | Path                                    | Description                           | Auth                                                                                                     |
| ------ | --------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| GET    | /api/v1/translations/:locale/:namespace | Get translations for locale+namespace | Unauthenticated (per Art. 5.1 explicit public exemption: translations are static, non-sensitive content) |
| GET    | /api/v1/tenant/translations/overrides   | Get tenant translation overrides      | Bearer (tenant member)                                                                                   |
| PUT    | /api/v1/tenant/translations/overrides   | Update tenant translation overrides   | Bearer + `tenant_admin` role                                                                             |
| GET    | /api/v1/translations/locales            | List available locales                | Unauthenticated                                                                                          |

### API Error Responses

| Endpoint                             | Error Condition                        | HTTP Status | Error Code                |
| ------------------------------------ | -------------------------------------- | ----------- | ------------------------- |
| GET /translations/:locale/:namespace | Locale not found                       | 404         | `LOCALE_NOT_FOUND`        |
| GET /translations/:locale/:namespace | Namespace not found or plugin disabled | 404         | `NAMESPACE_NOT_FOUND`     |
| GET /tenant/translations/overrides   | Unauthorized (no valid session)        | 401         | `UNAUTHORIZED`            |
| PUT /tenant/translations/overrides   | User lacks `tenant_admin` role         | 403         | `FORBIDDEN`               |
| PUT /tenant/translations/overrides   | Override payload exceeds 1MB           | 413         | `PAYLOAD_TOO_LARGE`       |
| PUT /tenant/translations/overrides   | Invalid override key format            | 400         | `INVALID_TRANSLATION_KEY` |

## 9. UX/UI Notes

- Language selector in user profile settings: dropdown displaying language names in their native script (e.g., "English", "Italiano", "Español", "Deutsch"). No flag icons (flags represent countries, not languages; per Art. 1.3 WCAG 2.1 AA compliance).
- Tenant admin override editor: searchable list of translation keys with original and override values side-by-side.
- Translation preview: changes visible immediately in a preview panel before saving.
- In development mode, missing translation keys are highlighted with a red border for easy identification.

## 10. Out of Scope

- Machine translation or auto-translation of keys (manual translation only).
- Right-to-left (RTL) language support (future consideration; no RTL locales in MVP).
- Translation management UI for plugin developers (use file-based workflow).
- Crowdsourced translation contributions from tenant users.
- Automatic cleanup of orphaned tenant overrides (manual cleanup via admin UI only).

## 11. Open Questions

- No open questions. All ambiguities resolved during `/forge-clarify` sessions (2026-02-13). Post-analysis data model issues (FR-006, FR-009) and NFR measurability issues (NFR-004, NFR-005) resolved in session 2.

## 12. Constitution Compliance

| Article | Status | Notes                                                                                                                                                                                |
| ------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Art. 1  | ✅     | UX: actionable errors for translation failures; fallback behavior; WCAG 2.1 AA language selector (no flag icons)                                                                     |
| Art. 2  | ✅     | Uses approved stack; ICU MessageFormat library requires ADR for dependency approval                                                                                                  |
| Art. 3  | ✅     | Service layer for translation resolution; namespace isolation; JSONB storage for overrides                                                                                           |
| Art. 4  | ✅     | Unit tests for key resolution, fallback, override merging, ICU plural formatting                                                                                                     |
| Art. 5  | ✅     | Translation endpoints explicitly marked unauthenticated (non-sensitive static content); tenant override endpoints require auth + RBAC; translation key validation via Zod (Art. 5.3) |
| Art. 6  | ✅     | Translation load errors logged; graceful fallback; API error responses follow standard format                                                                                        |
| Art. 7  | ✅     | File naming: kebab-case; key format: dotted paths; database column: snake_case                                                                                                       |
| Art. 8  | ✅     | Unit tests for i18n utilities; integration tests for API; E2E for locale switch                                                                                                      |
| Art. 9  | ✅     | Content-hashed URLs with immutable cache headers; zero-downtime translation updates                                                                                                  |

---

## Clarification Log

> Ambiguities resolved during `/forge-clarify` sessions.

### Session 1 — Initial Clarification (2026-02-13)

| #   | Ambiguity                                          | Resolution                                                                                                        |
| --- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | NFR-003: "No performance degradation" unmeasurable | Set target: < 100ms total load with 10+ locales (only active locale loaded)                                       |
| 2   | NFR-005: "CDN-friendly caching" vague              | Content-hashed URLs with `Cache-Control: immutable, max-age=31536000`                                             |
| 3   | FR-006: Override storage unspecified               | JSONB column `translation_overrides` on `tenant_settings` table (**⚠️ corrected in Session 2 → `tenants` table**) |
| 4   | FR-008: "Should" priority ambiguous for MVP        | Upgraded to "Must" — in scope for MVP with React context-based re-render                                          |
| 5   | API: "Public" auth not explicitly decided          | Explicitly unauthenticated with Art. 5.1 exemption documented (non-sensitive static content)                      |
| 6   | Edge #5: Large file handling vague                 | Hard 200KB limit per namespace file; validated at plugin registration; rejected with actionable error             |
| 7   | Plural support undefined                           | Full ICU MessageFormat (all CLDR plural categories); removed from Out of Scope                                    |
| 8   | Flag icons in language selector                    | Replaced with language names in native script (WCAG 2.1 AA compliance)                                            |
| 9   | No translation key validation                      | Added FR-011: Zod schema validation — max 128 chars, alphanumeric + dots + underscores, validated at registration |
| 10  | Orphaned tenant overrides unspecified              | Keep orphaned overrides silently; show warning indicator in admin UI for cleanup                                  |
| 11  | Missing API error responses                        | Added full error response table with HTTP status codes and error codes                                            |
| 12  | Missing edge cases                                 | Added edge cases #7 (plugin drops locale) and #8 (invalid key format)                                             |

### Session 2 — Post-Analysis Fixes (2026-02-13)

> Fixes for issues identified by `/forge-analyze` against the Prisma schema.

| #   | Issue (Severity) | Original Problem                                                                                     | Resolution                                                                                                                                                            |
| --- | ---------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 13  | CRITICAL         | FR-006 references `tenant_settings` table which does not exist in Prisma schema                      | Changed to dedicated `translation_overrides` JSONB column on the `tenants` table (Prisma migration). SQL and data model sections updated.                             |
| 14  | WARNING          | FR-009 references "tenant default" locale but no `default_locale` field exists on `Tenant` model     | Added new `default_locale` column to `Tenant` model (`String @default("en")`). FR-009 updated to reference `Tenant.default_locale` explicitly.                        |
| 15  | WARNING          | NFR-004 target "No empty strings shown" is qualitative, not measurable (violates Constitution Art.4) | Replaced with: "100% of rendered keys resolve to non-empty text (translation, fallback, or key path in dev mode); verified by unit tests covering all fallback paths" |
| 16  | WARNING          | NFR-005 target mixes implementation with requirement instead of measurable outcome                   | Replaced with: "Cache hit rate ≥99% for unchanged files; 0 server revalidation requests for unchanged content"                                                        |

---

## Cross-References

| Document                 | Path                                             |
| ------------------------ | ------------------------------------------------ |
| Constitution             | `.forge/constitution.md`                         |
| Frontend Architecture    | `.forge/specs/005-frontend-architecture/spec.md` |
| Plugin System Spec       | `.forge/specs/004-plugin-system/spec.md`         |
| Multi-Tenancy Spec       | `.forge/specs/001-multi-tenancy/spec.md`         |
| Source: Functional Specs | `specs/FUNCTIONAL_SPECIFICATIONS.md` (Section 9) |
