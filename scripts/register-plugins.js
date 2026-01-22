#!/usr/bin/env node

/**
 * Register CRM and Analytics plugins in the Plexica database
 */

const API_BASE_URL = 'http://localhost:3000/api';

const crmManifest = {
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
};

const analyticsManifest = {
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
};

async function registerPlugin(manifest) {
  console.log(`\n📦 Registering plugin: ${manifest.name} (${manifest.id})`);

  try {
    const response = await fetch(`${API_BASE_URL}/plugins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Note: In production, you'd need proper authentication here
        // For local dev, we'll try without auth first
      },
      body: JSON.stringify(manifest),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`   ❌ Failed to register: ${response.status} ${response.statusText}`);
      console.error(`   Error: ${error}`);
      return false;
    }

    const result = await response.json();
    console.log(`   ✅ Successfully registered`);
    console.log(`   Plugin ID: ${result.id}`);
    console.log(`   Version: ${result.version}`);
    return true;
  } catch (error) {
    console.error(`   ❌ Network error: ${error.message}`);
    return false;
  }
}

async function installPluginForTenant(tenantId, pluginId) {
  console.log(`\n🔧 Installing ${pluginId} for tenant ${tenantId}`);

  try {
    const response = await fetch(
      `${API_BASE_URL}/tenants/${tenantId}/plugins/${pluginId}/install`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ configuration: {} }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error(`   ❌ Failed to install: ${response.status} ${response.statusText}`);
      console.error(`   Error: ${error}`);
      return false;
    }

    const result = await response.json();
    console.log(`   ✅ Successfully installed`);
    return true;
  } catch (error) {
    console.error(`   ❌ Network error: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🚀 Plexica Plugin Registration Script');
  console.log('=====================================\n');
  console.log(`API Server: ${API_BASE_URL}`);

  // Check if API is available
  try {
    const healthCheck = await fetch(`http://localhost:3000/health`);
    if (!healthCheck.ok) {
      console.error('\n❌ API server is not responding. Make sure core-api is running.');
      console.error('   Run: cd apps/core-api && pnpm dev');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Cannot connect to API server. Make sure core-api is running.');
    console.error('   Run: cd apps/core-api && pnpm dev');
    process.exit(1);
  }

  console.log('✅ API server is available\n');

  // Register plugins
  const crmSuccess = await registerPlugin(crmManifest);
  const analyticsSuccess = await registerPlugin(analyticsManifest);

  console.log('\n=====================================');
  console.log('📊 Summary');
  console.log('=====================================');
  console.log(`CRM Plugin:       ${crmSuccess ? '✅ Registered' : '❌ Failed'}`);
  console.log(`Analytics Plugin: ${analyticsSuccess ? '✅ Registered' : '❌ Failed'}`);

  if (crmSuccess || analyticsSuccess) {
    console.log('\n💡 Next Steps:');
    console.log('   1. Get your tenant ID from the database or API');
    console.log('   2. Install plugins for your tenant:');
    console.log(`      POST ${API_BASE_URL}/tenants/{tenantId}/plugins/crm/install`);
    console.log(`      POST ${API_BASE_URL}/tenants/{tenantId}/plugins/analytics/install`);
    console.log('   3. Start the web app: cd apps/web && pnpm dev');
    console.log('   4. Plugins should appear in the sidebar');
  }

  console.log('');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
