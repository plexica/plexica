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

| ID     | Requirement                                                                            | Priority | Story Ref |
| ------ | -------------------------------------------------------------------------------------- | -------- | --------- |
| FR-001 | Namespace-based i18n: each plugin gets its own namespace (e.g., `core`, `crm`)         | Must     | US-002    |
| FR-002 | File-based translation structure: `translations/{locale}/{namespace}.json`             | Must     | US-001    |
| FR-003 | Default locale: English (`en`); fallback to `en` when key missing in requested locale  | Must     | US-001    |
| FR-004 | Plugin manifest declares `translations.namespaces` and `translations.supportedLocales` | Must     | US-004    |
| FR-005 | Only load namespaces for enabled plugins (lazy namespace loading)                      | Must     | US-002    |
| FR-006 | Per-tenant translation overrides stored in tenant settings                             | Must     | US-003    |
| FR-007 | Tenant overrides take precedence over plugin defaults for matching keys                | Must     | US-003    |
| FR-008 | Runtime locale switching without full page reload                                      | Should   | US-001    |
| FR-009 | Locale detection: browser locale → user preference → tenant default → `en`             | Must     | US-001    |
| FR-010 | Translation key format: `{namespace}:{dotted.key.path}` (e.g., `crm:contacts.title`)   | Must     | US-002    |

## 5. Non-Functional Requirements

| ID      | Category    | Requirement                                                                   | Target                        |
| ------- | ----------- | ----------------------------------------------------------------------------- | ----------------------------- |
| NFR-001 | Performance | Translation bundle load time per namespace                                    | < 50ms per namespace (cached) |
| NFR-002 | Performance | Total initial translation load (core + enabled plugins)                       | < 200ms                       |
| NFR-003 | Scalability | Support ≥10 locales per plugin                                                | No performance degradation    |
| NFR-004 | UX          | Missing translation keys display key path (dev mode) or fallback (production) | No empty strings shown        |
| NFR-005 | Caching     | Translation files cached in browser with cache-busting on version change      | CDN-friendly caching          |

## 6. Edge Cases & Error Scenarios

| #   | Scenario                                            | Expected Behavior                                             |
| --- | --------------------------------------------------- | ------------------------------------------------------------- |
| 1   | Plugin declares locale not yet supported by core    | Plugin locale loaded; core keys fall back to `en`             |
| 2   | Tenant override references a key that doesn't exist | Override stored but has no effect; no error                   |
| 3   | Translation file fails to load (CDN error)          | Fallback to `en`; warning logged; user sees English text      |
| 4   | Plugin update changes translation keys              | New keys used; tenant overrides for old keys become orphaned  |
| 5   | Very large translation file (>500KB)                | Namespace split into sub-namespaces; lazy load sub-namespaces |
| 6   | Concurrent locale switch while translations loading | Cancel in-flight request; load new locale                     |

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
    "fields": {
      "name": "Name",
      "email": "Email",
      "phone": "Phone"
    }
  }
}
```

### Tenant Override Format (in tenant settings)

```json
{
  "tenant_id": "acme-corp",
  "translation_overrides": {
    "en": {
      "crm": {
        "deals.title": "Opportunities"
      }
    }
  }
}
```

## 8. API Requirements

| Method | Path                                    | Description                           | Auth                  |
| ------ | --------------------------------------- | ------------------------------------- | --------------------- |
| GET    | /api/v1/translations/:locale/:namespace | Get translations for locale+namespace | Public (cached)       |
| GET    | /api/v1/tenant/translations/overrides   | Get tenant translation overrides      | Bearer                |
| PUT    | /api/v1/tenant/translations/overrides   | Update tenant translation overrides   | Bearer + tenant_admin |
| GET    | /api/v1/translations/locales            | List available locales                | Public                |

## 9. UX/UI Notes

- Language selector in user profile settings (dropdown with flag icons).
- Tenant admin override editor: searchable list of translation keys with original and override values side-by-side.
- Translation preview: changes visible immediately in a preview panel before saving.
- In development mode, missing translation keys are highlighted with a red border for easy identification.

## 10. Out of Scope

- Machine translation or auto-translation of keys (manual translation only).
- Right-to-left (RTL) language support (future consideration; no RTL locales in MVP).
- Translation management UI for plugin developers (use file-based workflow).
- Crowdsourced translation contributions from tenant users.
- Plural form handling beyond simple singular/plural (e.g., no CLDR plural rules for MVP).

## 11. Open Questions

- No open questions. All requirements derived from existing functional specifications.

## 12. Constitution Compliance

| Article | Status | Notes                                                                           |
| ------- | ------ | ------------------------------------------------------------------------------- |
| Art. 1  | ✅     | UX: actionable errors for translation failures; fallback behavior               |
| Art. 2  | ✅     | Uses approved stack; i18n library compatible with React 19                      |
| Art. 3  | ✅     | Service layer for translation resolution; namespace isolation                   |
| Art. 4  | ✅     | Unit tests for key resolution, fallback, override merging                       |
| Art. 5  | ✅     | No sensitive data in translations; tenant overrides scoped                      |
| Art. 6  | ✅     | Translation load errors logged; graceful fallback                               |
| Art. 7  | ✅     | File naming: kebab-case; key format: dotted paths                               |
| Art. 8  | ✅     | Unit tests for i18n utilities; integration tests for API; E2E for locale switch |
| Art. 9  | ✅     | CDN-cached translation files; cache-busting on version change                   |

---

## Cross-References

| Document                 | Path                                             |
| ------------------------ | ------------------------------------------------ |
| Constitution             | `.forge/constitution.md`                         |
| Frontend Architecture    | `.forge/specs/005-frontend-architecture/spec.md` |
| Plugin System Spec       | `.forge/specs/004-plugin-system/spec.md`         |
| Multi-Tenancy Spec       | `.forge/specs/001-multi-tenancy/spec.md`         |
| Source: Functional Specs | `specs/FUNCTIONAL_SPECIFICATIONS.md` (Section 9) |
