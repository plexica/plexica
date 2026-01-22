# @plexica/cli

CLI tool for building and publishing Plexica plugins.

## Installation

```bash
# In the monorepo
pnpm add -D @plexica/cli

# Or install globally
pnpm add -g @plexica/cli
```

## Commands

### `plexica build`

Build a plugin for production.

```bash
plexica build [options]
```

**Options:**

- `-c, --config <path>` - Path to vite config file (default: `vite.config.ts`)
- `--no-minify` - Disable minification
- `--sourcemap` - Generate source maps

**Example:**

```bash
cd apps/my-plugin
plexica build
```

This command will:

1. Verify you're in a plugin directory
2. Validate the manifest exists
3. Clean the `dist` directory
4. Run TypeScript compiler
5. Run Vite build with Module Federation
6. Verify `remoteEntry.js` was created
7. Show build statistics

### `plexica publish`

Publish a plugin to the CDN.

```bash
plexica publish [options]
```

**Options:**

- `-a, --api-url <url>` - API server URL (default: `http://localhost:3000`)
- `-k, --api-key <key>` - API authentication key
- `-d, --dist <path>` - Distribution directory (default: `dist`)

**Environment Variables:**

- `PLEXICA_API_URL` - API server URL (overrides default)

**Example:**

```bash
# Local development
plexica publish

# Production
plexica publish --api-url https://api.plexica.io --api-key your-key
```

This command will:

1. Load and validate the manifest
2. Verify the `dist` directory exists
3. Collect all build files
4. Upload to MinIO CDN via the API
5. Display the CDN URLs

**Output:**

```
✔ Published plugin-template@0.1.0

CDN URLs:
  • Remote Entry: http://localhost:9000/plexica-plugins/plugin-template/0.1.0/remoteEntry.js
  • Total files: 14

✓ Plugin published successfully!
```

### `plexica init`

Create a new plugin from template (coming soon).

```bash
plexica init [name] [options]
```

**Options:**

- `-t, --template <type>` - Template type: `frontend`, `backend`, `fullstack` (default: `frontend`)

## Plugin Development Workflow

1. **Create a plugin** (currently manual, init command coming soon):

   ```bash
   cp -r apps/plugin-template-frontend apps/my-plugin
   cd apps/my-plugin
   ```

2. **Update the manifest**:
   Edit `src/manifest.ts` with your plugin details:

   ```typescript
   export const manifest: PluginManifest = {
     id: 'my-plugin',
     name: 'My Plugin',
     version: '0.1.0',
     description: 'My awesome plugin',
     author: 'Your Name',
     // ... routes, menus, etc.
   };
   ```

3. **Develop your plugin**:

   ```bash
   pnpm dev
   ```

4. **Build for production**:

   ```bash
   plexica build
   ```

5. **Publish to CDN**:
   ```bash
   plexica publish
   ```

## Manifest Validation

The CLI automatically validates your `manifest.ts` file with the following rules:

- **id**: Lowercase alphanumeric with hyphens (e.g., `my-plugin`)
- **name**: Human-readable name (required)
- **version**: Semver format (e.g., `0.1.0`, `1.2.3-beta`)
- **description**: Plugin description (required)
- **author**: Plugin author (required)
- **routes**: Array of route definitions
- **menuItems**: Array of menu item definitions
- **permissions**: Optional array of required permissions

## Troubleshooting

### "No package.json found"

Make sure you're in a plugin directory with a `package.json` file.

### "remoteEntry.js not found"

The Module Federation build failed. Check your `vite.config.ts` has the federation plugin configured:

```typescript
import federation from '@originjs/vite-plugin-federation';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'my_plugin',
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
      ],
    }),
  ],
  build: {
    target: 'esnext',
    minify: true,
    cssCodeSplit: false,
    lib: {
      entry: './src/Plugin.tsx',
      name: 'MyPlugin',
      formats: ['es'],
    },
  },
});
```

### "Upload failed"

Check that:

1. The API server is running (`PLEXICA_API_URL`)
2. You have network connectivity
3. The API key is valid (if using authentication)
4. MinIO CDN is properly configured

## Development

```bash
# Build the CLI
cd packages/cli
pnpm build

# Test locally
cd apps/plugin-template-frontend
node ../../packages/cli/dist/index.js build
node ../../packages/cli/dist/index.js publish
```

## License

MIT
