// index.ts — CLI project generator for Plexica plugins.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

interface Options {
  force: boolean;
  name: string | null;
}

const SLUG_REGEX = /^[a-z][a-z0-9-]{1,62}$/;

const TEMPLATES: Record<string, string> = {
  'manifest.json': `{
  "slug": "{{slug}}",
  "name": "{{name}}",
  "version": "1.0.0",
  "description": "A Plexica plugin",
  "author": "",
  "categories": [],
  "hosting": {
    "type": "sidecar",
    "image": "{{slug}}:latest",
    "port": 3000
  },
  "ui": {
    "remoteEntry": "remoteEntry.js",
    "extensionPoints": ["sidebar:admin"]
  },
  "events": {
    "subscribes": ["plexica.workspace.*"]
  },
  "declaredTables": []
}
`,
  'vite.config.ts': `import { defineConfig } from 'vite';
import plexicaPlugin from '@plexica/vite-plugin';

export default defineConfig({
  plugins: [plexicaPlugin()],
  server: { port: 4001 },
  build: { target: 'es2022' },
});
`,
  'package.json': `{
  "name": "{{slug}}",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx dev-entry.ts",
    "dev:backend": "tsx watch src/index.ts",
    "dev:ui": "vite dev --port 4001",
    "build": "vite build && tsc",
    "migration:apply": "tsx node_modules/@plexica/sdk/dev/migration.ts"
  },
  "dependencies": {
    "@plexica/sdk": "*",
    "@plexica/vite-plugin": "*",
    "fastify": "^5.0.0"
  },
  "devDependencies": {
    "typescript": "^5.9.0",
    "vite": "^6.0.0",
    "tsx": "^4.0.0"
  }
}
`,
  'tsconfig.json': `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "react-jsx",
    "outDir": "dist"
  },
  "include": ["src"]
}
`,
  'Dockerfile': `FROM node:24-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/index.js"]
`,
  'src/index.ts': `import Fastify from 'fastify';

const server = Fastify({ logger: true });

server.get('/_plexica/health', async () => ({ status: 'healthy', version: '1.0.0' }));
server.get('/_plexica/ready', async () => ({ status: 'ready' }));

server.listen({ port: 3000, host: '0.0.0.0' });
`,
  'src/app.ts': `// Plugin application routes — add your CRUD endpoints here.

import type { FastifyInstance } from 'fastify';

export async function pluginRoutes(app: FastifyInstance): Promise<void> {
  app.get('/hello', async () => ({ message: 'Hello from plugin!' }));
}
`,
  'src/health.ts': `// Health check endpoints required by the OpenAPI contract.

import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/_plexica/health', async () => ({ status: 'healthy', version: '1.0.0' }));
  app.get('/_plexica/ready', async () => ({ status: 'ready' }));
  app.post('/_plexica/event', async (request) => {
    // Process event from core
    return { received: true };
  });
}
`,
  'ui/index.ts': `// Plugin UI remote entry — exposes components to the shell.

export { default as PluginComponent } from './PluginComponent';
`,
  'ui/PluginComponent.tsx': `import React from 'react';

export default function PluginComponent(): JSX.Element {
  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold">{{name}}</h2>
      <p className="text-neutral-600">Plugin is active.</p>
    </div>
  );
}
`,
  'migrations/001_create_tables.sql': `-- Plugin migrations — add your tables here
-- CREATE TABLE IF NOT EXISTS {{slug}}_items (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   name TEXT NOT NULL,
--   created_at TIMESTAMPTZ DEFAULT now()
-- );
`,
  'dev-entry.ts': `// Plugin dev mode orchestrator (Plan §10.7)
// Starts Vite dev server + backend + registers with core API.

import { registerBackend } from '@plexica/sdk/dev';

const CORE_API_URL = process.env['CORE_API_URL'] ?? 'http://localhost:3001';

async function main() {
  console.log('Starting plugin dev mode...');

  // Register with core API
  const res = await registerBackend(CORE_API_URL, {
    slug: '{{slug}}',
    backendUrl: 'http://localhost:4002',
    uiUrl: 'http://localhost:4001/remoteEntry.js',
    extensionPoints: ['sidebar:admin'],
  });

  if (res.ok) {
    console.log('Plugin registered with core API');
  } else {
    console.warn('Failed to register with core API — make sure the platform is running');
  }

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Unregistering plugin...');
    await fetch(\`\${CORE_API_URL}/api/v1/dev/plugins/unregister\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: '{{slug}}' }),
    });
    process.exit(0);
  });
}

main().catch(console.error);
`,
  'dev-register.ts': `// Dev registration HTTP client.
// Used by dev-entry.ts to register with the core API.

export async function registerDevPlugin(
  coreApiUrl: string,
  slug: string,
  backendUrl: string
): Promise<Response> {
  return fetch(\`\${coreApiUrl}/api/v1/dev/plugins/register\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, backendUrl }),
  });
}

export async function unregisterDevPlugin(
  coreApiUrl: string,
  slug: string
): Promise<Response> {
  return fetch(\`\${coreApiUrl}/api/v1/dev/plugins/unregister\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug }),
  });
}
`,
  '.env.development': `CORE_API_URL=http://localhost:3001
KAFKA_BROKERS=localhost:9092
DATABASE_URL=postgresql://localhost:5432/plexica?schema=tenant_dev
`,
};

function render(template: string, slug: string, name: string): string {
  return template.replace(/\{\{slug\}\}/g, slug).replace(/\{\{name\}\}/g, name);
}

export async function run(options: Options): Promise<void> {
  const name = options.name ?? 'my-plugin';
  const slug = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').substring(0, 62);

  if (!SLUG_REGEX.test(slug)) {
    throw new Error(
      `Invalid plugin name "${name}". Use lowercase letters, numbers, and hyphens. ` +
        'Example: create-plexica-plugin my-crm-plugin'
    );
  }

  const targetDir = resolve(process.cwd(), slug);

  if (existsSync(targetDir) && !options.force) {
    throw new Error(
      `Directory "${slug}" already exists. Use --force to overwrite.`
    );
  }

  console.log(`Creating plugin "${name}" (slug: ${slug}) in ${targetDir}...`);

  // Create files
  for (const [filePath, content] of Object.entries(TEMPLATES)) {
    const fullPath = join(targetDir, filePath);
    const dir = filePath.includes('/') ? join(targetDir, filePath.split('/').slice(0, -1).join('/')) : targetDir;

    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, render(content, slug, name));
  }

  console.log(`\n✅ Plugin "${name}" created successfully!\n`);
  console.log('Next steps:');
  console.log(`  cd ${slug}`);
  console.log('  pnpm install');
  console.log('  pnpm dev        # Start dev mode (UI + backend + registration)');
  console.log('  pnpm build      # Build for production');
  console.log('\nOpenAPI contract: packages/sdk/openapi.yaml');
}
