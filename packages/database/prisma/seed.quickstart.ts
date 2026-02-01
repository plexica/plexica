// File: packages/database/prisma/seed.quickstart.ts
// Quickstart seed script for Plexica - minimal setup for quick demos
// This script creates a minimal viable dataset for developers to get started quickly

import { PrismaClient, TenantStatus, PluginStatus } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(__dirname, '../.env') });

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Create Prisma adapter and client
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ============================================================================
// QUICKSTART FIXTURES - Minimal data for getting started
// ============================================================================

const QUICKSTART_TENANT = {
  id: 'tenant-quickstart-demo',
  slug: 'quickstart-demo',
  name: 'Quickstart Demo Company',
  status: TenantStatus.ACTIVE,
  settings: {
    timezone: 'America/New_York',
    locale: 'en-US',
    features: {
      workspaces: true,
      plugins: true,
      analytics: true,
      marketplace: true,
    },
  },
  theme: {
    primaryColor: '#6366F1',
    secondaryColor: '#8B5CF6',
    logo: '/logos/quickstart-demo.png',
    darkMode: true,
  },
};

const QUICKSTART_PLUGINS = [
  {
    id: 'crm-quickstart',
    name: 'CRM (Quickstart)',
    version: '1.0.0',
    status: PluginStatus.PUBLISHED,
    description: 'Customer Relationship Management - Demo plugin for quickstart',
    longDescription: `A lightweight CRM plugin pre-configured for quickstart demos.

Features included:
- Contact management with sample data
- Simple deal pipeline
- Activity tracking
- Basic reporting

This is perfect for testing the Plexica plugin system!`,
    category: 'crm',
    author: 'Plexica Quickstart',
    authorEmail: 'quickstart@plexica.io',
    homepage: 'https://plexica.io/docs/quickstart',
    repository: 'https://github.com/plexica/plugin-crm',
    license: 'MIT',
    icon: 'https://plexica.io/plugin-icons/crm.svg',
    screenshots: ['https://plexica.io/screenshots/crm-quickstart.png'],
    demoUrl: 'https://docs.plexica.io/quickstart',
    averageRating: 5.0,
    ratingCount: 1,
    downloadCount: 1,
    installCount: 1,
    publishedAt: new Date(),
    manifest: {
      id: 'crm-quickstart',
      name: 'CRM (Quickstart)',
      version: '1.0.0',
      description: 'Customer Relationship Management - Demo plugin',
      category: 'crm',
      metadata: {
        author: {
          name: 'Plexica Quickstart',
          email: 'quickstart@plexica.io',
        },
        license: 'MIT',
        keywords: ['crm', 'quickstart', 'demo', 'contacts'],
      },
      frontend: {
        modules: [
          {
            name: 'CRM',
            entry: 'http://localhost:9000/plexica-plugins/crm-quickstart/1.0.0/remoteEntry.js',
            scope: 'plugin_crm_quickstart',
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
    id: 'dashboard-quickstart',
    name: 'Dashboard (Quickstart)',
    version: '1.0.0',
    status: PluginStatus.PUBLISHED,
    description: 'Simple dashboard with widgets - Perfect for quickstart demos',
    longDescription: `A minimal dashboard plugin with pre-configured widgets.

Includes:
- Sales overview widget
- Activity feed widget
- Quick stats widget
- Customizable layout

Great for understanding the Plexica plugin architecture!`,
    category: 'analytics',
    author: 'Plexica Quickstart',
    authorEmail: 'quickstart@plexica.io',
    license: 'MIT',
    icon: 'https://plexica.io/plugin-icons/dashboard.svg',
    screenshots: ['https://plexica.io/screenshots/dashboard-quickstart.png'],
    averageRating: 5.0,
    ratingCount: 1,
    downloadCount: 1,
    installCount: 1,
    publishedAt: new Date(),
    manifest: {
      id: 'dashboard-quickstart',
      name: 'Dashboard (Quickstart)',
      version: '1.0.0',
      description: 'Simple dashboard with widgets',
      category: 'analytics',
      metadata: {
        author: {
          name: 'Plexica Quickstart',
          email: 'quickstart@plexica.io',
        },
        license: 'MIT',
        keywords: ['dashboard', 'quickstart', 'demo', 'widgets'],
      },
      frontend: {
        modules: [
          {
            name: 'Dashboard',
            entry:
              'http://localhost:9000/plexica-plugins/dashboard-quickstart/1.0.0/remoteEntry.js',
            scope: 'plugin_dashboard_quickstart',
            type: 'page',
            menu: {
              label: 'Dashboard',
              icon: 'LayoutDashboard',
              position: 5,
            },
          },
        ],
      },
    },
  },
];

const QUICKSTART_USERS = [
  {
    id: 'user-quickstart-admin',
    keycloakId: 'keycloak-quickstart-admin',
    email: 'admin@quickstart-demo.com',
    firstName: 'Admin',
    lastName: 'User',
    locale: 'en-US',
    avatar: 'https://i.pravatar.cc/150?u=admin',
  },
  {
    id: 'user-quickstart-member',
    keycloakId: 'keycloak-quickstart-member',
    email: 'member@quickstart-demo.com',
    firstName: 'Demo',
    lastName: 'Member',
    locale: 'en-US',
    avatar: 'https://i.pravatar.cc/150?u=member',
  },
];

const QUICKSTART_WORKSPACE = {
  id: 'workspace-quickstart-default',
  tenantId: QUICKSTART_TENANT.id,
  slug: 'default',
  name: 'Default Workspace',
  description: 'Your quickstart workspace - ready to go!',
  settings: {
    features: ['crm', 'dashboard', 'analytics'],
    defaultView: 'dashboard',
  },
};

// ============================================================================
// SEEDING FUNCTIONS
// ============================================================================

async function seedTenant() {
  console.log('📊 Seeding quickstart tenant...');

  const tenant = await prisma.tenant.upsert({
    where: { slug: QUICKSTART_TENANT.slug },
    update: {
      name: QUICKSTART_TENANT.name,
      status: QUICKSTART_TENANT.status,
      settings: QUICKSTART_TENANT.settings,
      theme: QUICKSTART_TENANT.theme,
    },
    create: QUICKSTART_TENANT,
  });

  console.log(`   ✅ ${tenant.slug} - ${tenant.name}`);
  return tenant;
}

async function seedPlugins() {
  console.log('\n📦 Seeding quickstart plugins...');

  for (const plugin of QUICKSTART_PLUGINS) {
    // Use raw SQL to handle TEXT[] array type (Prisma pg adapter limitation)
    const screenshotsArray = plugin.screenshots
      ? `ARRAY[${plugin.screenshots.map((s) => `'${s}'`).join(',')}]::text[]`
      : 'ARRAY[]::text[]';

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO core.plugins (
        id, name, version, status, manifest,
        description, long_description, category, author, author_email,
        homepage, repository, license, icon, screenshots, demo_url,
        average_rating, rating_count, download_count, install_count,
        published_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14, ${screenshotsArray}, $15,
        $16, $17, $18, $19,
        $20, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        version = EXCLUDED.version,
        status = EXCLUDED.status,
        manifest = EXCLUDED.manifest,
        description = EXCLUDED.description,
        updated_at = NOW()
    `,
      plugin.id,
      plugin.name,
      plugin.version,
      plugin.status,
      JSON.stringify(plugin.manifest),
      plugin.description,
      plugin.longDescription,
      plugin.category,
      plugin.author,
      plugin.authorEmail,
      plugin.homepage || null,
      plugin.repository || null,
      plugin.license || null,
      plugin.icon || null,
      plugin.demoUrl || null,
      plugin.averageRating,
      plugin.ratingCount,
      plugin.downloadCount,
      plugin.installCount,
      plugin.publishedAt
    );

    console.log(`   ✅ ${plugin.id} - ${plugin.name} v${plugin.version}`);
  }
}

async function seedPluginVersions() {
  console.log('\n📌 Seeding plugin versions...');

  for (const plugin of QUICKSTART_PLUGINS) {
    const versionId = `${plugin.id}-${plugin.version}`;
    const assetUrl = `https://cdn.plexica.io/plugins/${plugin.id}/${plugin.version}/bundle.js`;

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO core.plugin_versions (
        id, plugin_id, version, changelog, manifest, asset_url,
        download_count, is_latest, published_at, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
      )
      ON CONFLICT (plugin_id, version) DO UPDATE SET
        is_latest = EXCLUDED.is_latest,
        manifest = EXCLUDED.manifest
    `,
      versionId,
      plugin.id,
      plugin.version,
      'Quickstart release',
      JSON.stringify(plugin.manifest),
      assetUrl,
      1,
      true, // isLatest
      plugin.publishedAt
    );

    console.log(`   ✅ ${plugin.id}@${plugin.version} (latest)`);
  }
}

async function seedUsers() {
  console.log('\n👥 Seeding quickstart users...');

  for (const user of QUICKSTART_USERS) {
    const result = await prisma.user.upsert({
      where: { keycloakId: user.keycloakId },
      update: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        locale: user.locale,
        avatar: user.avatar,
      },
      create: user,
    });

    console.log(`   ✅ ${result.email} - ${result.firstName} ${result.lastName}`);
  }
}

async function seedWorkspace() {
  console.log('\n🏢 Seeding quickstart workspace...');

  const workspace = await prisma.workspace.upsert({
    where: {
      tenantId_slug: {
        tenantId: QUICKSTART_WORKSPACE.tenantId,
        slug: QUICKSTART_WORKSPACE.slug,
      },
    },
    update: {
      name: QUICKSTART_WORKSPACE.name,
      description: QUICKSTART_WORKSPACE.description,
      settings: QUICKSTART_WORKSPACE.settings,
    },
    create: QUICKSTART_WORKSPACE,
  });

  console.log(`   ✅ ${workspace.slug} - ${workspace.name}`);
  return workspace;
}

async function seedWorkspaceMembers(workspaceId: string) {
  console.log('\n👤 Seeding workspace members...');

  // Admin user
  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: QUICKSTART_USERS[0].id,
      },
    },
    update: {
      role: 'ADMIN',
    },
    create: {
      workspaceId,
      userId: QUICKSTART_USERS[0].id,
      role: 'ADMIN',
      invitedBy: QUICKSTART_USERS[0].id, // Self-invited
    },
  });
  console.log(`   ✅ ${QUICKSTART_USERS[0].email} - ADMIN`);

  // Member user
  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: QUICKSTART_USERS[1].id,
      },
    },
    update: {
      role: 'MEMBER',
    },
    create: {
      workspaceId,
      userId: QUICKSTART_USERS[1].id,
      role: 'MEMBER',
      invitedBy: QUICKSTART_USERS[0].id, // Invited by admin
    },
  });
  console.log(`   ✅ ${QUICKSTART_USERS[1].email} - MEMBER`);
}

async function seedTenantPlugins() {
  console.log('\n🔌 Installing plugins for tenant...');

  for (const plugin of QUICKSTART_PLUGINS) {
    await prisma.tenantPlugin.upsert({
      where: {
        tenantId_pluginId: {
          tenantId: QUICKSTART_TENANT.id,
          pluginId: plugin.id,
        },
      },
      update: {
        enabled: true,
        configuration: {
          quickstart: true,
          environment: 'demo',
        },
      },
      create: {
        tenantId: QUICKSTART_TENANT.id,
        pluginId: plugin.id,
        enabled: true,
        configuration: {
          quickstart: true,
          environment: 'demo',
        },
      },
    });

    console.log(`   ✅ ${plugin.id} installed and enabled`);
  }
}

async function seedPluginRatings() {
  console.log('\n⭐ Seeding plugin ratings...');

  const ratings = [
    {
      pluginId: QUICKSTART_PLUGINS[0].id,
      tenantId: QUICKSTART_TENANT.id,
      userId: QUICKSTART_USERS[0].id,
      rating: 5,
      review: 'Perfect for getting started! Easy to understand and well-documented.',
    },
    {
      pluginId: QUICKSTART_PLUGINS[1].id,
      tenantId: QUICKSTART_TENANT.id,
      userId: QUICKSTART_USERS[1].id,
      rating: 5,
      review: 'Great dashboard plugin for demos. Love the quickstart setup!',
    },
  ];

  for (const ratingData of ratings) {
    const ratingId = `${ratingData.pluginId}-${ratingData.tenantId}-${ratingData.userId}`;

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO core.plugin_ratings (
        id, plugin_id, tenant_id, user_id, rating, review,
        helpful, not_helpful, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()
      )
      ON CONFLICT (plugin_id, tenant_id, user_id) DO UPDATE SET
        rating = EXCLUDED.rating,
        review = EXCLUDED.review,
        updated_at = NOW()
    `,
      ratingId,
      ratingData.pluginId,
      ratingData.tenantId,
      ratingData.userId,
      ratingData.rating,
      ratingData.review,
      0, // helpful
      0 // not_helpful
    );

    console.log(`   ✅ ${ratingData.pluginId} - ${ratingData.rating}⭐`);
  }
}

async function seedPluginInstallations() {
  console.log('\n📥 Seeding plugin installation history...');

  const installations = [
    {
      pluginId: QUICKSTART_PLUGINS[0].id,
      version: QUICKSTART_PLUGINS[0].version,
      tenantId: QUICKSTART_TENANT.id,
      installedBy: QUICKSTART_USERS[0].id,
      installedAt: new Date(),
    },
    {
      pluginId: QUICKSTART_PLUGINS[1].id,
      version: QUICKSTART_PLUGINS[1].version,
      tenantId: QUICKSTART_TENANT.id,
      installedBy: QUICKSTART_USERS[0].id,
      installedAt: new Date(),
    },
  ];

  for (const installation of installations) {
    const installationId = `quickstart-${installation.pluginId}-${Date.now()}`;

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO core.plugin_installations (
        id, plugin_id, version, tenant_id, installed_by,
        installed_at, uninstalled_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7
      )
      ON CONFLICT (id) DO NOTHING
    `,
      installationId,
      installation.pluginId,
      installation.version,
      installation.tenantId,
      installation.installedBy,
      installation.installedAt,
      null // not uninstalled
    );

    console.log(`   ✅ ${installation.pluginId}@${installation.version}`);
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║       🚀 PLEXICA QUICKSTART SEED SCRIPT 🚀                ║');
  console.log('║  Creating minimal demo data for quick development setup   ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Seed in order to maintain referential integrity
    await seedTenant();
    await seedPlugins();
    await seedPluginVersions();
    await seedUsers();

    const workspace = await seedWorkspace();
    await seedWorkspaceMembers(workspace.id);
    await seedTenantPlugins();
    await seedPluginRatings();
    await seedPluginInstallations();

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║              ✅ QUICKSTART SEED COMPLETE! ✅              ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('📊 Quickstart Summary:');
    console.log('   ┌─────────────────────────────────────────────┐');
    console.log('   │ Tenant:     quickstart-demo                 │');
    console.log('   │ Plugins:    2 (CRM + Dashboard)             │');
    console.log('   │ Users:      2 (Admin + Member)              │');
    console.log('   │ Workspace:  1 (Default)                     │');
    console.log('   │ Status:     Ready to use! 🎉                │');
    console.log('   └─────────────────────────────────────────────┘\n');

    console.log('🔐 Login Credentials:');
    console.log('   Admin:  admin@quickstart-demo.com');
    console.log('   Member: member@quickstart-demo.com\n');

    console.log('🎯 Next Steps:');
    console.log('   1. Start the development server: pnpm dev');
    console.log('   2. Open http://localhost:3000');
    console.log('   3. Login with admin credentials');
    console.log('   4. Explore the CRM and Dashboard plugins!\n');

    console.log('📚 Documentation:');
    console.log('   - Quickstart Guide: ./QUICKSTART_GUIDE.md');
    console.log('   - API Docs: https://docs.plexica.io');
    console.log('   - Plugin Development: https://docs.plexica.io/plugins\n');
  } catch (error) {
    console.error('\n❌ Error during quickstart seeding:', error);
    throw error;
  }
}

// Execute main function
main()
  .catch((e) => {
    console.error('❌ Quickstart seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
    await prisma.$disconnect();
  });
