# Frontend i18n Usage Guide

**Last Updated**: February 16, 2026  
**Status**: Complete  
**Sprint**: Sprint 2 (E01-S006)

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [API Reference](#api-reference)
4. [Translation Keys](#translation-keys)
5. [Adding New Translations](#adding-new-translations)
6. [Translation Overrides](#translation-overrides)
7. [Performance](#performance)
8. [Troubleshooting](#troubleshooting)

---

## Overview

Plexica's internationalization (i18n) system enables multi-language support across the platform with:

- **ICU MessageFormat** via FormatJS for advanced formatting (plurals, select, numbers, dates)
- **Namespace-based loading** for optimal bundle sizes
- **Tenant-level overrides** for custom translations per tenant
- **React hooks** for easy integration in components
- **Automatic caching** with 1-hour stale time
- **SSR-safe** locale detection and persistence

**Architecture**:

```
@plexica/i18n (shared package)
     ↓
Backend API: /api/v1/translations/:locale/:namespace
     ↓
Frontend Hooks: useTranslations(), useNamespaces()
     ↓
React Components: <FormattedMessage />, useIntl()
```

**Supported Locales**:

- `en` - English (default)
- `it` - Italiano
- `es` - Español
- `fr` - Français
- `de` - Deutsch

---

## Quick Start

### 1. Basic Usage with `useTranslations`

```typescript
// apps/web/src/pages/MyComponent.tsx

import { useTranslations } from '@/hooks/useTranslations';
import { FormattedMessage } from 'react-intl';

function MyComponent() {
  // Load translations for 'core' namespace
  const { isLoading, error } = useTranslations({ namespace: 'core' });

  if (isLoading) return <div>Loading translations...</div>;
  if (error) return <div>Error loading translations</div>;

  return (
    <div>
      <h1>
        <FormattedMessage id="core.welcome.title" defaultMessage="Welcome" />
      </h1>
      <p>
        <FormattedMessage
          id="core.welcome.description"
          defaultMessage="Welcome to the platform, {name}!"
          values={{ name: 'User' }}
        />
      </p>
    </div>
  );
}
```

### 2. Loading Multiple Namespaces

```typescript
import { useNamespaces } from '@/hooks/useTranslations';
import { FormattedMessage } from 'react-intl';

function MultiNamespaceComponent() {
  // Load multiple namespaces in parallel
  const { isLoading, errors } = useNamespaces(['core', 'auth', 'workspace']);

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      {/* Use translations from any loaded namespace */}
      <h1><FormattedMessage id="core.welcome.title" defaultMessage="Welcome" /></h1>
      <button><FormattedMessage id="auth.login.button" defaultMessage="Login" /></button>
      <p><FormattedMessage id="workspace.create.title" defaultMessage="Create Workspace" /></p>
    </div>
  );
}
```

### 3. Using `useIntl` for Programmatic Access

```typescript
import { useIntl } from 'react-intl';

function MyForm() {
  const intl = useIntl();

  const handleSubmit = () => {
    // Access translated strings programmatically
    const successMessage = intl.formatMessage({
      id: 'form.submit.success',
      defaultMessage: 'Form submitted successfully!',
    });
    alert(successMessage);
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        placeholder={intl.formatMessage({
          id: 'form.email.placeholder',
          defaultMessage: 'Enter your email',
        })}
      />
      <button type="submit">
        {intl.formatMessage({ id: 'form.submit.button', defaultMessage: 'Submit' })}
      </button>
    </form>
  );
}
```

---

## API Reference

### `useTranslations` Hook

Load translations for a single namespace.

```typescript
const {
  data,          // Loaded translation data
  isLoading,     // Loading state
  error,         // Error object (if any)
  refetch        // Manual refetch function
} = useTranslations({
  namespace: 'core',        // Required: namespace to load
  locale?: 'en',            // Optional: specific locale (defaults to current locale)
  enabled?: true            // Optional: enable/disable query (default: true)
});
```

**Return Type**:

```typescript
{
  data?: {
    locale: string;
    namespace: string;
    messages: Record<string, string>;
    contentHash: string;
    updatedAt: string;
  };
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}
```

**Example**:

```typescript
const { data, isLoading } = useTranslations({ namespace: 'auth' });

if (data) {
  console.log(data.messages); // { 'login.button': 'Login', ... }
}
```

---

### `useNamespaces` Hook

Load multiple namespaces in parallel.

```typescript
const {
  results, // Array of query results for each namespace
  isLoading, // True if ANY namespace is loading
  errors, // Array of errors (if any)
} = useNamespaces(['core', 'auth', 'workspace']);
```

**Return Type**:

```typescript
{
  results: Array<{
    data?: TranslationData;
    isLoading: boolean;
    error: Error | null;
  }>;
  isLoading: boolean;
  errors: (Error | null)[];
}
```

**Example**:

```typescript
const { results, isLoading } = useNamespaces(['core', 'auth']);

// Access individual namespace data
const coreData = results[0].data;
const authData = results[1].data;
```

---

### `<FormattedMessage>` Component

Display translated text with support for interpolation, plurals, and select expressions.

```typescript
<FormattedMessage
  id="translation.key"              // Required: translation key
  defaultMessage="Default text"     // Required: fallback text
  values={{                         // Optional: interpolation values
    name: 'John',
    count: 5
  }}
/>
```

**Interpolation Example**:

```typescript
// Translation key: "welcome.message"
// Translation value: "Welcome back, {name}!"

<FormattedMessage
  id="welcome.message"
  defaultMessage="Welcome back, {name}!"
  values={{ name: user.firstName }}
/>
// Output: "Welcome back, John!"
```

**Plurals Example**:

```typescript
// Translation key: "items.count"
// Translation value: "{count, plural, =0 {No items} one {1 item} other {# items}}"

<FormattedMessage
  id="items.count"
  defaultMessage="{count, plural, =0 {No items} one {1 item} other {# items}}"
  values={{ count: 5 }}
/>
// Output: "5 items"
```

**Select Expression Example**:

```typescript
// Translation key: "user.greeting"
// Translation value: "{gender, select, male {Mr.} female {Ms.} other {}} {name}"

<FormattedMessage
  id="user.greeting"
  defaultMessage="{gender, select, male {Mr.} female {Ms.} other {}} {name}"
  values={{ gender: 'female', name: 'Smith' }}
/>
// Output: "Ms. Smith"
```

---

### `useIntl` Hook

Access the full FormatJS `IntlShape` API for programmatic translation.

```typescript
const intl = useIntl();

// Format messages
const message = intl.formatMessage({ id: 'key', defaultMessage: 'Default' });

// Format numbers
const number = intl.formatNumber(1234.56); // "1,234.56" (locale-aware)

// Format dates
const date = intl.formatDate(new Date(), {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
}); // "February 16, 2026"

// Format relative time
const relative = intl.formatRelativeTime(-1, 'day'); // "yesterday"
```

**Full API**: See [FormatJS IntlShape Documentation](https://formatjs.io/docs/react-intl/api#intlshape)

---

### `IntlContext` Context

Access and control locale state.

```typescript
import { useIntlContext } from '@/contexts/IntlContext';

function LocaleManager() {
  const { locale, setLocale, messages, mergeMessages } = useIntlContext();

  const changeLocale = () => {
    setLocale('it'); // Change to Italian
  };

  return (
    <div>
      <p>Current locale: {locale}</p>
      <button onClick={changeLocale}>Switch to Italian</button>
    </div>
  );
}
```

**API**:

```typescript
{
  locale: string;                                  // Current locale (e.g., 'en', 'it')
  setLocale: (locale: string) => void;             // Change locale
  messages: Record<string, string>;                // All loaded messages
  mergeMessages: (newMessages: Record<string, string>) => void; // Add/update messages
}
```

---

## Translation Keys

### Key Naming Conventions

Translation keys follow a hierarchical structure with dot notation:

```
<namespace>.<feature>.<element>.<variant>
```

**Examples**:

- `core.welcome.title` - Core namespace, welcome feature, title element
- `auth.login.button` - Auth namespace, login feature, button element
- `workspace.create.form.name.label` - Workspace namespace, create feature, form, name field, label
- `plugin.analytics.chart.tooltip.empty` - Plugin namespace, analytics feature, chart, tooltip, empty state

**Rules**:

1. **Lowercase only**: Use lowercase letters, numbers, dots, and underscores
2. **Max 128 characters**: Keep keys concise
3. **Max 5 nesting levels**: `level1.level2.level3.level4.level5`
4. **No reserved prefixes**: Do not use `_system.` prefix (reserved for internal use)
5. **Descriptive**: Keys should clearly indicate their purpose

**Good Examples**:

```
✅ core.button.save
✅ auth.form.email.placeholder
✅ workspace.settings.general.title
✅ plugin.crm.contact.list.empty
```

**Bad Examples**:

```
❌ SaveButton (not lowercase)
❌ core.btn1 (not descriptive)
❌ _system.internal.key (reserved prefix)
❌ a.b.c.d.e.f.g (too many nesting levels)
```

---

### Key Organization by Namespace

| Namespace   | Purpose                                           | Example Keys                                        |
| ----------- | ------------------------------------------------- | --------------------------------------------------- |
| `core`      | Platform-wide UI elements, common components      | `core.welcome.title`, `core.button.save`            |
| `auth`      | Authentication and authorization                  | `auth.login.button`, `auth.signup.form.email.label` |
| `workspace` | Workspace management, members, teams              | `workspace.create.title`, `workspace.members.add`   |
| `plugin-*`  | Plugin-specific translations (e.g., `plugin-crm`) | `plugin-crm.contact.list.title`                     |

---

## Adding New Translations

### 1. Add Translation to Backend

Translations are stored in JSON files at:

```
apps/core-api/translations/{locale}/{namespace}.json
```

**Example**: Add a new translation key to `core` namespace in English:

```bash
# File: apps/core-api/translations/en/core.json
{
  "welcome.title": "Welcome to Plexica",
  "welcome.description": "Cloud-native platform with plugin architecture",
  "button.save": "Save",
  "button.cancel": "Cancel",
  "button.delete": "Delete",
  "new.key.here": "My New Translation"  // <-- Add new key
}
```

### 2. Add Translation in Other Locales

Add the same key to all supported locales:

```bash
# File: apps/core-api/translations/it/core.json
{
  "welcome.title": "Benvenuto a Plexica",
  ...
  "new.key.here": "La Mia Nuova Traduzione"  // <-- Italian
}

# File: apps/core-api/translations/es/core.json
{
  "welcome.title": "Bienvenido a Plexica",
  ...
  "new.key.here": "Mi Nueva Traducción"  // <-- Spanish
}
```

### 3. Use in Frontend

```typescript
<FormattedMessage
  id="core.new.key.here"
  defaultMessage="My New Translation"
/>
```

**Note**: The backend translation API automatically caches translations for 1 hour. No frontend changes needed!

---

### Adding Translations for Plugins

Plugins contribute translations via their manifest file:

```json
// plugin-manifest.json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "translations": {
    "namespaces": ["plugin-my-plugin"],
    "defaultLocale": "en",
    "supportedLocales": ["en", "it", "es"],
    "files": [
      {
        "locale": "en",
        "namespace": "plugin-my-plugin",
        "path": "translations/en/plugin-my-plugin.json"
      },
      {
        "locale": "it",
        "namespace": "plugin-my-plugin",
        "path": "translations/it/plugin-my-plugin.json"
      }
    ]
  }
}
```

**Translation File** (`translations/en/plugin-my-plugin.json`):

```json
{
  "dashboard.title": "My Plugin Dashboard",
  "settings.title": "Plugin Settings",
  "button.configure": "Configure"
}
```

**Usage**:

```typescript
// Load plugin namespace
const { isLoading } = useTranslations({ namespace: 'plugin-my-plugin' });

// Use plugin translations
<FormattedMessage
  id="plugin-my-plugin.dashboard.title"
  defaultMessage="My Plugin Dashboard"
/>
```

**Documentation**: See `apps/core-api/docs/PLUGIN_TRANSLATIONS.md` for full plugin translation guide.

---

## Translation Overrides

### Tenant-Level Overrides

Tenant admins can override any translation key for their tenant. Overrides apply to all workspaces within the tenant.

**Override UI**: Navigate to `/admin/translation-overrides` (requires `tenant_admin` role)

**Programmatic Override**:

```typescript
// Example: Override 'welcome.title' for tenant
PUT /api/v1/tenant/translations/overrides

{
  "overrides": {
    "en": {
      "core": {
        "welcome.title": "Welcome to Acme Corp Platform"  // Custom override
      }
    }
  }
}
```

**Precedence**:

1. **Tenant override** (highest priority)
2. **Plugin translation** (from manifest)
3. **Core translation** (default)
4. **`defaultMessage`** prop (fallback)
5. **Translation key** (last resort)

**Example**:

```typescript
// Base translation: "Welcome to Plexica"
// Tenant override: "Welcome to Acme Corp Platform"

<FormattedMessage
  id="core.welcome.title"
  defaultMessage="Welcome"
/>
// Output: "Welcome to Acme Corp Platform" (tenant override applied)
```

---

### Orphaned Overrides

If a tenant override exists but the base translation is removed (e.g., plugin disabled, key deleted), it becomes **orphaned**.

**UI Warning**: The Translation Override Editor displays a warning badge for orphaned overrides:

```
⚠️ Orphaned Override: This override does not have a corresponding base translation.
```

**Recommendation**: Review and remove orphaned overrides to keep translations clean.

---

## Performance

### Caching Strategy

Plexica uses a 2-tier caching strategy for optimal performance:

#### 1. Backend Redis Cache

- **TTL**: 1 hour
- **Key format**: `translations:{locale}:{namespace}`
- **Invalidation**: On translation file update or tenant override change

#### 2. Frontend TanStack Query Cache

- **Stale time**: 1 hour (`staleTime: 60 * 60 * 1000`)
- **Cache time**: 5 minutes (`cacheTime: 5 * 60 * 1000`)
- **Refetch**: On window focus, mount, or manual `refetch()`

**Cache Hit Flow**:

```
Component → useTranslations() → TanStack Query Cache (1h) → Backend Redis Cache (1h) → DB/File
```

**Benefits**:

- ⚡ **Sub-10ms** response time for cached translations
- 🔄 **Automatic invalidation** on tenant overrides
- 🌐 **No duplicate requests** for same namespace

---

### Bundle Size Optimization

**Namespace-based loading** ensures only necessary translations are loaded:

```typescript
// ❌ BAD: Load all namespaces upfront (large bundle)
const { isLoading } = useNamespaces([
  'core',
  'auth',
  'workspace',
  'plugin-crm',
  'plugin-analytics',
]);

// ✅ GOOD: Load only needed namespace (small bundle)
const { isLoading } = useTranslations({ namespace: 'core' });
```

**Lazy Loading**:

```typescript
// Load namespace only when feature is accessed
function CRMFeature() {
  const { isLoading } = useTranslations({ namespace: 'plugin-crm', enabled: true });

  if (isLoading) return <div>Loading...</div>;

  return <div>CRM UI</div>;
}
```

**Metrics** (average per namespace):

- Translation file size: ~5-15KB (uncompressed JSON)
- Gzip compression: ~70% reduction
- Load time (cached): <10ms
- Load time (uncached): 50-150ms

---

### Best Practices

1. **Load namespaces early**: Use `useNamespaces` in layout components to preload translations
2. **Avoid over-fetching**: Only load namespaces you actually use
3. **Use `enabled` flag**: Conditionally load translations based on feature flags
4. **Leverage caching**: Trust the 1-hour cache, don't force refetch unnecessarily
5. **Monitor bundle size**: Check Network tab in DevTools for translation payload sizes

---

## Troubleshooting

### Issue: "Translation key not found"

**Symptom**: `<FormattedMessage>` shows the translation key instead of translated text.

**Causes**:

1. **Namespace not loaded**: Forgot to call `useTranslations({ namespace: 'X' })`
2. **Key doesn't exist**: Translation file is missing the key
3. **Typo in key**: Key mismatch (e.g., `core.welcome.titl` instead of `core.welcome.title`)

**Solution**:

```typescript
// 1. Ensure namespace is loaded
const { isLoading, error } = useTranslations({ namespace: 'core' });

// 2. Check if key exists in backend file
// File: apps/core-api/translations/en/core.json
// { "welcome.title": "Welcome" }

// 3. Verify key spelling
<FormattedMessage id="core.welcome.title" defaultMessage="Welcome" />
```

---

### Issue: "Locale not persisting after reload"

**Symptom**: Locale resets to English after page reload.

**Causes**:

1. **LocalStorage not saving**: Browser privacy settings block localStorage
2. **SSR mismatch**: Server renders English, client tries to hydrate with different locale
3. **Invalid locale format**: Stored locale doesn't match `BCP 47` format

**Solution**:

```typescript
// Check localStorage in browser console
console.log(localStorage.getItem('plexica_locale'));
// Expected: 'en', 'it', 'es', etc.

// If null or invalid, set manually:
localStorage.setItem('plexica_locale', 'it');

// Reload page to verify persistence
```

**Fallback**: If localStorage fails, IntlContext falls back to:

1. `navigator.language` (browser language)
2. `'en'` (default)

---

### Issue: "404 error when loading translations"

**Symptom**: `useTranslations` returns `error: 404 Not Found`

**Causes**:

1. **Namespace doesn't exist**: Backend has no translation file for this namespace
2. **Locale not supported**: Requested locale doesn't have translations
3. **Plugin disabled**: Plugin namespace is unavailable because plugin is disabled

**Solution**:

```typescript
// Check backend file exists:
// apps/core-api/translations/{locale}/{namespace}.json

// For plugins, verify plugin is enabled:
GET /api/v1/tenants/:tenantId/plugins
// Check 'enabled: true'

// Handle 404 gracefully in component:
const { data, error } = useTranslations({ namespace: 'plugin-crm' });

if (error?.response?.status === 404) {
  return <div>Plugin not available</div>;
}
```

---

### Issue: "Translations not updating after tenant override"

**Symptom**: Changed translation override, but UI still shows old value.

**Causes**:

1. **Cache not invalidated**: Frontend cache still has old value (1-hour TTL)
2. **API not called**: `PUT /overrides` request failed
3. **Wrong locale**: Override applied to different locale than currently viewing

**Solution**:

```typescript
// 1. Verify override was saved
GET / api / v1 / tenant / translations / overrides;
// Check response contains your override

// 2. Force refetch in component
const { refetch } = useTranslations({ namespace: 'core' });
refetch(); // Bypasses cache

// 3. Clear frontend cache (dev only)
localStorage.clear();
window.location.reload();

// 4. Wait for cache to expire (1 hour) or restart backend to clear Redis
```

---

### Issue: "Plurals not working correctly"

**Symptom**: Plural forms display incorrectly (e.g., "1 items" instead of "1 item").

**Causes**:

1. **Incorrect ICU syntax**: Translation value has syntax error
2. **Missing CLDR categories**: Some locales require additional plural categories (e.g., `few`, `many`)
3. **Not using `count` variable**: Forgot to pass `count` in `values` prop

**Solution**:

```typescript
// Correct ICU MessageFormat plural syntax:
// Translation value: "{count, plural, =0 {No items} one {1 item} other {# items}}"

<FormattedMessage
  id="items.count"
  defaultMessage="{count, plural, =0 {No items} one {1 item} other {# items}}"
  values={{ count: itemCount }}  // <-- MUST pass 'count'
/>

// Test with different values:
// count = 0 → "No items"
// count = 1 → "1 item"
// count = 5 → "5 items"
```

**CLDR Plural Categories** (language-specific):

- `zero` (Arabic, Welsh)
- `one` (English: 1)
- `two` (Arabic, Welsh)
- `few` (Polish: 2-4)
- `many` (Polish: 5+)
- `other` (All others)

**Reference**: [CLDR Plural Rules](https://cldr.unicode.org/index/cldr-spec/plural-rules)

---

### Issue: "Performance lag when switching locales"

**Symptom**: UI freezes for 1-2 seconds when changing locale.

**Causes**:

1. **Loading too many namespaces**: Fetching 10+ namespaces at once
2. **No loading state**: Component re-renders immediately without skeleton
3. **API latency**: Backend taking too long to respond

**Solution**:

```typescript
// 1. Reduce namespaces loaded at once
// ❌ BAD
const { isLoading } = useNamespaces(['core', 'auth', 'workspace', 'plugin1', 'plugin2', ...]);

// ✅ GOOD: Load only essential namespaces
const { isLoading } = useNamespaces(['core']);

// 2. Add loading state with skeleton
if (isLoading) {
  return <div className="skeleton-loader">Loading translations...</div>;
}

// 3. Check backend API performance
// Expected: <100ms for cached translations
// If slower, check Redis connection and backend logs
```

---

### Issue: "TypeScript errors with `FormattedMessage`"

**Symptom**: TypeScript complains about missing `id` or `defaultMessage`.

**Causes**:

1. **Missing required props**: `id` and `defaultMessage` are required
2. **Incorrect import**: Imported from wrong package

**Solution**:

```typescript
// ✅ Correct import
import { FormattedMessage } from 'react-intl';

// ✅ Correct usage (both props required)
<FormattedMessage
  id="core.welcome.title"
  defaultMessage="Welcome"
/>

// ❌ WRONG: Missing defaultMessage
<FormattedMessage id="core.welcome.title" />

// ❌ WRONG: Missing id
<FormattedMessage defaultMessage="Welcome" />
```

---

### Debug Checklist

When encountering i18n issues, check these in order:

1. ✅ **Backend file exists**: Verify translation JSON file exists at `apps/core-api/translations/{locale}/{namespace}.json`
2. ✅ **Key exists in file**: Open JSON file and verify key is present
3. ✅ **Namespace loaded**: Confirm `useTranslations({ namespace: 'X' })` is called
4. ✅ **No typos**: Check key spelling matches exactly (case-sensitive)
5. ✅ **Locale is valid**: Verify `localStorage.getItem('plexica_locale')` returns valid locale
6. ✅ **Cache invalidated**: Try `refetch()` or clear localStorage
7. ✅ **Network tab**: Check API requests in DevTools → Network → `translations`
8. ✅ **Console errors**: Look for errors in browser console
9. ✅ **Backend logs**: Check core-api logs for translation loading errors

---

## Additional Resources

- **FormatJS Documentation**: https://formatjs.io/docs/react-intl/
- **ICU MessageFormat Syntax**: https://unicode-org.github.io/icu/userguide/format_parse/messages/
- **CLDR Plural Rules**: https://cldr.unicode.org/index/cldr-spec/plural-rules
- **Plugin Translation Guide**: `apps/core-api/docs/PLUGIN_TRANSLATIONS.md`
- **Backend API Spec**: `.forge/specs/006-i18n/spec.md`
- **Constitution i18n Requirements**: `.forge/constitution.md` (Article 1.3, Article 3.2)

---

## Need Help?

- **GitHub Issues**: Report bugs or request features at https://github.com/plexica/plexica/issues
- **Discussions**: Ask questions at https://github.com/plexica/plexica/discussions
- **Slack/Discord**: Join the Plexica community (if available)

---

_Plexica Frontend i18n Documentation_  
_Version: 1.0 (Sprint 2 Complete)_  
_Last Updated: February 16, 2026_
