# Translation Files

This directory contains translation files for the Plexica platform's internationalization (i18n) system.

## Directory Structure

```
translations/
├── en/                 # English (default locale)
│   ├── core.json      # Core platform translations
│   └── [plugin].json  # Plugin-specific translations
├── es/                # Spanish
├── fr/                # French
└── [locale]/          # Additional locales
```

## File Format

Translation files are JSON files with nested key-value pairs following the ICU MessageFormat syntax:

```json
{
  "section": {
    "subsection": {
      "key": "Translation text",
      "keyWithPlaceholder": "Hello {name}!",
      "keyWithPlural": "{count, plural, =0 {No items} one {1 item} other {# items}}"
    }
  }
}
```

## Translation Keys

**Key naming rules** (enforced by validation):

- Maximum 128 characters
- Allowed characters: `a-z`, `A-Z`, `0-9`, `.`, `_`
- Use dot notation for hierarchy: `section.subsection.key`
- Use camelCase for multi-word keys: `auth.invalidCredentials`

**Examples:**

- ✅ Good: `common.save`, `auth.loginSuccess`, `errors.notFound`
- ❌ Bad: `common-save` (hyphens), `auth/login` (slashes), `errors.not found` (spaces)

## Namespaces

Each plugin gets its own namespace (e.g., `crm`, `helpdesk`). The `core` namespace is reserved for the platform itself.

**Namespace structure:**

- `core`: Platform-wide UI strings (navigation, common buttons, errors)
- `[plugin-name]`: Plugin-specific translations (e.g., `crm`, `helpdesk`)

**File size limit**: 200KB per namespace file (enforced by API)

## ICU MessageFormat Syntax

Plexica uses FormatJS for ICU MessageFormat support:

### Basic Placeholders

```json
{
  "greeting": "Hello {name}!"
}
```

### Number Formatting

```json
{
  "price": "Price: {amount, number, currency}"
}
```

### Date Formatting

```json
{
  "created": "Created on {date, date, long}"
}
```

### Pluralization

```json
{
  "itemCount": "{count, plural, =0 {No items} one {1 item} other {# items}}"
}
```

### Select (Gender, etc.)

```json
{
  "invitation": "{gender, select, male {He invited you} female {She invited you} other {They invited you}}"
}
```

**Resources:**

- [FormatJS Documentation](https://formatjs.io/docs/core-concepts/icu-syntax/)
- [ICU Message Format Guide](https://unicode-org.github.io/icu/userguide/format_parse/messages/)

## Locale Fallback

The i18n system uses a fallback chain:

1. Requested locale (e.g., `es`)
2. English (`en`) as default

If a translation key is missing in the requested locale, the English translation will be used.

## Tenant Overrides

Tenants can override specific translation keys via the API without modifying the source files:

```json
PUT /api/v1/tenant/translations/overrides
{
  "en": {
    "core": {
      "common.save": "Save Changes"
    }
  }
}
```

Overrides are stored in the `tenants.translation_overrides` JSONB column.

## Adding Translations for a New Locale

1. Create a new directory: `translations/{locale}/`
2. Copy `en/core.json` as a template
3. Translate all keys while preserving the JSON structure
4. Test with: `GET /api/v1/translations/{locale}/core`
5. Verify fallback works: untranslated keys should fall back to English

**Example:**

```bash
# Add Spanish translations
mkdir translations/es
cp translations/en/core.json translations/es/core.json
# Edit translations/es/core.json with Spanish translations
```

## Plugin Translations

Plugins declare their translation namespaces in `plugin.manifest.json`:

```json
{
  "name": "crm",
  "version": "1.0.0",
  "translations": {
    "namespace": "crm",
    "supportedLocales": ["en", "es", "fr"]
  }
}
```

Plugin translation files should be placed in:

```
plugins/
└── crm/
    └── translations/
        ├── en/
        │   └── crm.json
        ├── es/
        │   └── crm.json
        └── fr/
            └── crm.json
```

**Note**: Plugin translations are only available when the plugin is enabled for a tenant.

## API Endpoints

### Get Translations

```bash
# Get core translations for English
GET /api/v1/translations/en/core

# Get plugin translations
GET /api/v1/translations/en/crm

# Get with tenant overrides
GET /api/v1/translations/en/core?tenant=acme-corp
```

### Get Available Locales

```bash
GET /api/v1/translations/locales
```

### Manage Tenant Overrides (Authenticated)

```bash
# Get current overrides
GET /api/v1/tenant/translations/overrides

# Update overrides
PUT /api/v1/tenant/translations/overrides
Content-Type: application/json

{
  "en": {
    "core": {
      "common.save": "Save Changes",
      "common.cancel": "Discard"
    }
  }
}
```

## Best Practices

1. **Keep keys descriptive**: Use `auth.invalidCredentials` instead of `auth.error1`
2. **Organize by feature**: Group related translations under common prefixes
3. **Use ICU syntax for dynamic content**: Leverage plurals, selects, and formatting
4. **Avoid hardcoding text**: Extract all user-facing strings to translation files
5. **Test with missing keys**: Verify fallback behavior works correctly
6. **Document context**: Add comments in JSON (use a `.md` companion file) to explain context
7. **Validate before committing**: Ensure all JSON files are valid and keys follow naming rules

## Validation

All translation files are validated on load:

- ✅ Valid JSON syntax
- ✅ File size < 200KB
- ✅ Translation keys follow naming rules
- ✅ No circular references
- ✅ ICU MessageFormat syntax is valid

## Caching

Translation files are cached in Redis with:

- **TTL**: 1 hour (3600 seconds)
- **Cache key pattern**: `i18n:{locale}:{namespace}` or `i18n:{tenantSlug}:{locale}:{namespace}`
- **Cache headers**: `Cache-Control: public, immutable, max-age=31536000`
- **ETag support**: Content-hashed ETags for 304 Not Modified responses

## Contributing Translations

1. Fork the repository
2. Add or update translation files in `translations/{locale}/`
3. Validate JSON syntax and key naming
4. Test with the API endpoint
5. Submit a pull request with:
   - Description of translations added/updated
   - Confirmation that all keys follow naming rules
   - Proof of testing (API response or screenshot)

## Support

For questions about translations:

- See [Spec 006: i18n Support](../../.forge/specs/006-i18n/spec.md)
- Check [Technical Plan](../../.forge/specs/006-i18n/plan.md)
- Open an issue with the `i18n` label

---

**Last Updated**: February 14, 2026  
**Version**: 1.0.0  
**Related Spec**: `.forge/specs/006-i18n/spec.md`
