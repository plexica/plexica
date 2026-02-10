# Plugin Quick Start

**Date**: February 10, 2026
**Status**: Active
**Target Audience**: Plugin developers new to Plexica
**Time to complete**: ~15 minutes

Get a Plexica plugin running from scratch. This guide covers the fastest path to a working frontend plugin with `@plexica/ui` components.

For in-depth topics see [Frontend Guide](./PLUGIN_FRONTEND_GUIDE.md), [Backend Guide](./PLUGIN_BACKEND_GUIDE.md), and [Plugin-to-Plugin Communication](./plugin-development.md).

---

## Prerequisites

- Node.js 20+
- pnpm 9+
- The Plexica monorepo cloned and dependencies installed (`pnpm install`)

---

## 1. Copy the Plugin Template

The `plexica init` CLI command is not yet implemented. Copy the template manually:

```bash
cp -r apps/plugin-template-frontend apps/plugin-myapp
cd apps/plugin-myapp
```

---

## 2. Update Package Identity

Edit `package.json`:

```json
{
  "name": "@plexica/plugin-myapp",
  "version": "0.1.0",
  "description": "My awesome plugin",
  "scripts": {
    "dev": "vite --port 3400",
    "build": "tsc -b && vite build"
  }
}
```

Pick a unique port (template uses 3100, CRM uses 3200, Analytics uses 3300).

---

## 3. Configure Module Federation

Edit `vite.config.ts` -- change two things:

```typescript
// File: apps/plugin-myapp/vite.config.ts

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'plugin_myapp', // 1. Unique federation name (underscores, no hyphens)
      filename: 'remoteEntry.js',
      exposes: {
        './Plugin': './src/Plugin.tsx',
        './routes': './src/routes/index.ts',
        './manifest': './src/manifest.ts',
      },
      shared: [
        'react',
        'react-dom',
        '@tanstack/react-router',
        '@tanstack/react-query',
        'axios',
        'zustand',
        '@plexica/ui',
        '@plexica/types',
      ],
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3400, // 2. Your unique port
    cors: true,
  },
  build: {
    target: 'esnext',
    minify: true,
    cssCodeSplit: false,
    lib: {
      entry: './src/Plugin.tsx',
      name: 'PluginMyApp',
      formats: ['es'],
    },
    rollupOptions: {
      output: {
        format: 'esm',
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
});
```

---

## 4. Write the Manifest

Edit `src/manifest.ts`:

```typescript
// File: apps/plugin-myapp/src/manifest.ts

import type { PluginManifest } from '@plexica/types';

export const manifest: PluginManifest = {
  id: 'myapp',
  name: 'My App',
  version: '0.1.0',
  description: 'A short description of what the plugin does',
  author: 'Your Name',
  icon: 'Rocket', // Lucide icon name
  routes: [
    {
      path: '/plugins/myapp',
      componentName: 'HomePage', // Must match a named export in Plugin.tsx
      title: 'My App',
      layout: 'default',
    },
    {
      path: '/plugins/myapp/settings',
      componentName: 'SettingsPage',
      title: 'Settings',
      layout: 'default',
      permissions: ['plugin.myapp.settings.view'],
    },
  ],
  menuItems: [
    {
      id: 'myapp-home',
      label: 'My App',
      icon: 'Rocket',
      path: '/plugins/myapp',
      order: 50, // Lower = higher in sidebar
    },
  ],
  permissions: ['plugin.myapp.view', 'plugin.myapp.settings.view', 'plugin.myapp.settings.edit'],
};

export default manifest;
```

---

## 5. Create a Page

Edit `src/pages/HomePage.tsx`:

```typescript
// File: apps/plugin-myapp/src/pages/HomePage.tsx

import React from 'react';
import type { PluginProps } from '@plexica/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Badge,
  Button,
} from '@plexica/ui';
import { Rocket } from 'lucide-react';

export const HomePage: React.FC<PluginProps> = ({ tenantId, userId, workspaceId }) => {
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My App</h1>
        <p className="text-sm text-muted-foreground">
          Welcome to your new plugin.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Plugin Context</CardTitle>
          <CardDescription>
            These values are injected by the host via Module Federation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <Badge variant="outline">Tenant: {tenantId}</Badge>
            <Badge variant="outline">User: {userId}</Badge>
            {workspaceId && <Badge variant="outline">Workspace: {workspaceId}</Badge>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Getting Started</CardTitle>
          <Rocket className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Replace this page with your plugin's main UI. Use components from
            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">@plexica/ui</code>
            so your plugin matches the host app's design system.
          </p>
          <Button className="mt-4" variant="outline" size="sm">
            Learn More
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
```

---

## 6. Wire Up Plugin.tsx

Edit `src/Plugin.tsx`:

```typescript
// File: apps/plugin-myapp/src/Plugin.tsx

import React from 'react';
import type { PluginProps } from '@plexica/types';
import { HomePage } from './pages/HomePage';
import { SettingsPage } from './pages/SettingsPage';

// Default export renders the main page
const Plugin: React.FC<PluginProps> = (props) => {
  return <HomePage {...props} />;
};

export default Plugin;

// Named exports -- componentName in manifest routes maps to these
export { HomePage, SettingsPage };
```

**Key rule**: every `componentName` in your manifest routes (e.g. `"HomePage"`) must have a matching named export in `Plugin.tsx`.

---

## 7. Update Routes

Edit `src/routes/index.ts`:

```typescript
// File: apps/plugin-myapp/src/routes/index.ts

import type { PluginRoute } from '@plexica/types';

export const routes: PluginRoute[] = [
  {
    path: '/plugins/myapp',
    componentName: 'HomePage',
    title: 'My App',
    layout: 'default',
  },
  {
    path: '/plugins/myapp/settings',
    componentName: 'SettingsPage',
    title: 'Settings',
    layout: 'default',
    permissions: ['plugin.myapp.settings.view'],
  },
];

export default routes;
```

---

## 8. Build

```bash
# From the plugin directory
pnpm build
```

Successful output produces `dist/remoteEntry.js` -- this is what the host loads at runtime via Module Federation.

---

## 9. Publish (Optional)

If MinIO and the core-api are running:

```bash
plexica publish
```

This uploads `dist/` to the CDN at `plexica-plugins/myapp/0.1.0/`.

---

## 10. Register in the Database

For the host app to load your plugin, it needs a database record:

```typescript
// Using Prisma directly or a seed script
await prisma.plugin.create({
  data: {
    id: 'myapp',
    name: 'My App',
    version: '0.1.0',
    description: 'My awesome plugin',
    author: 'Your Name',
    category: 'productivity',
    status: 'PUBLISHED',
    manifest: {
      /* your manifest object */
    },
  },
});

// Install for a tenant
await prisma.tenantPlugin.create({
  data: {
    tenantId: 'your-tenant-id',
    pluginId: 'myapp',
    status: 'ACTIVE',
    configuration: {},
  },
});
```

---

## What You Get

After these steps:

- `pnpm build` produces a Module Federation remote with `remoteEntry.js`
- The host app can load your plugin at runtime (no host rebuild needed)
- Your plugin uses `@plexica/ui` components shared from the host (no duplicate bundles)
- Routes and menu items register automatically from your manifest
- Your components receive `tenantId`, `userId`, and `workspaceId` as props

---

## Directory Structure

```
apps/plugin-myapp/
├── package.json              # Package identity and scripts
├── vite.config.ts            # Vite + Module Federation config
├── tsconfig.json             # TypeScript config
├── src/
│   ├── Plugin.tsx            # Entry point -- default + named exports
│   ├── manifest.ts           # Plugin metadata, routes, menu items
│   ├── routes/
│   │   └── index.ts          # Route definitions (mirrors manifest.routes)
│   └── pages/
│       ├── HomePage.tsx      # Your main page
│       └── SettingsPage.tsx  # Additional pages
└── dist/                     # Build output (gitignored)
    ├── remoteEntry.js        # Module Federation entry
    └── assets/               # Bundled JS/CSS
```

---

## Next Steps

| Topic                                                             | Guide                                                     |
| ----------------------------------------------------------------- | --------------------------------------------------------- |
| Using `@plexica/ui` components, route registration, theme context | [Frontend Guide](./PLUGIN_FRONTEND_GUIDE.md)              |
| Backend services, plugin-to-plugin communication, events          | [Backend Guide](./PLUGIN_BACKEND_GUIDE.md)                |
| Service registry, shared data, dependency management (M2.3)       | [Plugin-to-Plugin Communication](./plugin-development.md) |
| CLI commands (`build`, `publish`)                                 | [Plugin Development Overview](../PLUGIN_DEVELOPMENT.md)   |

---

_Plugin Quick Start v1.0_
_Created: February 10, 2026_
