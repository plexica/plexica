// File: packages/database/prisma/seed.ts
// Complete database seeding script for Plexica development

import { PrismaClient, TenantStatus, PluginStatus } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from the database package .env
config({ path: resolve(__dirname, '../.env') });

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Create Prisma adapter for node-postgres
const adapter = new PrismaPg(pool);

// Create Prisma Client with adapter
const prisma = new PrismaClient({
  adapter,
});

// Sample tenants
const tenants = [
  {
    id: 'tenant-acme-corp',
    slug: 'acme-corp',
    name: 'Acme Corporation',
    status: TenantStatus.ACTIVE,
    settings: {
      timezone: 'America/New_York',
      locale: 'en-US',
      features: {
        workspaces: true,
        plugins: true,
        analytics: true,
      },
    },
    theme: {
      primaryColor: '#3B82F6',
      secondaryColor: '#8B5CF6',
      logo: '/logos/acme-corp.png',
    },
  },
  {
    id: 'tenant-globex-inc',
    slug: 'globex-inc',
    name: 'Globex Industries',
    status: TenantStatus.ACTIVE,
    settings: {
      timezone: 'Europe/London',
      locale: 'en-GB',
      features: {
        workspaces: true,
        plugins: true,
        analytics: false,
      },
    },
    theme: {
      primaryColor: '#10B981',
      secondaryColor: '#059669',
      logo: '/logos/globex-inc.png',
    },
  },
  {
    id: 'tenant-demo-company',
    slug: 'demo-company',
    name: 'Demo Company',
    status: TenantStatus.ACTIVE,
    settings: {
      timezone: 'America/Los_Angeles',
      locale: 'en-US',
      features: {
        workspaces: true,
        plugins: true,
        analytics: true,
      },
    },
    theme: {
      primaryColor: '#F59E0B',
      secondaryColor: '#D97706',
      logo: '/logos/demo-company.png',
    },
  },
];

// Sample plugins
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
              icon: 'Users',
              position: 10,
            },
          },
        ],
      },
      backend: {
        enabled: true,
        port: 3100,
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
              icon: 'BarChart3',
              position: 20,
            },
          },
        ],
      },
      backend: {
        enabled: true,
        port: 3200,
      },
    },
  },
  {
    id: 'sample-analytics',
    name: 'Sample Analytics',
    version: '1.0.0',
    status: PluginStatus.AVAILABLE,
    manifest: {
      id: 'sample-analytics',
      name: 'Sample Analytics',
      version: '1.0.0',
      description: 'Sample analytics plugin demonstrating event system integration',
      category: 'analytics',
      metadata: {
        author: {
          name: 'Plexica Team',
          email: 'plugins@plexica.io',
        },
        license: 'MIT',
        keywords: ['analytics', 'sample', 'events', 'demo'],
      },
    },
  },
];

// Sample users (these would normally be created via Keycloak)
const users = [
  {
    id: 'user-admin-1',
    keycloakId: 'keycloak-admin-1',
    email: 'admin@acme-corp.com',
    firstName: 'John',
    lastName: 'Admin',
    locale: 'en-US',
  },
  {
    id: 'user-member-1',
    keycloakId: 'keycloak-member-1',
    email: 'user@acme-corp.com',
    firstName: 'Jane',
    lastName: 'User',
    locale: 'en-US',
  },
  {
    id: 'user-admin-2',
    keycloakId: 'keycloak-admin-2',
    email: 'admin@globex-inc.com',
    firstName: 'Bob',
    lastName: 'Manager',
    locale: 'en-GB',
  },
];

// Sample workspaces (one default per tenant)
const workspaces = [
  {
    id: 'workspace-acme-default',
    slug: 'default',
    name: 'Default Workspace',
    description: 'Default workspace for Acme Corporation',
    settings: {},
  },
  {
    id: 'workspace-globex-default',
    slug: 'default',
    name: 'Default Workspace',
    description: 'Default workspace for Globex Industries',
    settings: {},
  },
  {
    id: 'workspace-demo-default',
    slug: 'default',
    name: 'Default Workspace',
    description: 'Default workspace for Demo Company',
    settings: {},
  },
];

async function main() {
  console.log('🌱 Starting database seeding...\n');

  // 1. Seed Tenants
  console.log('📊 Seeding tenants...');
  for (const tenant of tenants) {
    const result = await prisma.tenant.upsert({
      where: { slug: tenant.slug },
      update: {
        name: tenant.name,
        status: tenant.status,
        settings: tenant.settings,
        theme: tenant.theme,
      },
      create: tenant,
    });
    console.log(`   ✅ ${result.slug} - ${result.name} (${result.status})`);
  }

  // 2. Seed Plugins
  console.log('\n📦 Seeding plugins...');
  for (const plugin of plugins) {
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
  }

  // 3. Seed Users
  console.log('\n👥 Seeding users...');
  for (const user of users) {
    const result = await prisma.user.upsert({
      where: { keycloakId: user.keycloakId },
      update: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        locale: user.locale,
      },
      create: user,
    });
    console.log(`   ✅ ${result.email} - ${result.firstName} ${result.lastName}`);
  }

  // 4. Seed Workspaces
  console.log('\n🏢 Seeding workspaces...');
  const workspaceData = [
    { ...workspaces[0], tenantId: tenants[0].id }, // Acme Corp
    { ...workspaces[1], tenantId: tenants[1].id }, // Globex Inc
    { ...workspaces[2], tenantId: tenants[2].id }, // Demo Company
  ];

  for (const workspace of workspaceData) {
    // Check if workspace exists by combining slug and tenantId
    const existing = await prisma.workspace.findFirst({
      where: {
        slug: workspace.slug,
        // Note: Workspace model doesn't have tenantId in current schema
        // This is a limitation - workspaces are global in current schema
      },
    });

    if (!existing) {
      const result = await prisma.workspace.create({
        data: {
          id: workspace.id,
          slug: workspace.slug,
          name: workspace.name,
          description: workspace.description,
          settings: workspace.settings,
        },
      });
      console.log(`   ✅ ${result.slug} - ${result.name}`);
    } else {
      console.log(`   ⏭️  ${workspace.slug} - Already exists`);
    }
  }

  // 5. Install plugins for tenants
  console.log('\n🔌 Installing plugins for tenants...');
  const pluginInstallations = [
    // Acme Corp - Install CRM and Analytics
    { tenantId: tenants[0].id, pluginId: 'crm', enabled: true, configuration: {} },
    { tenantId: tenants[0].id, pluginId: 'analytics', enabled: true, configuration: {} },
    // Globex Inc - Install only CRM
    { tenantId: tenants[1].id, pluginId: 'crm', enabled: true, configuration: {} },
    // Demo Company - Install all plugins
    { tenantId: tenants[2].id, pluginId: 'crm', enabled: true, configuration: {} },
    { tenantId: tenants[2].id, pluginId: 'analytics', enabled: true, configuration: {} },
    { tenantId: tenants[2].id, pluginId: 'sample-analytics', enabled: false, configuration: {} },
  ];

  for (const installation of pluginInstallations) {
    // Check if already installed
    const existing = await prisma.tenantPlugin.findUnique({
      where: {
        tenantId_pluginId: {
          tenantId: installation.tenantId,
          pluginId: installation.pluginId,
        },
      },
    });

    if (!existing) {
      const result = await prisma.tenantPlugin.create({
        data: installation,
        include: {
          tenant: true,
          plugin: true,
        },
      });
      console.log(
        `   ✅ ${result.tenant.slug} → ${result.plugin.name} (${result.enabled ? 'enabled' : 'disabled'})`
      );
    } else {
      const tenant = await prisma.tenant.findUnique({ where: { id: installation.tenantId } });
      const plugin = await prisma.plugin.findUnique({ where: { id: installation.pluginId } });
      console.log(`   ⏭️  ${tenant?.slug} → ${plugin?.name} - Already installed`);
    }
  }

  console.log('\n✅ Database seeding complete!\n');
  console.log('📊 Summary:');
  console.log(`   - Tenants: ${tenants.length}`);
  console.log(`   - Plugins: ${plugins.length}`);
  console.log(`   - Users: ${users.length}`);
  console.log(`   - Workspaces: ${workspaces.length}`);
  console.log(`   - Plugin Installations: ${pluginInstallations.length}`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
