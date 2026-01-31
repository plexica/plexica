// File: packages/database/prisma/seed.ts
// Complete database seeding script for Plexica development

import { PrismaClient, TenantStatus, PluginStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
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

// Sample plugins with marketplace data
const plugins = [
  {
    id: 'crm',
    name: 'CRM',
    version: '1.2.0', // Latest version
    status: PluginStatus.PUBLISHED,
    description: 'Customer Relationship Management - manage contacts, deals, and sales pipeline',
    longDescription: `Complete CRM solution for managing customer relationships. Track contacts, deals, and sales pipelines with ease. 
    
Features:
- Contact management with detailed profiles
- Deal tracking and pipeline visualization
- Sales analytics and reporting
- Team collaboration tools
- Email integration
- Custom fields and tags`,
    category: 'crm',
    author: 'Plexica Team',
    authorEmail: 'plugins@plexica.io',
    homepage: 'https://plexica.io/plugins/crm',
    repository: 'https://github.com/plexica/plugin-crm',
    license: 'MIT',
    icon: 'https://plexica.io/plugin-icons/crm.svg',
    screenshots: [
      'https://plexica.io/screenshots/crm-1.png',
      'https://plexica.io/screenshots/crm-2.png',
    ],
    demoUrl: 'https://www.youtube.com/watch?v=demo-crm',
    averageRating: 4.5,
    ratingCount: 24,
    downloadCount: 156,
    installCount: 89,
    publishedAt: new Date('2024-01-15T10:00:00Z'),
    manifest: {
      id: 'crm',
      name: 'CRM',
      version: '1.2.0',
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
            entry: 'http://localhost:9000/plexica-plugins/crm/1.2.0/remoteEntry.js',
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
    version: '2.0.1', // Latest version
    status: PluginStatus.PUBLISHED,
    description: 'Advanced analytics and reporting - visualize data and generate insights',
    longDescription: `Powerful analytics platform with real-time data visualization and custom dashboards.
    
Features:
- Interactive dashboards with drag-and-drop widgets
- Real-time data updates
- Custom chart types (line, bar, pie, area, scatter)
- SQL query builder
- Scheduled reports via email
- Export to PDF, Excel, CSV
- Team collaboration and sharing`,
    category: 'analytics',
    author: 'Plexica Team',
    authorEmail: 'plugins@plexica.io',
    homepage: 'https://plexica.io/plugins/analytics',
    repository: 'https://github.com/plexica/plugin-analytics',
    license: 'MIT',
    icon: 'https://plexica.io/plugin-icons/analytics.svg',
    screenshots: [
      'https://plexica.io/screenshots/analytics-1.png',
      'https://plexica.io/screenshots/analytics-2.png',
      'https://plexica.io/screenshots/analytics-3.png',
    ],
    demoUrl: 'https://www.youtube.com/watch?v=demo-analytics',
    averageRating: 4.8,
    ratingCount: 42,
    downloadCount: 287,
    installCount: 156,
    publishedAt: new Date('2024-02-01T14:30:00Z'),
    manifest: {
      id: 'analytics',
      name: 'Analytics',
      version: '2.0.1',
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
            entry: 'http://localhost:9000/plexica-plugins/analytics/2.0.1/remoteEntry.js',
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
    status: PluginStatus.PUBLISHED,
    description: 'Sample analytics plugin demonstrating event system integration',
    longDescription:
      'A lightweight analytics plugin built to demonstrate the Plexica event system and plugin-to-plugin communication.',
    category: 'analytics',
    author: 'Plexica Team',
    authorEmail: 'plugins@plexica.io',
    license: 'MIT',
    averageRating: 4.0,
    ratingCount: 8,
    downloadCount: 45,
    installCount: 23,
    publishedAt: new Date('2024-01-22T09:00:00Z'),
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
  {
    id: 'billing',
    name: 'Billing & Invoicing',
    version: '1.0.0',
    status: PluginStatus.PUBLISHED,
    description: 'Complete billing and invoicing solution with payment processing',
    longDescription: `Professional billing system with invoice generation, payment tracking, and reporting.
    
Features:
- Invoice creation and management
- Payment processing (Stripe, PayPal)
- Recurring billing support
- Tax calculations
- Multi-currency support
- Client portal
- Payment reminders`,
    category: 'billing',
    author: 'Finance Corp',
    authorEmail: 'dev@financecorp.io',
    homepage: 'https://financecorp.io/billing-plugin',
    license: 'Commercial',
    icon: 'https://plexica.io/plugin-icons/billing.svg',
    averageRating: 4.6,
    ratingCount: 31,
    downloadCount: 124,
    installCount: 67,
    publishedAt: new Date('2024-01-28T11:00:00Z'),
    manifest: {
      id: 'billing',
      name: 'Billing & Invoicing',
      version: '1.0.0',
      description: 'Complete billing and invoicing solution',
      category: 'billing',
      metadata: {
        author: {
          name: 'Finance Corp',
          email: 'dev@financecorp.io',
        },
        license: 'Commercial',
        keywords: ['billing', 'invoicing', 'payments', 'finance'],
      },
    },
  },
  {
    id: 'project-management',
    name: 'Project Management',
    version: '0.8.0',
    status: PluginStatus.DRAFT,
    description: 'Kanban-style project management with task tracking',
    category: 'productivity',
    author: 'TaskMaster Inc',
    authorEmail: 'hello@taskmaster.com',
    manifest: {
      id: 'project-management',
      name: 'Project Management',
      version: '0.8.0',
      description: 'Project management and task tracking',
      category: 'productivity',
      metadata: {
        author: {
          name: 'TaskMaster Inc',
          email: 'hello@taskmaster.com',
        },
        license: 'Apache-2.0',
        keywords: ['project', 'tasks', 'kanban', 'productivity'],
      },
    },
  },
  {
    id: 'email-marketing',
    name: 'Email Marketing',
    version: '1.5.2',
    status: PluginStatus.PENDING_REVIEW,
    description: 'Email campaign management with templates and analytics',
    longDescription: 'Create, send, and track email marketing campaigns with beautiful templates.',
    category: 'marketing',
    author: 'MailFlow Solutions',
    authorEmail: 'support@mailflow.io',
    license: 'Commercial',
    averageRating: 0,
    ratingCount: 0,
    downloadCount: 0,
    installCount: 0,
    manifest: {
      id: 'email-marketing',
      name: 'Email Marketing',
      version: '1.5.2',
      description: 'Email campaign management',
      category: 'marketing',
      metadata: {
        author: {
          name: 'MailFlow Solutions',
          email: 'support@mailflow.io',
        },
        license: 'Commercial',
        keywords: ['email', 'marketing', 'campaigns', 'newsletter'],
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

  // 2. Seed Plugins (using raw SQL to workaround Prisma pg adapter TEXT[] bug)
  console.log('\n📦 Seeding plugins...');
  for (const plugin of plugins) {
    // Use raw SQL INSERT with ON CONFLICT to handle upsert
    const screenshotsArray = plugin.screenshots
      ? `ARRAY[${plugin.screenshots.map((s) => `'${s}'`).join(',')}]::text[]`
      : 'NULL';

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO core.plugins (
        id, name, version, status, manifest,
        description, long_description, category, author, author_email,
        homepage, repository, license, icon, screenshots, demo_url,
        average_rating, rating_count, download_count, install_count,
        published_at, rejected_at, rejection_reason,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14, ${screenshotsArray}, $15,
        $16, $17, $18, $19,
        $20, $21, $22,
        NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        version = EXCLUDED.version,
        status = EXCLUDED.status,
        manifest = EXCLUDED.manifest,
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
      plugin.averageRating || null,
      plugin.ratingCount || 0,
      plugin.downloadCount || 0,
      plugin.installCount || 0,
      plugin.publishedAt || null,
      plugin.rejectedAt || null,
      plugin.rejectionReason || null
    );

    console.log(`   ✅ ${plugin.id} - ${plugin.name} v${plugin.version}`);
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
  // 5. Seed Workspaces (SKIPPED - workspace table missing tenantId column)
  console.log('\n🏢 Seeding workspaces... ⏭️  SKIPPED (schema mismatch)');

  // 5. Install plugins for tenants (SKIPPED - not critical for marketplace testing)
  console.log('\n🔌 Installing plugins for tenants... ⏭️  SKIPPED');

  console.log('\n✅ Database seeding complete!\n');
  console.log('📊 Summary:');
  console.log(`   - Tenants: ${tenants.length}`);
  console.log(`   - Plugins: ${plugins.length}`);
  console.log(`   - Users: ${users.length}`);
  console.log(`   - Workspaces: ${workspaces.length} (not seeded)`);
  console.log(`   - Plugin Installations: (skipped)`);

  // 6. Seed Plugin Versions - Array definition
  const pluginVersions = [
    // CRM versions
    {
      pluginId: 'crm',
      version: '1.0.0',
      changelog: 'Initial release',
      isLatest: false,
      publishedAt: new Date('2024-01-15T10:00:00Z'),
    },
    {
      pluginId: 'crm',
      version: '1.1.0',
      changelog: 'Added deal tracking',
      isLatest: false,
      publishedAt: new Date('2024-02-01T10:00:00Z'),
    },
    {
      pluginId: 'crm',
      version: '1.2.0',
      changelog: 'Performance improvements and bug fixes',
      isLatest: true,
      publishedAt: new Date('2024-03-01T10:00:00Z'),
    },
    // Analytics versions
    {
      pluginId: 'analytics',
      version: '1.0.0',
      changelog: 'Initial release with basic charts',
      isLatest: false,
      publishedAt: new Date('2024-02-01T14:30:00Z'),
    },
    {
      pluginId: 'analytics',
      version: '2.0.0',
      changelog: 'Major redesign with new chart types',
      isLatest: false,
      publishedAt: new Date('2024-03-15T14:30:00Z'),
    },
    {
      pluginId: 'analytics',
      version: '2.0.1',
      changelog: 'Bug fixes',
      isLatest: true,
      publishedAt: new Date('2024-03-20T14:30:00Z'),
    },
    // Other plugins
    {
      pluginId: 'sample-analytics',
      version: '1.0.0',
      changelog: 'Initial release',
      isLatest: true,
      publishedAt: new Date('2024-01-22T09:00:00Z'),
    },
    {
      pluginId: 'billing',
      version: '1.0.0',
      changelog: 'First stable release',
      isLatest: true,
      publishedAt: new Date('2024-01-28T11:00:00Z'),
    },
  ];

  // 6. Seed Plugin Versions (using raw SQL)
  console.log('\n📌 Seeding plugin versions...');
  for (const versionData of pluginVersions) {
    // Find plugin from our local plugins array to avoid Prisma TEXT[] bug
    const plugin = plugins.find(p => p.id === versionData.pluginId);
    if (plugin) {
      const versionId = `${versionData.pluginId}-${versionData.version}`;
      const assetUrl = `https://cdn.plexica.io/plugins/${versionData.pluginId}/${versionData.version}/bundle.js`;
      const downloadCount = Math.floor(Math.random() * 50);

      await prisma.$executeRawUnsafe(`
        INSERT INTO core.plugin_versions (
          id, plugin_id, version, changelog, manifest, asset_url,
          download_count, is_latest, published_at, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
        )
        ON CONFLICT (plugin_id, version) DO UPDATE SET
          changelog = EXCLUDED.changelog,
          is_latest = EXCLUDED.is_latest
      `,
        versionId,
        versionData.pluginId,
        versionData.version,
        versionData.changelog || null,
        JSON.stringify(plugin.manifest),
        assetUrl,
        downloadCount,
        versionData.isLatest,
        versionData.publishedAt || null
      );
      
      console.log(
        `   ✅ ${versionData.pluginId}@${versionData.version}${versionData.isLatest ? ' (latest)' : ''}`
      );
    }
  }
  }

  // 7. Seed Plugin Ratings - Array definition
  const ratings = [
    // CRM ratings
    {
      pluginId: 'crm',
      tenantId: tenants[0].id,
      userId: users[0].id,
      rating: 5,
      review: 'Excellent CRM! Easy to use and powerful.',
    },
    {
      pluginId: 'crm',
      tenantId: tenants[1].id,
      userId: users[2].id,
      rating: 4,
      review: 'Great plugin, would love more customization options.',
    },
    {
      pluginId: 'crm',
      tenantId: tenants[2].id,
      userId: users[1].id,
      rating: 5,
      review: 'Perfect for our sales team!',
      helpful: 12,
      notHelpful: 1,
    },
    // Analytics ratings
    {
      pluginId: 'analytics',
      tenantId: tenants[0].id,
      userId: users[0].id,
      rating: 5,
      review: 'The dashboards are beautiful and very intuitive.',
    },
    {
      pluginId: 'analytics',
      tenantId: tenants[2].id,
      userId: users[1].id,
      rating: 5,
      review: "Best analytics plugin we've used!",
      helpful: 8,
    },
    {
      pluginId: 'analytics',
      tenantId: tenants[1].id,
      userId: users[2].id,
      rating: 4,
      review: 'Very good, minor performance issues with large datasets.',
    },
    // Other ratings
    {
      pluginId: 'billing',
      tenantId: tenants[0].id,
      userId: users[0].id,
      rating: 5,
      review: 'Billing made easy!',
    },
    {
      pluginId: 'sample-analytics',
      tenantId: tenants[2].id,
      userId: users[1].id,
      rating: 4,
      review: 'Good for learning the plugin system.',
    },
  ];

  // 7. Seed Plugin Ratings (using raw SQL)
  console.log('\n⭐ Seeding plugin ratings...');
  for (const ratingData of ratings) {
    const ratingId = `${ratingData.pluginId}-${ratingData.tenantId}-${ratingData.userId}`;

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO core.plugin_ratings (
        id, plugin_id, tenant_id, user_id, rating, review,
        helpful_count, not_helpful_count, created_at, updated_at
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
      ratingData.review || null,
      ratingData.helpful || 0,
      ratingData.notHelpful || 0
    );

    console.log(`   ✅ ${ratingData.pluginId} - ${ratingData.rating}⭐ by ${ratingData.userId}`);
  }

  // 8. Seed Plugin Installations - Array definition
  const installationHistory = [
    {
      pluginId: 'crm',
      version: '1.2.0',
      tenantId: tenants[0].id,
      installedBy: users[0].id,
      installedAt: new Date('2024-03-05T10:00:00Z'),
    },
    {
      pluginId: 'analytics',
      version: '2.0.1',
      tenantId: tenants[0].id,
      installedBy: users[0].id,
      installedAt: new Date('2024-03-22T14:00:00Z'),
    },
    {
      pluginId: 'crm',
      version: '1.2.0',
      tenantId: tenants[1].id,
      installedBy: users[2].id,
      installedAt: new Date('2024-03-10T11:30:00Z'),
    },
    {
      pluginId: 'crm',
      version: '1.2.0',
      tenantId: tenants[2].id,
      installedBy: users[1].id,
      installedAt: new Date('2024-03-01T09:00:00Z'),
    },
    {
      pluginId: 'analytics',
      version: '2.0.0',
      tenantId: tenants[2].id,
      installedBy: users[1].id,
      installedAt: new Date('2024-03-16T10:00:00Z'),
    },
    {
      pluginId: 'sample-analytics',
      version: '1.0.0',
      tenantId: tenants[2].id,
      installedBy: users[1].id,
      installedAt: new Date('2024-02-01T15:00:00Z'),
    },
  ];

  // 8. Seed Plugin Installations (using raw SQL)
  console.log('\n📥 Seeding plugin installation history...');
  for (const installation of installationHistory) {
    const installationId = `${installation.pluginId}-${installation.tenantId}-${installation.installedAt.getTime()}`;

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO core.plugin_installations (
        id, plugin_id, plugin_version, tenant_id, installed_by,
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
      installation.uninstalledAt || null
    );

    console.log(
      `   ✅ ${installation.pluginId}@${installation.version} installed by ${installation.installedBy}`
    );
  }

  console.log('\n✅ Marketplace seeding complete!\n');
  console.log('📊 Additional Summary:');
  console.log(`   - Plugin Versions: ${pluginVersions.length}`);
  console.log(`   - Plugin Ratings: ${ratings.length}`);
  console.log(`   - Installation History: ${installationHistory.length}`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
