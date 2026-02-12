# Plexica Frontend Plugin Template

This is a template for creating Plexica frontend plugins using Module Federation.
Plugins built with this template use `@plexica/ui` shared components so they
look and feel identical to the host application.

## Getting Started

### 1. Clone the Template

```bash
cp -r apps/plugin-template-frontend apps/plugins/my-plugin-frontend
cd apps/plugins/my-plugin-frontend
```

### 2. Update Plugin Metadata

Edit `src/manifest.ts` to customize:

- Plugin ID (must be unique)
- Plugin name and description
- Routes and menu items
- Required permissions

### 3. Development

```bash
# Install dependencies (from root)
pnpm install

# Start development server
pnpm dev
```

The plugin will be available at `http://localhost:3100/remoteEntry.js`

### 4. Build for Production

```bash
pnpm build
```

The built files will be in the `dist/` directory.

## Project Structure

```
plugin-template-frontend/
├── package.json          # Dependencies and scripts
├── vite.config.ts        # Module Federation configuration
├── tsconfig.json         # TypeScript configuration
├── src/
│   ├── Plugin.tsx        # Main plugin component (entry point)
│   ├── manifest.ts       # Plugin metadata
│   ├── routes/
│   │   └── index.ts      # Route definitions
│   ├── pages/
│   │   ├── HomePage.tsx  # Example dashboard page (Card, Badge, DataTable)
│   │   └── SettingsPage.tsx  # Example settings page (Input, Select, Switch)
│   ├── components/       # Your reusable components
│   └── ...
└── dist/                 # Build output
```

## Using `@plexica/ui` Components

Plugins share `@plexica/ui` with the host via Module Federation. This means:

- Components resolve from the host at runtime (not bundled in your plugin)
- Theme tokens (light/dark mode) automatically apply to your components
- Your plugin looks visually consistent with the host app

### Available Components

Import any component directly from `@plexica/ui`:

```typescript
import {
  // Layout & containers
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardSkeleton,

  // Actions
  Button, // variants: default, primary, secondary, destructive, outline, ghost, link
  // sizes: sm, md, lg, icon

  // Data display
  Badge, // variants: default, secondary, success, warning, danger, outline
  DataTable, // sortable, filterable, paginated table (TanStack Table)
  EmptyState, // placeholder for empty views

  // Forms
  Input, // text input with error/helper support
  Label, // form label
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
  Textarea,
  Checkbox,
  Switch, // toggle switch
  RadioGroup,
  Slider,

  // Feedback
  Alert,
  AlertTitle,
  AlertDescription, // variants: default, info, success, warning, destructive
  Spinner,
  PageSpinner,
  Progress,
  Modal,
  Toast,
  ToastProvider,
  ToastViewport,

  // Navigation
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Breadcrumbs,
  Dropdown,

  // Layout
  Separator,
  Tooltip,

  // Utilities
  cn, // className merge utility (clsx + tailwind-merge)
} from '@plexica/ui';
```

### Example: Dashboard Card with Stats

```tsx
import { Card, CardHeader, CardTitle, CardContent } from '@plexica/ui';
import { Users } from 'lucide-react';

function StatCard() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Active Users</CardTitle>
        <Users className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">342</div>
        <p className="text-xs text-muted-foreground">+3% from last week</p>
      </CardContent>
    </Card>
  );
}
```

### Example: Data Table with Status Badges

```tsx
import { DataTable, Badge } from '@plexica/ui';
import type { ColumnDef } from '@plexica/ui';

interface Item {
  name: string;
  status: 'active' | 'pending';
}

const columns: ColumnDef<Item, unknown>[] = [
  { accessorKey: 'name', header: 'Name' },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <Badge variant={row.getValue('status') === 'active' ? 'success' : 'warning'}>
        {row.getValue('status')}
      </Badge>
    ),
  },
];

function ItemList({ data }: { data: Item[] }) {
  return (
    <DataTable columns={columns} data={data} enableSorting enableGlobalFilter enablePagination />
  );
}
```

### Example: Settings Form

```tsx
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
  Switch,
  Button,
  Separator,
} from '@plexica/ui';

function SettingsForm() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" placeholder="Enter name" />
        </div>
        <div className="space-y-2">
          <Label>Interval</Label>
          <Select defaultValue="30">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 seconds</SelectItem>
              <SelectItem value="30">30 seconds</SelectItem>
              <SelectItem value="60">1 minute</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <Label>Notifications</Label>
          <Switch />
        </div>
      </CardContent>
      <CardFooter className="justify-end">
        <Button>Save</Button>
      </CardFooter>
    </Card>
  );
}
```

## Shared Types

Import shared types from `@plexica/types`:

```typescript
import type { PluginProps, PluginManifest, PluginRoute, PluginMenuItem } from '@plexica/types';
```

- `PluginProps` — `{ tenantId, userId, workspaceId? }` injected by the host
- `PluginManifest` — manifest shape for `src/manifest.ts`
- `PluginRoute` — route definition shape
- `PluginMenuItem` — menu item shape

## Module Federation

This plugin uses Vite Module Federation to enable dynamic loading.

### Exposed Modules

- `./Plugin` - Main plugin component (default export + named page exports)
- `./routes` - Route definitions
- `./manifest` - Plugin metadata

### Shared Dependencies

The following are shared with the host app (not bundled in your plugin):

- `react`, `react-dom`
- `@tanstack/react-router`, `@tanstack/react-query`
- `axios`, `zustand`
- `@plexica/ui` — design system components
- `@plexica/types` — shared TypeScript types

## Plugin Manifest

The `manifest.ts` file defines your plugin's metadata:

```typescript
import type { PluginManifest } from '@plexica/types';

export const manifest: PluginManifest = {
  id: 'my-plugin',
  name: 'My Plugin',
  version: '1.0.0',
  description: 'Description of what the plugin does',
  author: 'Your Name',
  icon: 'Package', // Lucide icon name
  routes: [
    // Define your routes
  ],
  menuItems: [
    // Define menu items
  ],
  permissions: [
    // Define required permissions
  ],
};
```

## Routes

Define routes in `src/routes/index.ts`:

```typescript
import type { PluginRoute } from '@plexica/types';

export const routes: PluginRoute[] = [
  {
    path: '/plugins/my-plugin',
    componentName: 'HomePage', // Must match a named export from Plugin.tsx
    title: 'Home',
    layout: 'default', // 'default' | 'fullscreen' | 'minimal'
  },
];
```

## Menu Items

Menu items are defined in the manifest:

```typescript
menuItems: [
  {
    id: 'my-plugin-home',
    label: 'My Plugin',
    icon: 'Package', // Lucide icon name
    path: '/plugins/my-plugin',
    order: 100, // Lower = higher in sidebar
  },
];
```

## Permissions

Define custom permissions in the manifest:

```typescript
permissions: ['plugin.my-plugin.view', 'plugin.my-plugin.admin'];
```

Then use them in routes:

```typescript
{
  path: '/plugins/my-plugin/admin',
  componentName: 'AdminPage',
  title: 'Admin',
  permissions: ['plugin.my-plugin.admin'],
}
```

## Publishing

Use the `plexica-cli` to publish your plugin:

```bash
# Build the plugin
pnpm build

# Publish to registry
plexica plugin publish
```

## Best Practices

1. **Use `@plexica/ui` components** — Never write raw `<button>`, `<input>`, `<table>`. Always use the shared components so your plugin matches the host visually.
2. **Keep bundle size small** — Components from `@plexica/ui` are shared via Module Federation, so they don't add to your bundle size.
3. **Use `@plexica/types`** — Import `PluginProps`, `PluginManifest`, etc. from the shared types package for type safety.
4. **Respect theme tokens** — Use CSS custom properties (e.g., `text-muted-foreground`, `bg-background-primary`) instead of hardcoded colors. This ensures light/dark mode works.
5. **Follow naming conventions** — Use `plugin.{id}.{permission}` format for permissions.
6. **Export page components** — Each `componentName` in your routes must match a named export from `Plugin.tsx`.
7. **Test thoroughly** — Ensure your plugin works standalone and integrated.

## Support

For issues and questions, see the [Plexica Plugin Documentation](https://docs.plexica.com/plugins).

---

**Template Version**: 0.2.0  
**Last Updated**: February 2026
