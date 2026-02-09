/**
 * E2E Tests Setup
 *
 * Setup for E2E tests - full stack with all services
 */

import { createTestSetup } from './shared-setup.js';

createTestSetup({
  label: 'E2E',
  extraLogs: () => {
    console.log(`  - API: ${process.env.API_HOST}:${process.env.API_PORT}`);
  },
});
