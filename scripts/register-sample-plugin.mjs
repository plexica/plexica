#!/usr/bin/env node
/**
 * Test script to register the sample analytics plugin
 * This bypasses auth for testing purposes
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read the plugin manifest
const pluginManifest = JSON.parse(
  readFileSync(join(__dirname, '../plugins/sample-analytics/plugin.json'), 'utf-8')
);

// Make HTTP request to register plugin
const response = await fetch('http://localhost:3000/api/plugins', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(pluginManifest),
});

if (response.ok) {
  const data = await response.json();
  console.log('✅ Plugin registered successfully:');
  console.log(JSON.stringify(data, null, 2));
} else {
  const error = await response.json();
  console.error('❌ Failed to register plugin:');
  console.error(JSON.stringify(error, null, 2));
  process.exit(1);
}
