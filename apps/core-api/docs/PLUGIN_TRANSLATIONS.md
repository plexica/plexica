# Plugin Translation System

This guide explains how plugin developers can add internationalization (i18n) support to their Plexica plugins.

**Last Updated**: February 14, 2026

---

## Overview

Plugins can ship translations in multiple languages by:

1. Declaring translation namespaces and supported locales in the plugin manifest
2. Providing translation files for each locale
3. Using the `@plexica/i18n` package to format messages in their code

**Key features:**

- **Namespace isolation**: Each plugin gets its own namespace(s) to avoid key conflicts
- **Lazy loading**: Plugin translations are only loaded when the plugin is enabled for a tenant
- **Validation**: Translation files and keys are validated at plugin registration time
- **Multi-locale support**: Ship translations for any number of locales

---

## Quick Start

### 1. Declare Translations in Manifest

Add a `translations` section to your `plugin.manifest.json`:

```json
{
  "id": "my-crm-plugin",
  "name": "CRM Plugin",
  "version": "1.0.0",
  "category": "productivity",
  "description": "Customer relationship management",
  "translations": {
    "namespaces": ["crm", "crm-reports"],
    "supportedLocales": ["en", "es", "fr", "de"]
  },
  "metadata": {
    "author": {
      "name": "Acme Corp"
    },
    "license": "MIT"
  }
}
```

**Field reference:**

- **`namespaces`** (required): Array of namespace identifiers
  - Format: Lowercase alphanumeric with hyphens (e.g., `crm`, `crm-reports`)
  - Regex: `/^[a-z0-9\-]+$/`
  - Each namespace corresponds to one translation file per locale
- **`supportedLocales`** (required): Array of BCP 47 locale codes
  - Format: `{language}` or `{language}-{REGION}` (e.g., `en`, `en-US`, `pt-BR`)
  - Regex: `/^[a-z]{2}(-[A-Z]{2})?$/`

### 2. Create Translation Files

Create translation files for each locale and namespace:

```
plugins/my-crm-plugin/
└── translations/
    ├── en/
    │   ├── crm.json
    │   └── crm-reports.json
    ├── es/
    │   ├── crm.json
    │   └── crm-reports.json
    ├── fr/
    │   ├── crm.json
    │   └── crm-reports.json
    └── de/
        ├── crm.json
        └── crm-reports.json
```

**File naming convention**: `{namespace}.json`

### 3. Write Translation Files

Translation files use nested JSON with ICU MessageFormat syntax:

**`plugins/my-crm-plugin/translations/en/crm.json`:**

```json
{
  "contacts": {
    "list": {
      "title": "Contacts",
      "emptyState": "No contacts yet. Add your first contact to get started.",
      "addButton": "Add Contact"
    },
    "form": {
      "name": "Full Name",
      "email": "Email Address",
      "phone": "Phone Number",
      "save": "Save Contact"
    },
    "messages": {
      "saveSuccess": "Contact {name} saved successfully!",
      "deleteConfirm": "Delete contact {name}?",
      "contactCount": "{count, plural, =0 {No contacts} one {1 contact} other {# contacts}}"
    }
  },
  "settings": {
    "title": "CRM Settings",
    "salesPipeline": "Sales Pipeline Configuration"
  }
}
```

**`plugins/my-crm-plugin/translations/es/crm.json`:**

```json
{
  "contacts": {
    "list": {
      "title": "Contactos",
      "emptyState": "Aún no hay contactos. Agrega tu primer contacto para comenzar.",
      "addButton": "Agregar Contacto"
    },
    "form": {
      "name": "Nombre Completo",
      "email": "Correo Electrónico",
      "phone": "Número de Teléfono",
      "save": "Guardar Contacto"
    },
    "messages": {
      "saveSuccess": "¡Contacto {name} guardado exitosamente!",
      "deleteConfirm": "¿Eliminar contacto {name}?",
      "contactCount": "{count, plural, =0 {Sin contactos} one {1 contacto} other {# contactos}}"
    }
  },
  "settings": {
    "title": "Configuración de CRM",
    "salesPipeline": "Configuración de Pipeline de Ventas"
  }
}
```

---

## Translation Key Validation

All translation keys must follow these rules:

- **Maximum length**: 128 characters
- **Allowed characters**: `a-z`, `A-Z`, `0-9`, `.`, `_`
- **Format**: Dot notation for hierarchy (e.g., `contacts.list.title`)
- **Style**: camelCase for multi-word keys (e.g., `emptyState`, `saveSuccess`)

**Valid keys:**

- ✅ `contacts.list.title`
- ✅ `messages.saveSuccess`
- ✅ `form.fields.emailAddress`
- ✅ `settings.advanced.debugMode`

**Invalid keys:**

- ❌ `contacts-list-title` (hyphens not allowed)
- ❌ `contacts/list/title` (slashes not allowed)
- ❌ `contacts list title` (spaces not allowed)
- ❌ `contacts.list.this_is_a_very_long_key_name_that_exceeds_the_maximum_allowed_length_of_one_hundred_twenty_eight_characters_and_will_be_rejected` (>128 chars)

---

## File Size Limits

**Maximum file size: 200KB per namespace file**

If a translation file exceeds 200KB, the plugin registration will fail with this error:

```
Translation file too large: plugins/my-plugin/translations/en/crm.json (245.32KB > 200KB limit).
Split into multiple namespaces or reduce translation count.
```

**Solution**: Split translations into multiple namespaces:

```json
{
  "translations": {
    "namespaces": ["crm-contacts", "crm-deals", "crm-reports"],
    "supportedLocales": ["en", "es"]
  }
}
```

---

## ICU MessageFormat Syntax

Plexica uses FormatJS for ICU MessageFormat support. Here are common patterns:

### Basic Placeholders

```json
{
  "greeting": "Hello {name}!",
  "welcome": "Welcome back, {firstName} {lastName}!"
}
```

### Number Formatting

```json
{
  "revenue": "Total revenue: {amount, number, currency}",
  "percentage": "Conversion rate: {rate, number, percent}"
}
```

### Date Formatting

```json
{
  "lastUpdated": "Last updated: {date, date, long}",
  "dueDate": "Due: {date, date, short}"
}
```

### Pluralization

```json
{
  "itemCount": "{count, plural, =0 {No items} one {1 item} other {# items}}",
  "daysRemaining": "{days, plural, =0 {Due today} one {1 day remaining} other {# days remaining}}"
}
```

### Select (Conditionals)

```json
{
  "status": "{status, select, active {Active} inactive {Inactive} pending {Pending} other {Unknown}}",
  "gender": "{gender, select, male {He completed} female {She completed} other {They completed}} the task"
}
```

**Resources:**

- [FormatJS Documentation](https://formatjs.io/docs/core-concepts/icu-syntax/)
- [ICU Message Format Guide](https://unicode-org.github.io/icu/userguide/format_parse/messages/)

---

## Using Translations in Plugin Code

### Backend (Node.js)

```typescript
import { createIntl, createIntlCache } from '@formatjs/intl';
import { loadMessages } from '@plexica/i18n';

// Load plugin translations
const messages = await loadMessages('en', 'crm');
const cache = createIntlCache();
const intl = createIntl({ locale: 'en', messages }, cache);

// Format messages
const title = intl.formatMessage({ id: 'contacts.list.title' });
// => "Contacts"

const greeting = intl.formatMessage({ id: 'messages.saveSuccess' }, { name: 'John Doe' });
// => "Contact John Doe saved successfully!"

const count = intl.formatMessage({ id: 'messages.contactCount' }, { count: 5 });
// => "5 contacts"
```

### Frontend (React)

```tsx
import { useIntl, FormattedMessage } from 'react-intl';

function ContactList() {
  const intl = useIntl();

  return (
    <div>
      <h1>
        <FormattedMessage id="crm.contacts.list.title" />
      </h1>

      <button>{intl.formatMessage({ id: 'crm.contacts.list.addButton' })}</button>

      <p>
        <FormattedMessage id="crm.messages.contactCount" values={{ count: contacts.length }} />
      </p>
    </div>
  );
}
```

---

## Plugin Enable/Disable Behavior

**Translation namespaces are only available when the plugin is enabled for a tenant.**

### Example Workflow

1. **Plugin installed but disabled**:

   ```bash
   GET /api/v1/translations/en/crm?tenant=acme-corp
   # => 404 Not Found (namespace not available)
   ```

2. **Enable plugin for tenant**:

   ```bash
   POST /api/v1/tenants/acme-corp/plugins/my-crm-plugin/enable
   # => 200 OK
   ```

3. **Namespace now available**:

   ```bash
   GET /api/v1/translations/en/crm?tenant=acme-corp
   # => 200 OK (returns translations)
   ```

4. **Disable plugin**:

   ```bash
   POST /api/v1/tenants/acme-corp/plugins/my-crm-plugin/disable
   # => 200 OK
   ```

5. **Namespace no longer available**:
   ```bash
   GET /api/v1/translations/en/crm?tenant=acme-corp
   # => 404 Not Found
   ```

This ensures that tenants only load translations for plugins they actively use.

---

## Validation Errors

### Missing Translation File

**Error:**

```
Missing translation file: plugins/my-crm-plugin/translations/es/crm.json.
Plugin declares namespace "crm" for locale "es" but file does not exist.
```

**Solution**: Create the missing file at the specified path.

### File Too Large

**Error:**

```
Translation file too large: plugins/my-crm-plugin/translations/en/crm.json (245.32KB > 200KB limit).
Split into multiple namespaces or reduce translation count.
```

**Solution**: Split translations into multiple namespaces (see [File Size Limits](#file-size-limits)).

### Invalid Translation Key

**Error:**

```
Invalid translation key "contacts/list/title" in plugins/my-crm-plugin/translations/en/crm.json:
Key must contain only letters, numbers, dots, and underscores.
```

**Solution**: Fix the key to use only allowed characters (see [Translation Key Validation](#translation-key-validation)).

### Invalid Namespace Format

**Error:**

```
Invalid plugin manifest: translations.namespaces.0: Namespace must be lowercase alphanumeric with hyphens (e.g., 'crm', 'crm-reports')
```

**Solution**: Use only lowercase letters, numbers, and hyphens in namespace identifiers.

### Invalid Locale Format

**Error:**

```
Invalid plugin manifest: translations.supportedLocales.0: Locale must follow BCP 47 format (e.g., 'en', 'en-US', 'pt-BR')
```

**Solution**: Use valid BCP 47 locale codes (`en`, `es`, `en-US`, `pt-BR`, etc.).

---

## Testing Translations

### 1. Validate Manifest

Test your plugin manifest before registration:

```bash
# Validate manifest structure
npx zod-to-json-schema path/to/plugin.manifest.json
```

### 2. Test Registration

Register your plugin to trigger validation:

```bash
POST /api/v1/plugins/register
Content-Type: application/json

{
  "id": "my-crm-plugin",
  "name": "CRM Plugin",
  "version": "1.0.0",
  "translations": {
    "namespaces": ["crm"],
    "supportedLocales": ["en", "es"]
  },
  ...
}
```

If validation fails, you'll get actionable error messages.

### 3. Test Translation Retrieval

Fetch translations for each locale:

```bash
# English
GET /api/v1/translations/en/crm

# Spanish
GET /api/v1/translations/es/crm

# With tenant overrides
GET /api/v1/translations/en/crm?tenant=acme-corp
```

### 4. Test Enable/Disable Flow

```bash
# 1. Enable plugin
POST /api/v1/tenants/acme-corp/plugins/my-crm-plugin/enable

# 2. Verify namespace available
GET /api/v1/translations/en/crm?tenant=acme-corp
# => Should return translations

# 3. Disable plugin
POST /api/v1/tenants/acme-corp/plugins/my-crm-plugin/disable

# 4. Verify namespace unavailable
GET /api/v1/translations/en/crm?tenant=acme-corp
# => Should return 404
```

---

## Best Practices

### Key Organization

Group related keys hierarchically:

```json
{
  "module": {
    "feature": {
      "component": {
        "action": "Translation"
      }
    }
  }
}
```

**Example:**

```json
{
  "contacts": {
    "list": {
      "toolbar": {
        "search": "Search contacts",
        "filter": "Filter",
        "export": "Export to CSV"
      }
    }
  }
}
```

### Reusable Strings

Extract common strings to a shared section:

```json
{
  "common": {
    "actions": {
      "save": "Save",
      "cancel": "Cancel",
      "delete": "Delete",
      "edit": "Edit"
    },
    "messages": {
      "loading": "Loading...",
      "error": "An error occurred",
      "success": "Operation completed successfully"
    }
  },
  "contacts": {
    "list": {
      "title": "Contacts"
    }
  }
}
```

### Context in Keys

Include context in key names to help translators:

- ✅ `contacts.list.emptyState` (clear context: empty state in contact list)
- ❌ `empty` (unclear: empty what?)

### Placeholders with Context

Use descriptive placeholder names:

- ✅ `"Welcome {firstName}!"`
- ❌ `"Welcome {x}!"`

### Avoid Concatenation

Don't concatenate translated strings (breaks grammar in other languages):

**❌ Bad:**

```json
{
  "prefix": "You have",
  "suffix": "new messages"
}
// Code: intl.formatMessage('prefix') + count + intl.formatMessage('suffix')
```

**✅ Good:**

```json
{
  "newMessages": "{count, plural, =0 {No new messages} one {1 new message} other {# new messages}}"
}
```

### Translation Comments

Add comments in your English translation files to help translators:

```json
{
  "contacts": {
    "list": {
      "emptyState": "No contacts yet. Add your first contact to get started.",
      "_emptyState_comment": "Shown when the user has not added any contacts to their CRM"
    }
  }
}
```

---

## Example Plugin

Here's a complete minimal example:

### Manifest

**`plugin.manifest.json`:**

```json
{
  "id": "simple-todo",
  "name": "Simple Todo",
  "version": "1.0.0",
  "category": "productivity",
  "description": "A simple todo list plugin",
  "translations": {
    "namespaces": ["todo"],
    "supportedLocales": ["en", "es"]
  },
  "metadata": {
    "author": {
      "name": "Acme Corp",
      "email": "dev@acme.com"
    },
    "license": "MIT"
  }
}
```

### English Translations

**`plugins/simple-todo/translations/en/todo.json`:**

```json
{
  "app": {
    "title": "Todo List"
  },
  "list": {
    "emptyState": "No tasks yet. Add your first task to get started.",
    "addButton": "Add Task"
  },
  "form": {
    "taskName": "Task Name",
    "dueDate": "Due Date",
    "priority": "Priority",
    "save": "Save Task",
    "cancel": "Cancel"
  },
  "messages": {
    "taskAdded": "Task \"{name}\" added successfully!",
    "taskCompleted": "Task completed!",
    "taskCount": "{count, plural, =0 {No tasks} one {1 task} other {# tasks}}"
  }
}
```

### Spanish Translations

**`plugins/simple-todo/translations/es/todo.json`:**

```json
{
  "app": {
    "title": "Lista de Tareas"
  },
  "list": {
    "emptyState": "Aún no hay tareas. Agrega tu primera tarea para comenzar.",
    "addButton": "Agregar Tarea"
  },
  "form": {
    "taskName": "Nombre de la Tarea",
    "dueDate": "Fecha de Vencimiento",
    "priority": "Prioridad",
    "save": "Guardar Tarea",
    "cancel": "Cancelar"
  },
  "messages": {
    "taskAdded": "¡Tarea \"{name}\" agregada exitosamente!",
    "taskCompleted": "¡Tarea completada!",
    "taskCount": "{count, plural, =0 {Sin tareas} one {1 tarea} other {# tareas}}"
  }
}
```

---

## FAQ

### Q: Can I use the `core` namespace in my plugin?

**A:** No. The `core` namespace is reserved for the Plexica platform. Choose a unique namespace for your plugin (e.g., `crm`, `helpdesk`, `todo`).

### Q: What happens if a translation key is missing in a locale?

**A:** The system will fall back to the English (`en`) translation. If the key is also missing in English, the raw key will be displayed.

### Q: Can I update translations after plugin registration?

**A:** Yes. Use the plugin update API:

```bash
PUT /api/v1/plugins/{pluginId}
```

The updated translation files will be re-validated at update time.

### Q: Can tenants override plugin translations?

**A:** Yes. Tenants can override translation keys via the API:

```bash
PUT /api/v1/tenant/translations/overrides
{
  "en": {
    "crm": {
      "contacts.list.title": "Clients"
    }
  }
}
```

### Q: How do I handle right-to-left (RTL) languages?

**A:** Use standard BCP 47 locale codes (e.g., `ar` for Arabic, `he` for Hebrew). The frontend should detect RTL locales and apply appropriate CSS.

### Q: Can I have multiple namespaces per plugin?

**A:** Yes. Declare multiple namespaces in your manifest:

```json
{
  "translations": {
    "namespaces": ["crm-contacts", "crm-deals", "crm-reports"],
    "supportedLocales": ["en", "es"]
  }
}
```

This is useful for large plugins or to stay under the 200KB file size limit.

---

## Related Documentation

- **Core Translations README**: `apps/core-api/translations/en/README.md`
- **i18n API Endpoints**: `apps/core-api/src/modules/i18n/README.md`
- **@plexica/i18n Package**: `packages/i18n/README.md`
- **FormatJS Documentation**: https://formatjs.io/docs/getting-started/installation
- **ICU MessageFormat Guide**: https://unicode-org.github.io/icu/userguide/format_parse/messages/

---

_Last updated: February 14, 2026_  
_For questions or issues, file an issue at: https://github.com/plexica/plexica/issues_
