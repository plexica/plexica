// File: packages/database/scripts/install-plugins-for-tenants.ts

import prisma from '../src/index.js';

async function main() {
  console.log('🔧 Installing plugins for all active tenants...\n');

  // Get all active tenants
  const tenants = await prisma.tenant.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true, slug: true },
  });

  console.log(`Found ${tenants.length} active tenants\n`);

  const pluginIds = ['crm', 'analytics'];

  for (const tenant of tenants) {
    console.log(`📋 Tenant: ${tenant.name} (${tenant.slug})`);

    for (const pluginId of pluginIds) {
      try {
        // Check if already installed
        const existing = await prisma.tenantPlugin.findUnique({
          where: {
            tenantId_pluginId: {
              tenantId: tenant.id,
              pluginId,
            },
          },
        });

        if (existing) {
          console.log(`   ⏭️  ${pluginId} already installed (enabled: ${existing.enabled})`);
          continue;
        }

        // Install plugin
        await prisma.tenantPlugin.create({
          data: {
            tenantId: tenant.id,
            pluginId,
            enabled: true,
            configuration: {},
          },
        });

        console.log(`   ✅ ${pluginId} installed and enabled`);
      } catch (error: any) {
        console.error(`   ❌ Failed to install ${pluginId}: ${error.message}`);
      }
    }
    console.log('');
  }

  console.log('✅ Installation complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
