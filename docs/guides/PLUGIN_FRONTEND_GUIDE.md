# Plugin Frontend Guide

**Date**: February 10, 2026
**Status**: Active
**Target Audience**: Plugin developers building frontend UI
**Prerequisites**: Complete the [Quick Start](./PLUGIN_QUICK_START.md) first

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Component Export Pattern](#component-export-pattern)
- [Using @plexica/ui Components](#using-plexicaui-components)
- [Routes and Menu Items](#routes-and-menu-items)
- [Plugin Props and Context](#plugin-props-and-context)
- [UI Patterns](#ui-patterns)
- [Module Federation Details](#module-federation-details)
- [Styling and Theming](#styling-and-theming)
- [Troubleshooting](#troubleshooting)

---

## Architecture Overview

Plexica plugins are standalone React applications loaded at runtime by the host via **Module Federation** (Vite + `@originjs/vite-plugin-federation`).

```
Host App (apps/web)                    Plugin (apps/plugin-myapp)
 ┌──────────────────┐                   ┌──────────────────────┐
 │  PluginRegistry   │───fetch list────▶│                      │
 │  Service          │                   │  CDN / Dev Server    │
 │                   │                   │  remoteEntry.js      │
 │  PluginLoader     │───load module───▶│                      │
 │  Service          │                   │  ./Plugin            │
 │                   │                   │  ./routes            │
 │  PluginRoute      │                   │  ./manifest          │
 │  Manager          │                   │                      │
 │                   │                   │  Shared deps:        │
 │  PluginMenu       │                   │  react, @plexica/ui  │
 │  Manager          │                   │  @plexica/types      │
 └──────────────────┘                   └──────────────────────┘
```

**How it works**:

1. `PluginRegistryService` fetches the tenant's installed plugins from core-api
2. For each plugin, it constructs a `PluginLoaderManifest` with the `remoteEntry.js` URL
3. `PluginLoaderService` injects a `<script>` tag for `remoteEntry.js`
4. It calls `window[pluginId].init()` then `window[pluginId].get('./Plugin')` to get the module
5. `PluginRouteManager` registers routes -- each route's `componentName` resolves to a named export
6. `PluginMenuManager` registers menu items in the sidebar

**Key files in the host** (for reference, not for plugin developers to modify):

| File                                  | Purpose                                                |
| ------------------------------------- | ------------------------------------------------------ |
| `apps/web/src/lib/plugin-loader.ts`   | Loads `remoteEntry.js`, initializes MF container       |
| `apps/web/src/lib/plugin-registry.ts` | Fetches plugin list from backend, orchestrates loading |
| `apps/web/src/lib/plugin-routes.tsx`  | Registers/unregisters routes, lazy component creation  |
| `apps/web/src/lib/plugin-menu.tsx`    | Registers/unregisters sidebar menu items               |

---

## Component Export Pattern

This is the most important pattern to understand. The host loads `./Plugin` from your remote and expects:

1. A **default export** -- rendered when the plugin is loaded without a specific route
2. **Named exports** -- one per page, matched by `componentName` in your manifest routes

```typescript
// File: src/Plugin.tsx

import React from 'react';
import type { PluginProps } from '@plexica/types';
import { HomePage } from './pages/HomePage';
import { SettingsPage } from './pages/SettingsPage';

// Default export: renders the main page
const Plugin: React.FC<PluginProps> = (props) => {
  return <HomePage {...props} />;
};

export default Plugin;

// Named exports: host resolves these by componentName from manifest routes
export { HomePage, SettingsPage };
```

**The mapping**:

```
manifest.routes[0].componentName = "HomePage"     → Plugin.tsx: export { HomePage }
manifest.routes[1].componentName = "SettingsPage"  → Plugin.tsx: export { SettingsPage }
```

If a `componentName` doesn't match any named export, the route will fail to render.

---

## Using @plexica/ui Components

`@plexica/ui` is shared via Module Federation -- your plugin uses the host's copy (no duplicate bundles). It is listed as a `peerDependency` in your `package.json`.

### Available Components

These components are exported from `@plexica/ui` and available in plugins:

**Layout & Container**:

| Component                                                                         | Use For                          |
| --------------------------------------------------------------------------------- | -------------------------------- |
| `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` | Content containers, sections     |
| `Separator`                                                                       | Visual dividers between sections |
| `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`                                  | Tabbed content areas             |

**Data Display**:

| Component                                 | Use For                                |
| ----------------------------------------- | -------------------------------------- |
| `DataTable`                               | Sortable, filterable, paginated tables |
| `Badge`                                   | Status labels, tags, categories        |
| `Avatar`, `AvatarImage`, `AvatarFallback` | User profile images                    |
| `Progress`                                | Progress bars                          |
| `Spinner`                                 | Loading indicators                     |
| `EmptyState`                              | No-data placeholders                   |

**Form Controls**:

| Component                                                               | Use For                           |
| ----------------------------------------------------------------------- | --------------------------------- |
| `Button`                                                                | Actions, submissions              |
| `Input`                                                                 | Text fields                       |
| `Textarea`                                                              | Multi-line text                   |
| `Select`, `SelectTrigger`, `SelectContent`, `SelectItem`, `SelectValue` | Dropdowns                         |
| `Checkbox`                                                              | Boolean toggles (multiple choice) |
| `Switch`                                                                | Boolean toggles (on/off)          |
| `RadioGroup`                                                            | Single choice from options        |
| `Label`                                                                 | Form field labels                 |
| `Slider`                                                                | Range selection                   |

**Feedback & Overlay**:

| Component                                 | Use For                              |
| ----------------------------------------- | ------------------------------------ |
| `Alert`, `AlertTitle`, `AlertDescription` | Informational/warning/error messages |
| `Modal`                                   | Dialog overlays                      |
| `Toast`                                   | Temporary notifications              |
| `Tooltip`                                 | Hover context                        |
| `Dropdown`                                | Context menus, action menus          |

**Navigation**:

| Component     | Use For                          |
| ------------- | -------------------------------- |
| `Breadcrumbs` | Page hierarchy navigation        |
| `ToggleGroup` | View switchers (grid/list/table) |

**Types**:

| Export      | Use For                                                |
| ----------- | ------------------------------------------------------ |
| `ColumnDef` | DataTable column definition type (from TanStack Table) |

### Import Example

```typescript
import type { ColumnDef } from '@plexica/ui';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Button,
  DataTable,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Alert,
  AlertTitle,
  AlertDescription,
  Separator,
} from '@plexica/ui';
```

### Icons

Use [Lucide React](https://lucide.dev/) for icons. The host app includes it as a shared dependency.

```typescript
import { Users, BarChart3, Settings, Rocket, TrendingUp } from 'lucide-react';

// In JSX
<Users className="h-4 w-4 text-muted-foreground" />
```

---

## Routes and Menu Items

### Route Definition

Routes are declared in both `src/manifest.ts` and `src/routes/index.ts`. Keep them in sync.

```typescript
// File: packages/types/src/plugin.ts -- for reference

export interface PluginRoute {
  path: string; // URL path, must start with /plugins/
  componentName: string; // Named export from Plugin.tsx
  title: string; // Page title shown in browser tab
  layout?: 'default' | 'fullscreen' | 'minimal';
  permissions?: string[]; // Required permissions to access
}
```

**Path conventions**:

- All plugin routes must start with `/plugins/{your-plugin-id}`
- Use nested paths for sub-pages: `/plugins/myapp/settings`
- Route parameters are supported: `/plugins/myapp/items/:id`

**Layout modes**:

| Layout       | Description                                       |
| ------------ | ------------------------------------------------- |
| `default`    | Standard layout with sidebar and header           |
| `fullscreen` | No sidebar or header -- plugin fills the viewport |
| `minimal`    | Header only, no sidebar                           |

### Menu Item Definition

```typescript
// File: packages/types/src/plugin.ts -- for reference

export interface PluginMenuItem {
  id: string; // Unique ID (e.g. 'myapp-home')
  label: string; // Display text in sidebar
  icon?: string; // Lucide icon name (e.g. 'Rocket')
  path?: string; // Navigation target
  children?: PluginMenuItem[]; // Nested sub-menu items
  permissions?: string[]; // Required permissions to see this item
  order?: number; // Sort order (lower = higher in menu)
}
```

**Order conventions** (used by existing plugins):

| Range | Reserved For                                     |
| ----- | ------------------------------------------------ |
| 1-9   | Core platform items                              |
| 10-29 | High-priority plugins (CRM = 10, Analytics = 20) |
| 30-99 | Standard plugins                                 |
| 100+  | Low-priority items (template = 100)              |

### Sub-menus

```typescript
menuItems: [
  {
    id: 'crm-main',
    label: 'CRM',
    icon: 'Users',
    path: '/plugins/crm',
    order: 10,
    children: [
      {
        id: 'crm-contacts',
        label: 'Contacts',
        icon: 'Contact',
        path: '/plugins/crm/contacts',
      },
      {
        id: 'crm-deals',
        label: 'Deals',
        icon: 'Handshake',
        path: '/plugins/crm/deals',
      },
    ],
  },
],
```

---

## Plugin Props and Context

Every plugin component receives `PluginProps`:

```typescript
// File: packages/types/src/plugin.ts

export interface PluginProps {
  tenantId: string; // The tenant this user belongs to
  userId: string; // The authenticated user's ID
  workspaceId?: string; // Current workspace (if workspace-scoped)
}
```

These values are injected by the host. Use them for:

- **Data scoping**: filter all API calls by `tenantId` (and `workspaceId` when present)
- **User context**: show user-specific data or check permissions
- **Multi-tenant isolation**: never hardcode tenant or user IDs

```typescript
const MyPage: React.FC<PluginProps> = ({ tenantId, userId, workspaceId }) => {
  useEffect(() => {
    // Always scope API calls to the current tenant
    fetch(`/api/plugins/myapp/data?tenantId=${tenantId}`)
      .then(res => res.json())
      .then(setData);
  }, [tenantId]);

  return <div>...</div>;
};
```

### Theme Context (Future -- Phase B8)

`PluginUIProps` (extending `PluginProps` with theme context) is planned but not yet implemented. Currently, plugins inherit theme via CSS custom properties (see [Styling and Theming](#styling-and-theming)).

---

## UI Patterns

### Dashboard Page

A typical plugin dashboard with stat cards and a data table:

```typescript
// File: src/pages/HomePage.tsx

import React from 'react';
import type { PluginProps } from '@plexica/types';
import type { ColumnDef } from '@plexica/ui';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
  Badge, Button, DataTable,
} from '@plexica/ui';
import { Package, TrendingUp, Users } from 'lucide-react';

// Stat card data
const STATS = [
  { title: 'Total Items', value: '1,284', icon: <Package className="h-4 w-4 text-muted-foreground" /> },
  { title: 'Active Users', value: '342', icon: <Users className="h-4 w-4 text-muted-foreground" /> },
  { title: 'Growth', value: '+12%', icon: <TrendingUp className="h-4 w-4 text-muted-foreground" /> },
];

// Table columns
const columns: ColumnDef<any, unknown>[] = [
  { accessorKey: 'name', header: 'Name' },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <Badge variant={row.getValue('status') === 'active' ? 'success' : 'secondary'}>
        {row.getValue('status')}
      </Badge>
    ),
  },
  { accessorKey: 'date', header: 'Date' },
];

export const HomePage: React.FC<PluginProps> = ({ tenantId }) => {
  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of your plugin data.</p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {STATS.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              {stat.icon}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Data table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Items</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={[/* your data */]}
            enableSorting
            enableGlobalFilter
            enablePagination
            pageSize={10}
          />
        </CardContent>
      </Card>
    </div>
  );
};
```

### Settings / Form Page

A settings page with inputs, selects, switches, and save feedback:

```typescript
// File: src/pages/SettingsPage.tsx

import React, { useState } from 'react';
import type { PluginProps } from '@plexica/types';
import {
  Alert, AlertDescription, AlertTitle,
  Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle,
  Input, Label,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Separator, Switch,
} from '@plexica/ui';
import { CheckCircle2, Save } from 'lucide-react';

export const SettingsPage: React.FC<PluginProps> = ({ tenantId }) => {
  const [saved, setSaved] = useState(false);
  const [name, setName] = useState('My Plugin');
  const [interval, setInterval] = useState('30');
  const [notifications, setNotifications] = useState(true);

  const handleSave = () => {
    // Call your API here
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      {saved && (
        <Alert variant="success">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>Settings updated successfully.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Basic configuration.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="interval">Refresh Interval</Label>
            <Select value={interval} onValueChange={setInterval}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 seconds</SelectItem>
                <SelectItem value="30">30 seconds</SelectItem>
                <SelectItem value="60">1 minute</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Features</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="notif">Notifications</Label>
              <p className="text-xs text-muted-foreground">Receive alerts on events.</p>
            </div>
            <Switch id="notif" checked={notifications} onCheckedChange={setNotifications} />
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={handleSave}>
            <Save className="mr-2 h-4 w-4" />
            Save
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};
```

### List Page with Search

A filterable list page pattern:

```typescript
import React, { useState, useMemo } from 'react';
import type { PluginProps } from '@plexica/types';
import type { ColumnDef } from '@plexica/ui';
import {
  Card, CardContent, CardHeader, CardTitle,
  Badge, Button, DataTable, Input,
} from '@plexica/ui';
import { Plus, Search } from 'lucide-react';

interface Item {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

const columns: ColumnDef<Item, unknown>[] = [
  { accessorKey: 'name', header: 'Name' },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <Badge variant={row.getValue('status') === 'active' ? 'success' : 'secondary'}>
        {row.getValue('status')}
      </Badge>
    ),
  },
  { accessorKey: 'createdAt', header: 'Created' },
];

export const ListPage: React.FC<PluginProps> = () => {
  const [items] = useState<Item[]>([/* fetch from API */]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Items</h1>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Item
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={items}
            enableSorting
            enableGlobalFilter
            enablePagination
            pageSize={10}
          />
        </CardContent>
      </Card>
    </div>
  );
};
```

---

## Module Federation Details

### What Is Shared

These dependencies are loaded once by the host and shared with all plugins. Do NOT bundle your own copies.

| Dependency               | Purpose                                  |
| ------------------------ | ---------------------------------------- |
| `react`                  | React core                               |
| `react-dom`              | React DOM renderer                       |
| `@tanstack/react-router` | Routing (host manages top-level routing) |
| `@tanstack/react-query`  | Data fetching and caching                |
| `axios`                  | HTTP client                              |
| `zustand`                | State management                         |
| `@plexica/ui`            | Shared component library                 |
| `@plexica/types`         | Shared TypeScript types                  |

These are declared in the `shared` array of your `vite.config.ts`. The host provides them; your plugin consumes them without bundling.

### What Your Plugin Exposes

Every plugin must expose exactly three modules:

| Module       | Path                    | Content                                                 |
| ------------ | ----------------------- | ------------------------------------------------------- |
| `./Plugin`   | `./src/Plugin.tsx`      | Default export (main component) + named exports (pages) |
| `./routes`   | `./src/routes/index.ts` | `PluginRoute[]` array                                   |
| `./manifest` | `./src/manifest.ts`     | `PluginManifest` object                                 |

These are configured in `vite.config.ts`:

```typescript
federation({
  name: 'plugin_myapp',
  filename: 'remoteEntry.js',
  exposes: {
    './Plugin': './src/Plugin.tsx',
    './routes': './src/routes/index.ts',
    './manifest': './src/manifest.ts',
  },
  // ...
});
```

### Build Output

After `pnpm build`, the `dist/` directory contains:

```
dist/
├── remoteEntry.js              # Module Federation entry (host loads this)
├── assets/
│   ├── Plugin-[hash].js        # Your plugin code
│   ├── __federation_shared_*.js # Shared dep references
│   └── *.css                   # Styles (if any)
```

The host loads `remoteEntry.js` first, which tells Module Federation where to find your code and which shared dependencies to use from the host.

---

## Styling and Theming

### CSS Custom Properties

The host app defines design tokens as CSS custom properties in `packages/ui/src/styles/globals.css`. These are inherited by plugin components since plugins render in the same DOM (no iframe or shadow DOM).

Available token categories:

- Colors: `--background`, `--foreground`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`
- Radius: `--radius`
- Typography: inherited from the host's font stack

### Using Tailwind Utility Classes

`@plexica/ui` components use Tailwind internally. You can use Tailwind utility classes in your plugin markup:

```tsx
<div className="p-6 space-y-4">
  <h1 className="text-2xl font-bold tracking-tight">Title</h1>
  <p className="text-sm text-muted-foreground">Description</p>
</div>
```

**Recommended classes** (these use CSS custom properties and work in both light and dark mode):

| Class                   | Purpose                             |
| ----------------------- | ----------------------------------- |
| `text-foreground`       | Primary text color                  |
| `text-muted-foreground` | Secondary/dimmed text               |
| `bg-background`         | Page background                     |
| `bg-muted`              | Muted background (e.g. code blocks) |
| `bg-card`               | Card background                     |
| `border`                | Default border color                |

### Dark Mode

The host toggles dark mode by adding a `dark` class to `<html>`. CSS custom properties automatically switch values. If you use `@plexica/ui` components and the semantic Tailwind classes above, dark mode works automatically.

**Do not** hardcode colors like `text-gray-900` or `bg-white` -- these break in dark mode. Use semantic classes instead.

### Theme Propagation (Current Status)

CSS custom properties from `globals.css` are accessible to plugins because plugins render in the same DOM as the host. Full theme context (light/dark toggle, tenant-specific themes) via a React context (`PluginUIProps`) is planned for Phase B8.

---

## Troubleshooting

### Plugin doesn't load

1. Check the browser console for errors
2. Verify `remoteEntry.js` is accessible (try the URL directly in the browser)
3. Verify the plugin is registered in the database and installed for the tenant
4. Check that the `name` in `vite.config.ts` `federation()` matches the expected ID

### Components not rendering

1. Verify `componentName` in manifest routes matches a named export in `Plugin.tsx`
2. Check for TypeScript compilation errors (`tsc --noEmit`)
3. Ensure all components receive and forward `PluginProps`

### "Cannot find module '@plexica/ui'" during development

This is a known `moduleResolution` mismatch in the pre-existing vite configs. It does not affect builds. The LSP error appears because `tsconfig.json` uses `"moduleResolution": "bundler"` but `@vitejs/plugin-react` types need `node16`/`nodenext`. Builds succeed regardless.

### Bundle includes @plexica/ui code

If your build output contains `@plexica/ui` code (check bundle size), verify:

1. `@plexica/ui` is in the `shared` array in `vite.config.ts`
2. `@plexica/ui` is listed as a `peerDependency` (not `dependency`) in `package.json`

### Styles look wrong

1. Verify you're using `@plexica/ui` components, not raw HTML
2. Use semantic Tailwind classes (`text-foreground`, `bg-background`) not hardcoded colors
3. Check that CSS custom properties from the host's `globals.css` are accessible in your component's DOM context

---

## Theme Integration

Plugins automatically inherit the host app's theme. No extra configuration is needed.

### How it works

1. The host app (`apps/web`) imports `globals.css` from `@plexica/ui`, which defines 30+ CSS custom properties on `:root` (light mode) and `.dark` (dark mode)
2. The host's `ThemeProvider` toggles the `.dark` class on `<html>` based on user preference (stored in `localStorage`)
3. Plugins load via Module Federation into the **same DOM tree** (no iframe, no shadow DOM) — they share the host's `document`
4. `@plexica/ui` components (shared via Module Federation) use Tailwind classes like `bg-background`, `text-foreground`, `border-border` — which resolve to the host's CSS custom properties

### What you get for free

- **Light/dark mode**: When the user toggles theme, your plugin updates instantly
- **System preference**: The host detects `prefers-color-scheme` and applies it automatically
- **Design token consistency**: Your plugin uses the same color palette, typography, and spacing as the host

### Do's and don'ts

```tsx
// File: my-plugin/src/pages/ExamplePage.tsx

// DO: Use semantic Tailwind classes (resolve to CSS custom properties)
<div className="bg-background text-foreground border-border">
<Card className="bg-card text-card-foreground">
<Button variant="destructive">  {/* uses --destructive */}

// DON'T: Hardcode colors (breaks in dark mode or custom tenant themes)
<div className="bg-white text-black border-gray-200">
<div style={{ backgroundColor: '#ffffff' }}>
```

### Available CSS custom properties

These properties are defined by the host and available to all plugins:

| Token                      | Light mode            | Dark mode               | Usage                    |
| -------------------------- | --------------------- | ----------------------- | ------------------------ |
| `--background`             | `oklch(1 0 0)`        | `oklch(0.145 0 0)`      | Page background          |
| `--foreground`             | `oklch(0.145 0 0)`    | `oklch(0.985 0 0)`      | Primary text             |
| `--card`                   | `oklch(1 0 0)`        | `oklch(0.205 0 0)`      | Card surfaces            |
| `--card-foreground`        | `oklch(0.145 0 0)`    | `oklch(0.985 0 0)`      | Card text                |
| `--primary`                | `oklch(0.205 0 0)`    | `oklch(0.87 0 0)`       | Primary actions/buttons  |
| `--primary-foreground`     | `oklch(0.985 0 0)`    | `oklch(0.205 0 0)`      | Text on primary          |
| `--secondary`              | `oklch(0.97 0 0)`     | `oklch(0.269 0 0)`      | Secondary surfaces       |
| `--muted`                  | `oklch(0.97 0 0)`     | `oklch(0.269 0 0)`      | Muted backgrounds        |
| `--muted-foreground`       | `oklch(0.556 0 0)`    | `oklch(0.708 0 0)`      | Subtle text              |
| `--accent`                 | `oklch(0.97 0 0)`     | `oklch(0.371 0 0)`      | Hover states, highlights |
| `--destructive`            | `oklch(0.58 0.22 27)` | `oklch(0.704 0.191 22)` | Danger actions           |
| `--border`                 | `oklch(0.922 0 0)`    | `oklch(1 0 0 / 10%)`    | Borders                  |
| `--input`                  | `oklch(0.922 0 0)`    | `oklch(1 0 0 / 15%)`    | Input borders            |
| `--ring`                   | `oklch(0.708 0 0)`    | `oklch(0.556 0 0)`      | Focus rings              |
| `--chart-1` to `--chart-5` | Varied                | Varied                  | Chart colors             |

The full definition is in `packages/ui/src/styles/globals.css`.

### Tenant theme overrides (future)

The `Tenant` model includes a `theme` JSON field (`packages/database/prisma/schema.prisma`). When tenant-specific theming is implemented, the host will override CSS custom properties based on the tenant's stored theme configuration. Since plugins use the same CSS custom properties, they will pick up tenant branding automatically — no plugin code changes needed.

---

## Reference: Example Plugins

| Plugin          | Location                         | Features                                                                                 |
| --------------- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| Plugin Template | `apps/plugin-template-frontend/` | Dashboard + Settings using `@plexica/ui`                                                 |
| CRM             | `apps/plugin-crm/`               | Contacts table, Deals pipeline, Dashboard — all using `@plexica/ui` components           |
| Analytics       | `apps/plugin-analytics/`         | Dashboard with StatCards, Reports table with export — all using `@plexica/ui` components |

The plugin template is the recommended starting point. The CRM and Analytics plugins demonstrate more complex patterns using `@plexica/ui` components — see the [Plugin UI Patterns](./PLUGIN_UI_PATTERNS.md) guide for copy-pasteable page layouts extracted from these plugins.

---

## Related Guides

| Topic                                 | Guide                                                     |
| ------------------------------------- | --------------------------------------------------------- |
| 0-to-running quick start              | [Quick Start](./PLUGIN_QUICK_START.md)                    |
| Copy-pasteable page patterns          | [Plugin UI Patterns](./PLUGIN_UI_PATTERNS.md)             |
| Backend services, APIs, events        | [Backend Guide](./PLUGIN_BACKEND_GUIDE.md)                |
| Plugin-to-plugin communication (M2.3) | [Plugin-to-Plugin Communication](./plugin-development.md) |
| UI component library reference        | [UI Components Guide](./UI_COMPONENTS_SHADCN_GUIDE.md)    |
| Plugin development overview           | [Plugin Development](../PLUGIN_DEVELOPMENT.md)            |

---

_Plugin Frontend Guide v1.0_
_Created: February 10, 2026_
