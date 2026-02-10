/**
 * Integration Tests Setup
 *
 * Setup for integration tests - requires database and Keycloak
 */

import { createTestSetup } from './shared-setup.js';

createTestSetup({ label: 'Integration' });
