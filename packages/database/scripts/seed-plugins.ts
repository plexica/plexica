// File: packages/database/scripts/seed-plugins.ts

import prisma, { PluginStatus } from '../src/index.js';

const plugins = [
  {
    id: 'crm',
    name: 'CRM',
    version: '0.1.0',
    status: PluginStatus.AVAILABLE,
    manifest: {
      id: 'crm',
      name: 'CRM',
      version: '0.1.0',
      description: 'Customer Relationship Management - manage contacts, deals, and sales pipeline',
      category: 'crm',
      metadata: {
        author: {
          name: 'Plexica Team',
          email: 'plugins@plexica.io',
        },
        license: 'MIT',
        keywords: ['crm', 'sales', 'contacts', 'deals', 'pipeline'],
      },
      frontend: {
        modules: [
          {
            name: 'CRM',
            entry: 'http://localhost:9000/plexica-plugins/crm/0.1.0/remoteEntry.js',
            scope: 'plugin_crm',
            type: 'page',
            menu: {
              label: 'CRM',
              position: 10,
            },
          },
        ],
      },
    },
  },
  {
    id: 'analytics',
    name: 'Analytics',
    version: '0.1.0',
    status: PluginStatus.AVAILABLE,
    manifest: {
      id: 'analytics',
      name: 'Analytics',
      version: '0.1.0',
      description: 'Advanced analytics and reporting - visualize data and generate insights',
      category: 'analytics',
      metadata: {
        author: {
          name: 'Plexica Team',
          email: 'plugins@plexica.io',
        },
        license: 'MIT',
        keywords: ['analytics', 'reporting', 'charts', 'dashboards', 'metrics'],
      },
      frontend: {
        modules: [
          {
            name: 'Analytics',
            entry: 'http://localhost:9000/plexica-plugins/analytics/0.1.0/remoteEntry.js',
            scope: 'plugin_analytics',
            type: 'page',
            menu: {
              label: 'Analytics',
              position: 20,
            },
          },
        ],
      },
    },
  },
];

async function main() {
  console.log('🌱 Seeding plugins...\n');

  for (const plugin of plugins) {
    console.log(`📦 Upserting plugin: ${plugin.name} (${plugin.id})`);

    try {
      const result = await prisma.plugin.upsert({
        where: { id: plugin.id },
        update: {
          name: plugin.name,
          version: plugin.version,
          manifest: plugin.manifest,
          status: plugin.status,
        },
        create: plugin,
      });

      console.log(`   ✅ ${result.id} - ${result.name} v${result.version}`);
    } catch (error: any) {
      console.error(`   ❌ Failed: ${error.message}`);
    }
  }

  console.log('\n✅ Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
