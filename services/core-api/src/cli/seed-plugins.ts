// seed-plugins.ts
// CLI entrypoint: seeds the example plugin catalog (CRM) into core.plugins as
// published, so the marketplace renders cards and the install/E2E flow has real
// data. Idempotent — re-runs upsert the plugin and refresh the manifest/version.
//
// Usage: pnpm --filter core-api tsx src/cli/seed-plugins.ts

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { prisma, disconnectDatabase } from '../lib/database.js';
import { manifestSchema } from '../modules/plugin/schema/manifest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Monorepo root: services/core-api/src/cli -> ../../../../
const MONOREPO_ROOT = path.resolve(__dirname, '../../../../');

interface SeedPlugin {
  manifestPath: string;
  registryUrl: string;
}

// Example plugins shipped in the repo. The CRM plugin is required by Spec 004
// AC-04 / AC-07 (CRM workflow + database isolation E2E). Additional plugins give
// the marketplace enough cards for search/filter assertions (AC-05).
const SEED_PLUGINS: SeedPlugin[] = [
  { manifestPath: 'examples/plugins/crm/manifest.json', registryUrl: 'oci://plexica/crm-plugin' },
];

// Stable Keycloak sub for the super-admin who "registered" the seed plugins.
// The E2E admin user is a tenant_admin, not a super-admin, but the catalog row
// only needs a non-null creator reference — authorization is enforced at the
// route level (plugin:manage), not by this column.
const SEED_CREATOR_KEYCLOAK_ID = '00000000-0000-0000-0000-000000000000';

async function upsertPlugin(manifestPath: string, registryUrl: string, index: number): Promise<string> {
  const absPath = path.resolve(MONOREPO_ROOT, manifestPath);
  const raw = await readFile(absPath, 'utf-8');
  const manifest = JSON.parse(raw) as Record<string, unknown>;

  const parsed = manifestSchema.safeParse(manifest);
  if (!parsed.success) {
    throw new Error(`Manifest "${manifestPath}" failed validation: ${parsed.error.message}`);
  }
  const m = parsed.data;

  const imageRef = m.hosting.image;
  const imageName = (imageRef.includes(':') ? imageRef.split(':')[0] : imageRef) ?? '';
  const imageTag = imageRef.includes(':') ? imageRef.split(':')[1] ?? 'latest' : 'latest';

  // icon in manifest is a Lucide icon name; store it as the icon_url field.
  const iconUrl = m.icon ?? '';

  // First seeded plugin gets reviewStatus='pending' so the review E2E test has
  // deterministic data. Subsequent plugins get 'none'.
  const reviewStatus = index === 0 ? 'pending' : 'none';

  const plugin = await prisma.plugin.upsert({
    where: { slug: m.slug },
    update: {
      name: m.name,
      description: m.description,
      version: m.version,
      author: m.author,
      iconUrl,
      categories: m.categories,
      manifest: manifest as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      status: 'published',
      reviewStatus,
      registryUrl,
      imageName,
      imageTag,
    },
    create: {
      slug: m.slug,
      name: m.name,
      description: m.description,
      version: m.version,
      author: m.author,
      iconUrl,
      categories: m.categories,
      manifest: manifest as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      status: 'published',
      reviewStatus,
      registryUrl,
      imageName,
      imageTag,
      createdByKeycloakId: SEED_CREATOR_KEYCLOAK_ID,
    },
    select: { id: true },
  });

  // Record the version snapshot (idempotent on [pluginId, version]).
  await prisma.pluginVersion.upsert({
    where: { pluginId_version: { pluginId: plugin.id, version: m.version } },
    update: { manifest: manifest as any }, // eslint-disable-line @typescript-eslint/no-explicit-any
    create: {
      pluginId: plugin.id,
      version: m.version,
      manifest: manifest as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    },
  });

  return plugin.id;
}

async function main(): Promise<void> {
  process.stdout.write('Seeding plugin catalog…\n');
  let count = 0;
  for (let i = 0; i < SEED_PLUGINS.length; i++) {
    const seed = SEED_PLUGINS[i];
    const id = await upsertPlugin(seed.manifestPath, seed.registryUrl, i);
    process.stdout.write(`  ✓ seeded plugin (id: ${id})\n`);
    count++;
  }
  process.stdout.write(`Seeded ${count} plugin(s).\n`);
  process.exit(0);
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`Fatal error: ${String(error)}\n`);
    process.exit(1);
  })
  .finally(() => {
    void disconnectDatabase();
  });
