# Plugin Development Guide

Complete guide for developing, building, and deploying plugins for the Plexica platform.

## Table of Contents

- [Overview](#overview)
- [Plugin Architecture](#plugin-architecture)
- [Quick Start](#quick-start)
- [Plugin Structure](#plugin-structure)
- [Development Workflow](#development-workflow)
- [CLI Commands](#cli-commands)
- [Manifest Configuration](#manifest-configuration)
- [Component Development](#component-development)
- [Deployment](#deployment)
- [Testing](#testing)
- [Best Practices](#best-practices)

---

## Overview

Plexica uses **Module Federation** to enable dynamic plugin loading at runtime. Plugins are self-contained React applications that integrate seamlessly into the host application.

### Key Features

- ✅ **Hot reload during development** - See changes instantly
- ✅ **Dynamic loading** - Plugins load on-demand without rebuilding the host
- ✅ **Shared dependencies** - React, Router, and common libraries are shared
- ✅ **Type-safe** - Full TypeScript support
- ✅ **CDN deployment** - Plugins served from MinIO object storage
- ✅ **Multi-tenant** - Each tenant can have different plugins enabled

---

## Plugin Architecture

```
┌──────────────────────────────────────┐
│         Web App (Host)               │
│  ┌────────────────────────────────┐  │
│  │   Plugin Loader                │  │
│  │   - Fetches plugin list        │  │
│  │   - Loads remoteEntry.js       │  │
│  │   - Registers routes/menus     │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
              ▼
┌──────────────────────────────────────┐
│          MinIO CDN                   │
│  /plexica-plugins/                   │
│    ├── crm/0.1.0/                    │
│    │   ├── remoteEntry.js            │
│    │   └── assets/                   │
│    └── analytics/0.1.0/              │
│        ├── remoteEntry.js            │
│        └── assets/                   │
└──────────────────────────────────────┘
              ▼
┌──────────────────────────────────────┐
│         Plugin (Remote)              │
│  ┌────────────────────────────────┐  │
│  │   Exposed Modules              │  │
│  │   - ./Plugin (main component)  │  │
│  │   - ./manifest (config)        │  │
│  │   - ./routes (routing)         │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │   Components                   │  │
│  │   - HomePage                   │  │
│  │   - SettingsPage               │  │
│  │   - ...                        │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

---

## Quick Start

### 1. Create a New Plugin

```bash
# Copy the plugin template
cp -r apps/plugin-template-frontend apps/plugin-myapp

cd apps/plugin-myapp
```

### 2. Configure the Plugin

Edit `package.json`:

```json
{
  "name": "@plexica/plugin-myapp",
  "description": "My awesome plugin",
  "scripts": {
    "dev": "vite --port 3400" // Choose unique port
  }
}
```

Edit `vite.config.ts`:

```typescript
federation({
  name: 'plugin_myapp',  // Change this
  filename: 'remoteEntry.js',
  // ...
})

server: {
  port: 3400,  // Match package.json
}
```

### 3. Update the Manifest

Edit `src/manifest.ts`:

```typescript
export const manifest: PluginManifest = {
  id: 'myapp',
  name: 'My App',
  version: '0.1.0',
  description: 'My awesome plugin description',
  icon: 'Rocket', // Lucide icon name
  routes: [
    {
      path: '/plugins/myapp',
      componentName: 'HomePage',
      title: 'My App Home',
    },
  ],
  menuItems: [
    {
      id: 'myapp-main',
      label: 'My App',
      icon: 'Rocket',
      path: '/plugins/myapp',
      order: 30, // Lower = higher in sidebar
    },
  ],
};
```

### 4. Create Components

Create `src/components/HomePage.tsx`:

```typescript
import React from 'react';

export interface PluginProps {
  tenantId: string;
  userId: string;
  workspaceId?: string;
}

const HomePage: React.FC<PluginProps> = ({ tenantId, userId }) => {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold">My App</h1>
      <p>Tenant: {tenantId}</p>
      <p>User: {userId}</p>
    </div>
  );
};

export default HomePage;
```

### 5. Export Components

Edit `src/Plugin.tsx`:

```typescript
import HomePage from './components/HomePage';

// Export all page components
export { HomePage };

// Default export
const Plugin: React.FC<PluginProps> = (props) => {
  return <HomePage {...props} />;
};

export default Plugin;
```

### 6. Update Routes

Edit `src/routes/index.ts`:

```typescript
export const routes: PluginRoute[] = [
  {
    path: '/plugins/myapp',
    componentName: 'HomePage',
    title: 'My App Home',
    layout: 'default',
  },
];
```

### 7. Build and Publish

```bash
# Build the plugin
plexica build

# Publish to CDN
plexica publish
```

### 8. Register in Database

```typescript
// Create a seed script or use Prisma Studio
await prisma.plugin.create({
  data: {
    id: 'myapp',
    name: 'My App',
    version: '0.1.0',
    manifest: {
      /* your manifest */
    },
    status: 'AVAILABLE',
  },
});

// Install for tenant
await prisma.tenantPlugin.create({
  data: {
    tenantId: 'tenant-id-here',
    pluginId: 'myapp',
    enabled: true,
  },
});
```

---

## Plugin Structure

```
apps/plugin-myapp/
├── package.json              # Dependencies and scripts
├── vite.config.ts            # Vite + Module Federation config
├── tsconfig.json             # TypeScript configuration
├── src/
│   ├── Plugin.tsx            # Main entry point
│   ├── manifest.ts           # Plugin manifest
│   ├── routes/
│   │   └── index.ts          # Route definitions
│   ├── components/           # React components
│   │   ├── HomePage.tsx
│   │   ├── SettingsPage.tsx
│   │   └── ...
│   └── lib/                  # Utilities (optional)
└── dist/                     # Build output (gitignored)
    ├── remoteEntry.js
    └── assets/
```

---

## Development Workflow

### Local Development

```bash
# Start development server
cd apps/plugin-myapp
pnpm dev
```

The plugin runs at `http://localhost:{PORT}` in standalone mode.

### Hot Reload

Changes to components automatically reload. No need to rebuild.

### Debugging

1. Open browser DevTools
2. Check Network tab for module loading
3. Check Console for errors
4. Use React DevTools for component inspection

---

## CLI Commands

The `@plexica/cli` package provides commands for building and publishing plugins.

### Install CLI

```bash
# Already installed in monorepo
# For standalone: npm install -g @plexica/cli
```

### Commands

#### `plexica build`

Builds the plugin for production.

```bash
cd apps/plugin-myapp
plexica build
```

Output:

- `dist/remoteEntry.js` - Module Federation entry point
- `dist/assets/*` - Bundled JavaScript and CSS

Options:

- Validates `manifest.ts` exists
- Validates `package.json` structure
- Minifies code
- Generates source maps (dev mode)

#### `plexica publish`

Publishes the plugin to MinIO CDN.

```bash
cd apps/plugin-myapp
plexica publish
```

Requirements:

- Plugin must be built first (`dist/` directory must exist)
- MinIO server must be running
- API server must be running

Output:

```
✔ Published myapp@0.1.0

CDN URLs:
  • Remote Entry: http://localhost:9000/plexica-plugins/myapp/0.1.0/remoteEntry.js
  • Total files: 14

✓ Plugin published successfully!
```

#### `plexica init` (Coming Soon)

Scaffolds a new plugin from template.

---

## Manifest Configuration

The `manifest.ts` file defines plugin metadata, routes, and menu items.

### Complete Example

```typescript
export interface PluginManifest {
  id: string; // Unique identifier
  name: string; // Display name
  version: string; // Semantic version
  description: string; // Short description
  author: string; // Author name
  icon?: string; // Lucide icon name
  routes: PluginRoute[]; // Route definitions
  menuItems: PluginMenuItem[]; // Sidebar menu items
  permissions?: string[]; // Required permissions
}

export const manifest: PluginManifest = {
  id: 'crm',
  name: 'CRM',
  version: '0.1.0',
  description: 'Customer Relationship Management',
  author: 'Plexica Team',
  icon: 'Users',

  routes: [
    {
      path: '/plugins/crm',
      componentName: 'HomePage',
      title: 'CRM Dashboard',
      layout: 'default',
    },
    {
      path: '/plugins/crm/contacts',
      componentName: 'ContactsPage',
      title: 'Contacts',
      layout: 'default',
      permissions: ['plugin.crm.contacts.view'],
    },
  ],

  menuItems: [
    {
      id: 'crm-main',
      label: 'CRM',
      icon: 'Users',
      path: '/plugins/crm',
      order: 10,
    },
  ],

  permissions: ['plugin.crm.view', 'plugin.crm.contacts.view', 'plugin.crm.contacts.edit'],
};
```

### Route Configuration

```typescript
interface PluginRoute {
  path: string; // Route path (must start with /plugins/)
  componentName: string; // Component name exported from Plugin.tsx
  title: string; // Page title
  layout?: 'default' | 'fullscreen' | 'minimal';
  permissions?: string[]; // Required permissions
}
```

### Menu Configuration

```typescript
interface PluginMenuItem {
  id: string; // Unique menu item ID
  label: string; // Display label
  icon?: string; // Lucide icon name
  path?: string; // Navigation path
  children?: PluginMenuItem[]; // Submenu items
  permissions?: string[]; // Required permissions
  order?: number; // Sort order (lower = higher)
}
```

---

## Component Development

### Component Props

All plugin components receive these props:

```typescript
export interface PluginProps {
  tenantId: string; // Current tenant ID
  userId: string; // Current user ID
  workspaceId?: string; // Current workspace ID (optional)
}
```

### Example Component

```typescript
import React, { useState, useEffect } from 'react';

export interface PluginProps {
  tenantId: string;
  userId: string;
  workspaceId?: string;
}

const ContactsPage: React.FC<PluginProps> = ({ tenantId, userId }) => {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch data using tenant context
    fetchContacts(tenantId).then((data) => {
      setContacts(data);
      setLoading(false);
    });
  }, [tenantId]);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold">Contacts</h1>
      <div className="mt-6">
        {contacts.map((contact) => (
          <div key={contact.id} className="p-4 border rounded">
            {contact.name}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ContactsPage;
```

### Styling

Use **Tailwind CSS** classes. The host app provides the full Tailwind configuration.

```tsx
<div className="p-6 bg-white rounded-lg shadow">
  <h1 className="text-2xl font-bold text-gray-900">Title</h1>
  <p className="text-gray-600 mt-2">Description</p>
</div>
```

### Icons

Use **Lucide React** icons:

```tsx
import { Users, BarChart, Settings } from 'lucide-react';

<Users className="w-6 h-6 text-blue-600" />;
```

---

## Deployment

### Development Environment

1. Start infrastructure:

```bash
pnpm infra:start
```

2. Start API:

```bash
cd apps/core-api && pnpm dev
```

3. Seed database:

```bash
DATABASE_URL="..." npx tsx packages/database/scripts/seed-plugins.ts
DATABASE_URL="..." npx tsx packages/database/scripts/install-plugins-for-tenants.ts
```

4. Start web app:

```bash
cd apps/web && pnpm dev
```

### Production Deployment

1. Build plugin:

```bash
cd apps/plugin-myapp
plexica build
```

2. Publish to CDN:

```bash
plexica publish
```

3. Register plugin (via API or database):

```bash
curl -X POST http://api.plexica.io/api/plugins \
  -H "Content-Type: application/json" \
  -d '{"id": "myapp", "name": "My App", ...}'
```

4. Install for tenants:

```bash
curl -X POST http://api.plexica.io/api/tenants/{id}/plugins/myapp/install \
  -H "Content-Type: application/json" \
  -d '{"configuration": {}}'
```

---

## Testing

### Unit Tests

Test individual components:

```typescript
import { render, screen } from '@testing-library/react';
import HomePage from './HomePage';

test('renders homepage', () => {
  render(<HomePage tenantId="test" userId="user1" />);
  expect(screen.getByText('My App')).toBeInTheDocument();
});
```

### E2E Tests

See `apps/web/tests/e2e/plugin-loading.spec.ts` for examples.

### Manual Testing Checklist

- [ ] Plugin loads in sidebar
- [ ] Routes navigate correctly
- [ ] Components render without errors
- [ ] Data fetches with correct tenant context
- [ ] Icons display correctly
- [ ] Styling matches design system
- [ ] No console errors or warnings

---

## Best Practices

### Do's ✅

- **Use tenant context** - Always filter data by `tenantId`
- **Handle loading states** - Show spinners/skeletons while fetching
- **Handle errors gracefully** - Display user-friendly error messages
- **Use semantic versioning** - Increment version on changes
- **Keep plugins focused** - One main feature per plugin
- **Follow design system** - Use Tailwind classes from host
- **Test thoroughly** - Unit tests + E2E tests
- **Document your plugin** - Add README with usage instructions

### Don'ts ❌

- **Don't hardcode tenant IDs** - Always use props
- **Don't modify global state** - Keep plugin state isolated
- **Don't use inline styles** - Use Tailwind classes
- **Don't bundle shared dependencies** - They're provided by host
- **Don't skip error handling** - Always handle network failures
- **Don't use localStorage carelessly** - Namespace your keys
- **Don't forget permissions** - Check user permissions before rendering

### Performance

- **Lazy load components** - Use React.lazy() for heavy components
- **Minimize bundle size** - Remove unused dependencies
- **Cache API responses** - Use React Query or similar
- **Optimize images** - Use WebP format, compress assets
- **Code splitting** - Split by route when possible

### Security

- **Validate all inputs** - Never trust user input
- **Use HTTPS in production** - Secure CDN URLs
- **Check permissions** - Verify user can access features
- **Sanitize HTML** - Prevent XSS attacks
- **Audit dependencies** - Keep packages up to date

---

## Examples

### CRM Plugin

Location: `apps/plugin-crm/`

Features:

- Dashboard with key metrics
- Contacts table with search
- Deals kanban board with stages
- 3 routes, 1 menu item

### Analytics Plugin

Location: `apps/plugin-analytics/`

Features:

- Dashboard with charts and metrics
- Reports management
- Export functionality
- 2 routes, 1 menu item

### Plugin Template

Location: `apps/plugin-template-frontend/`

Use this as your starting point for new plugins.

---

## Troubleshooting

### Plugin doesn't load

1. Check browser console for errors
2. Verify `remoteEntry.js` is accessible on CDN
3. Check plugin is enabled in database
4. Verify manifest is valid JSON

### CORS errors

1. Ensure MinIO CORS is configured
2. Check API server CORS settings
3. Verify CDN URL uses correct protocol (http/https)

### Components not rendering

1. Check component is exported in `Plugin.tsx`
2. Verify `componentName` matches export name
3. Check for TypeScript errors
4. Verify route path is correct

### Build failures

1. Check `manifest.ts` syntax
2. Verify all imports resolve
3. Run `pnpm install` to update dependencies
4. Check vite.config.ts configuration

---

## Additional Resources

- [Module Federation Docs](https://module-federation.github.io/)
- [Vite Documentation](https://vitejs.dev/)
- [React Documentation](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Lucide Icons](https://lucide.dev/)

---

_Last updated: January 2026_
