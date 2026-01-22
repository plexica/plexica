# Plexica Frontend Plugin Template

This is a template for creating Plexica frontend plugins using Module Federation.

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
│   ├── pages/            # Page components
│   ├── components/       # Reusable components
│   └── ...
└── dist/                 # Build output
```

## Module Federation

This plugin uses Vite Module Federation to enable dynamic loading.

### Exposed Modules

- `./Plugin` - Main plugin component
- `./routes` - Route definitions
- `./manifest` - Plugin metadata

### Shared Dependencies

The following are shared with the host app:

- react
- react-dom
- @tanstack/react-router
- @tanstack/react-query
- axios
- zustand

## Plugin Manifest

The `manifest.ts` file defines your plugin's metadata:

```typescript
export const manifest: PluginManifest = {
  id: 'my-plugin',
  name: 'My Plugin',
  version: '1.0.0',
  description: 'Description of what the plugin does',
  author: 'Your Name',
  icon: 'Package',
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
export const routes: PluginRoute[] = [
  {
    path: '/plugins/my-plugin',
    componentName: 'HomePage',
    title: 'Home',
    layout: 'default',
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
    icon: 'Package',
    path: '/plugins/my-plugin',
    order: 100,
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

1. **Keep bundle size small** - Use code splitting and lazy loading
2. **Use shared dependencies** - Avoid duplicating React, etc.
3. **Follow naming conventions** - Use `plugin.{id}.{permission}` format
4. **Test thoroughly** - Ensure your plugin works standalone and integrated
5. **Document well** - Provide clear documentation for users

## Support

For issues and questions, see the [Plexica Plugin Documentation](https://docs.plexica.com/plugins).

---

**Template Version**: 0.1.0  
**Last Updated**: January 2026
