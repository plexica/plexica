/**
 * Test script for plugin manifest validation (M2.3 Task 9)
 *
 * Tests the new manifest schema validation with the CRM and Analytics plugins
 */

import { validatePluginManifest } from '../src/schemas/plugin-manifest.schema.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testManifestValidation() {
  console.log('='.repeat(80));
  console.log('Plugin Manifest Validation Test (M2.3 Task 9)');
  console.log('='.repeat(80));
  console.log();

  // Test 1: Validate CRM Plugin Manifest
  console.log('Test 1: Validating CRM Plugin Manifest');
  console.log('-'.repeat(80));

  try {
    const crmManifestPath = join(__dirname, '../../plugin-crm/plugin.json');
    const crmManifestRaw = readFileSync(crmManifestPath, 'utf-8');
    const crmManifest = JSON.parse(crmManifestRaw);

    const crmValidation = validatePluginManifest(crmManifest);

    if (crmValidation.valid) {
      console.log('✅ CRM manifest is VALID');
      console.log('   - Plugin ID:', crmValidation.data?.id);
      console.log('   - Version:', crmValidation.data?.version);
      console.log('   - API Services:', crmValidation.data?.api?.services?.length || 0);
      console.log('   - API Dependencies:', crmValidation.data?.api?.dependencies?.length || 0);

      if (crmValidation.data?.api?.services) {
        console.log('   - Services:');
        for (const service of crmValidation.data.api.services) {
          console.log(
            `     * ${service.name} v${service.version} (${service.endpoints.length} endpoints)`
          );
        }
      }
    } else {
      console.log('❌ CRM manifest is INVALID');
      console.log('   Errors:');
      for (const error of crmValidation.errors || []) {
        console.log(`     - ${error.path}: ${error.message}`);
      }
    }
  } catch (error: any) {
    console.log('❌ Failed to read/parse CRM manifest:', error.message);
  }

  console.log();

  // Test 2: Validate Analytics Plugin Manifest
  console.log('Test 2: Validating Analytics Plugin Manifest');
  console.log('-'.repeat(80));

  try {
    const analyticsManifestPath = join(__dirname, '../../plugin-analytics/plugin.json');
    const analyticsManifestRaw = readFileSync(analyticsManifestPath, 'utf-8');
    const analyticsManifest = JSON.parse(analyticsManifestRaw);

    const analyticsValidation = validatePluginManifest(analyticsManifest);

    if (analyticsValidation.valid) {
      console.log('✅ Analytics manifest is VALID');
      console.log('   - Plugin ID:', analyticsValidation.data?.id);
      console.log('   - Version:', analyticsValidation.data?.version);
      console.log('   - API Services:', analyticsValidation.data?.api?.services?.length || 0);
      console.log(
        '   - API Dependencies:',
        analyticsValidation.data?.api?.dependencies?.length || 0
      );

      if (analyticsValidation.data?.api?.services) {
        console.log('   - Services:');
        for (const service of analyticsValidation.data.api.services) {
          console.log(
            `     * ${service.name} v${service.version} (${service.endpoints.length} endpoints)`
          );
        }
      }

      if (analyticsValidation.data?.api?.dependencies) {
        console.log('   - Dependencies:');
        for (const dep of analyticsValidation.data.api.dependencies) {
          console.log(
            `     * ${dep.pluginId} (${dep.serviceName}) ${dep.version} [${dep.required ? 'REQUIRED' : 'optional'}]`
          );
        }
      }
    } else {
      console.log('❌ Analytics manifest is INVALID');
      console.log('   Errors:');
      for (const error of analyticsValidation.errors || []) {
        console.log(`     - ${error.path}: ${error.message}`);
      }
    }
  } catch (error: any) {
    console.log('❌ Failed to read/parse Analytics manifest:', error.message);
  }

  console.log();

  // Test 3: Test invalid manifest (missing required fields)
  console.log('Test 3: Testing Invalid Manifest (should fail)');
  console.log('-'.repeat(80));

  const invalidManifest = {
    id: 'invalid-plugin', // Missing 'plugin-' prefix
    name: 'Test',
    version: 'not-semver', // Invalid semver
    description: 'Too short', // Too short
    author: 'Test',
    api: {
      services: [
        {
          name: 'invalid', // Invalid format (should be plugin.resource)
          version: '1.0.0',
          endpoints: [], // No endpoints (should have at least 1)
        },
      ],
    },
  };

  const invalidValidation = validatePluginManifest(invalidManifest);

  if (!invalidValidation.valid) {
    console.log('✅ Validation correctly REJECTED invalid manifest');
    console.log('   Errors found:', invalidValidation.errors?.length || 0);
    for (const error of (invalidValidation.errors || []).slice(0, 5)) {
      console.log(`     - ${error.path}: ${error.message}`);
    }
    if ((invalidValidation.errors?.length || 0) > 5) {
      console.log(`     ... and ${(invalidValidation.errors?.length || 0) - 5} more errors`);
    }
  } else {
    console.log('❌ Validation should have REJECTED this manifest!');
  }

  console.log();
  console.log('='.repeat(80));
  console.log('Test Complete');
  console.log('='.repeat(80));
}

// Run tests
testManifestValidation().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
