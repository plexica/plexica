# @plexica/i18n

> Shared internationalization (i18n) utilities for Plexica platform

## Overview

`@plexica/i18n` provides namespace-based translation utilities wrapping FormatJS (ICU MessageFormat) for both backend and frontend use. This package enables:

- **Namespace-based translations**: Organized by plugin/module namespaces
- **Tenant overrides**: Tenant-specific translation customization
- **Content hashing**: Deterministic cache-busting URLs for CDN delivery
- **Locale resolution**: Fallback chain (browser → user → tenant → default)
- **ICU MessageFormat**: Full pluralization, interpolation, and select expression support

## Installation

This package is part of the Plexica monorepo and is consumed via workspace protocol:

```json
{
  "dependencies": {
    "@plexica/i18n": "workspace:*"
  }
}
```

## Usage

### Flattening and Unflattening Translations

```typescript
import { flattenMessages, unflattenMessages } from '@plexica/i18n';

// Flatten nested structure to dotted keys
const nested = {
  dashboard: {
    title: 'Dashboard',
    actions: {
      save: 'Save Changes',
      cancel: 'Cancel',
    },
  },
};

const flat = flattenMessages(nested);
// Result: { 'dashboard.title': 'Dashboard', 'dashboard.actions.save': 'Save Changes', ... }

// Unflatten back to nested structure
const restored = unflattenMessages(flat);
// Result: { dashboard: { title: '...', actions: { save: '...', ... } } }
```

### Content Hashing for Cache Busting

```typescript
import { generateContentHash } from '@plexica/i18n';

const messages = { greeting: 'Hello, {name}!' };
const hash = generateContentHash(messages);
// Result: "a1b2c3d4" (8-char deterministic SHA-256 hash)

// Use in CDN URLs: /translations/en/common.a1b2c3d4.json
```

### Locale Resolution

```typescript
import { resolveLocale } from '@plexica/i18n';

// Resolve from fallback chain
const locale = resolveLocale({
  browserLocale: 'it-IT',
  userLocale: undefined,
  tenantDefaultLocale: 'en',
});
// Result: "it-IT" (first non-null value in chain)

// Fallback to default
const defaultLocale = resolveLocale({});
// Result: "en"
```

### Tenant Override Merging

```typescript
import { mergeOverrides } from '@plexica/i18n';

const baseMessages = {
  'common.greeting': 'Hello',
  'common.farewell': 'Goodbye',
};

const tenantOverrides = {
  'common.greeting': 'Ciao', // Override
};

const merged = mergeOverrides(baseMessages, tenantOverrides);
// Result: { 'common.greeting': 'Ciao', 'common.farewell': 'Goodbye' }
```

### FormatJS Integration

```typescript
import { createNamespacedIntl } from '@plexica/i18n';

const intl = createNamespacedIntl('en', 'dashboard', {
  'dashboard.welcome': 'Welcome, {name}!',
  'dashboard.itemCount': 'You have {count, plural, one {# item} other {# items}}.',
});

// Use FormatJS IntlShape methods
console.log(intl.formatMessage({ id: 'dashboard.welcome' }, { name: 'Alice' }));
// Output: "Welcome, Alice!"

console.log(intl.formatMessage({ id: 'dashboard.itemCount' }, { count: 3 }));
// Output: "You have 3 items."
```

## API Reference

### Utilities

- **`flattenMessages(nested: object): Record<string, string>`**  
  Convert nested translation structure to flat dotted keys.

- **`unflattenMessages(flat: Record<string, string>): object`**  
  Convert flat dotted keys back to nested structure.

- **`generateContentHash(messages: Record<string, string>): string`**  
  Generate 8-character SHA-256 content hash for cache busting.

- **`resolveLocale(options: LocaleResolutionOptions): string`**  
  Resolve locale from fallback chain (browser → user → tenant → `"en"`).

- **`mergeOverrides(base: Record<string, string>, overrides: Record<string, string>): Record<string, string>`**  
  Merge tenant overrides onto base translations with override precedence.

- **`createNamespacedIntl(locale: string, namespace: string, messages: Record<string, string>, overrides?: Record<string, string>): IntlShape`**  
  Create FormatJS IntlShape instance with namespace-scoped translations.

### Types

```typescript
export interface LocaleResolutionOptions {
  browserLocale?: string;
  userLocale?: string;
  tenantDefaultLocale?: string;
}

export interface TranslationBundle {
  locale: string;
  namespace: string;
  messages: Record<string, string>;
  contentHash: string;
}

export interface TenantOverrides {
  [locale: string]: {
    [namespace: string]: {
      [key: string]: string;
    };
  };
}
```

## Testing

```bash
# Run unit tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Generate coverage report
pnpm test:coverage
```

## Architecture

This package is designed for dual-environment usage:

- **Backend (Node.js)**: Translation file loading, caching, and HTTP delivery
- **Frontend (React)**: Runtime translation with `react-intl` integration

Both environments share the same core utilities for consistency.

## Related

- **Spec**: [.forge/specs/006-i18n/spec.md](../../.forge/specs/006-i18n/spec.md)
- **Plan**: [.forge/specs/006-i18n/plan.md](../../.forge/specs/006-i18n/plan.md)
- **ADR-012**: [FormatJS Library Selection](../../.forge/knowledge/adr/adr-012-icu-messageformat-library.md)

## License

Private package - part of the Plexica platform.
