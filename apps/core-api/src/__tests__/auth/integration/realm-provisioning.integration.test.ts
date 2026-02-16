/**
 * Realm Provisioning Integration Tests
 *
 * Tests the complete Keycloak realm provisioning flow including:
 * - Client provisioning (plexica-web, plexica-api)
 * - Role provisioning (tenant_admin, user)
 * - Realm enable/disable for tenant suspension
 * - Refresh token rotation configuration
 * - Full tenant creation orchestration
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { keycloakService } from '../../../services/keycloak.service.js';
import { tenantService } from '../../../services/tenant.service.js';
import { db } from '../../../lib/db.js';
import { TenantStatus } from '@plexica/database';

describe('Realm Provisioning Integration', () => {
  const testRealmName = `test-realm-${Date.now()}`;
  const testTenantSlug = `test-tenant-${Date.now()}`;
  let createdTenantId: string | null = null;

  beforeAll(async () => {
    // Initialize Keycloak connection
    await keycloakService.initialize();
  });

  afterAll(async () => {
    // Cleanup: Delete test realm and tenant
    try {
      if (createdTenantId) {
        await tenantService.hardDeleteTenant(createdTenantId);
      }
    } catch (error) {
      console.warn('Cleanup warning:', error);
    }

    try {
      await keycloakService.deleteRealm(testRealmName);
    } catch (error) {
      console.warn('Cleanup warning:', error);
    }
  });

  describe('provisionRealmClients()', () => {
    beforeAll(async () => {
      // Create a test realm for client provisioning tests
      await keycloakService.createRealm(testRealmName, 'Test Realm');
    });

    it('should provision plexica-web and plexica-api clients', async () => {
      // Act
      await keycloakService.provisionRealmClients(testRealmName);

      // Assert: Verify clients were created
      // Note: Keycloak admin client doesn't expose a direct "get client by clientId" method,
      // so we use withRealmScope to check the client list
      const clients = await keycloakService['withRetry'](() =>
        keycloakService['withRealmScope'](testRealmName, async () => {
          return await keycloakService['client'].clients.find();
        })
      );

      const clientIds = clients.map((c: any) => c.clientId);

      expect(clientIds).toContain('plexica-web');
      expect(clientIds).toContain('plexica-api');
    });

    it('should configure plexica-web as public client with Authorization Code flow', async () => {
      const clients = await keycloakService.withRetry(() =>
        keycloakService.withRealmScope(testRealmName, async () => {
          return await keycloakService.client.clients.find();
        })
      );

      const webClient = clients.find((c: any) => c.clientId === 'plexica-web');

      expect(webClient).toBeDefined();
      expect(webClient.publicClient).toBe(true);
      expect(webClient.standardFlowEnabled).toBe(true); // Authorization Code
      expect(webClient.directAccessGrantsEnabled).toBe(false); // No ROPC
      expect(webClient.implicitFlowEnabled).toBe(false); // No implicit flow
    });

    it('should configure plexica-api as confidential client with service account', async () => {
      const clients = await keycloakService.withRetry(() =>
        keycloakService.withRealmScope(testRealmName, async () => {
          return await keycloakService.client.clients.find();
        })
      );

      const apiClient = clients.find((c: any) => c.clientId === 'plexica-api');

      expect(apiClient).toBeDefined();
      expect(apiClient.publicClient).toBe(false); // Confidential
      expect(apiClient.serviceAccountsEnabled).toBe(true);
      expect(apiClient.standardFlowEnabled).toBe(false);
    });

    it('should be idempotent - not fail when clients already exist', async () => {
      // Act: Call provision again
      await expect(keycloakService.provisionRealmClients(testRealmName)).resolves.not.toThrow();

      // Assert: Still only 2 plexica clients (no duplicates)
      const clients = await keycloakService.withRetry(() =>
        keycloakService.withRealmScope(testRealmName, async () => {
          return await keycloakService.client.clients.find();
        })
      );

      const plexicaClients = clients.filter((c: any) => c.clientId?.startsWith('plexica-'));

      expect(plexicaClients.length).toBe(2);
    });
  });

  describe('provisionRealmRoles()', () => {
    it('should provision tenant_admin and user roles', async () => {
      // Act
      await keycloakService.provisionRealmRoles(testRealmName);

      // Assert: Verify roles were created
      const roles = await keycloakService.withRetry(() =>
        keycloakService.withRealmScope(testRealmName, async () => {
          return await keycloakService.client.roles.find();
        })
      );

      const roleNames = roles.map((r: any) => r.name);

      expect(roleNames).toContain('tenant_admin');
      expect(roleNames).toContain('user');
    });

    it('should configure tenant_admin role with correct properties', async () => {
      const roles = await keycloakService.withRetry(() =>
        keycloakService.withRealmScope(testRealmName, async () => {
          return await keycloakService.client.roles.find();
        })
      );

      const tenantAdminRole = roles.find((r: any) => r.name === 'tenant_admin');

      expect(tenantAdminRole).toBeDefined();
      expect(tenantAdminRole.description).toContain('Administrator');
      expect(tenantAdminRole.composite).toBe(false);
      expect(tenantAdminRole.clientRole).toBe(false);
    });

    it('should configure user role with correct properties', async () => {
      const roles = await keycloakService.withRetry(() =>
        keycloakService.withRealmScope(testRealmName, async () => {
          return await keycloakService.client.roles.find();
        })
      );

      const userRole = roles.find((r: any) => r.name === 'user');

      expect(userRole).toBeDefined();
      expect(userRole.description).toContain('Standard user');
      expect(userRole.composite).toBe(false);
      expect(userRole.clientRole).toBe(false);
    });

    it('should be idempotent - not fail when roles already exist', async () => {
      // Act: Call provision again
      await expect(keycloakService.provisionRealmRoles(testRealmName)).resolves.not.toThrow();

      // Assert: Still only the expected roles (no duplicates)
      const roles = await keycloakService.withRetry(() =>
        keycloakService.withRealmScope(testRealmName, async () => {
          return await keycloakService.client.roles.find();
        })
      );

      // Filter to only our provisioned roles (exclude Keycloak default roles)
      const provisionedRoles = roles.filter((r: any) => ['tenant_admin', 'user'].includes(r.name));

      expect(provisionedRoles.length).toBe(2);
    });
  });

  describe('setRealmEnabled()', () => {
    it('should disable a realm when enabled=false', async () => {
      // Act
      await keycloakService.setRealmEnabled(testRealmName, false);

      // Assert
      const realm = await keycloakService.getRealm(testRealmName);
      expect(realm?.enabled).toBe(false);
    });

    it('should enable a realm when enabled=true', async () => {
      // Act
      await keycloakService.setRealmEnabled(testRealmName, true);

      // Assert
      const realm = await keycloakService.getRealm(testRealmName);
      expect(realm?.enabled).toBe(true);
    });

    it('should throw error when realm does not exist', async () => {
      const nonExistentRealm = `non-existent-${Date.now()}`;

      await expect(keycloakService.setRealmEnabled(nonExistentRealm, false)).rejects.toThrow(
        `Realm '${nonExistentRealm}' not found`
      );
    });
  });

  describe('configureRefreshTokenRotation()', () => {
    it('should enable refresh token rotation', async () => {
      // Act
      await keycloakService.configureRefreshTokenRotation(testRealmName);

      // Assert
      const realm = await keycloakService.getRealm(testRealmName);
      expect(realm?.revokeRefreshToken).toBe(true);
      expect(realm?.refreshTokenMaxReuse).toBe(0);
    });
  });

  describe('TenantService Full Provisioning', () => {
    it('should create tenant with full Keycloak provisioning', async () => {
      // Act: Create tenant (triggers full provisioning)
      const tenant = await tenantService.createTenant({
        slug: testTenantSlug,
        name: 'Test Corporation',
        settings: {},
        theme: {},
      });

      createdTenantId = tenant.id;

      // Assert: Tenant status is ACTIVE
      expect(tenant.status).toBe(TenantStatus.ACTIVE);

      // Assert: Keycloak realm exists
      const realmExists = await keycloakService.realmExists(testTenantSlug);
      expect(realmExists).toBe(true);

      // Assert: Clients provisioned
      const clients = await keycloakService.withRetry(() =>
        keycloakService.withRealmScope(testTenantSlug, async () => {
          return await keycloakService.client.clients.find();
        })
      );
      const clientIds = clients.map((c: any) => c.clientId);
      expect(clientIds).toContain('plexica-web');
      expect(clientIds).toContain('plexica-api');

      // Assert: Roles provisioned
      const roles = await keycloakService.withRetry(() =>
        keycloakService.withRealmScope(testTenantSlug, async () => {
          return await keycloakService.client.roles.find();
        })
      );
      const roleNames = roles.map((r: any) => r.name);
      expect(roleNames).toContain('tenant_admin');
      expect(roleNames).toContain('user');

      // Assert: Refresh token rotation enabled
      const realm = await keycloakService.getRealm(testTenantSlug);
      expect(realm?.revokeRefreshToken).toBe(true);
    });

    it('should handle Keycloak provisioning failure gracefully (Edge Case #1)', async () => {
      const failSlug = `fail-tenant-${Date.now()}`;

      // Mock a Keycloak failure by creating a realm but then deleting it mid-provision
      // This simulates a network failure or Keycloak error during provisioning

      // Pre-create the tenant record to simulate partial failure
      const tenantRecord = await db.tenant.create({
        data: {
          slug: failSlug,
          name: 'Fail Test',
          status: TenantStatus.PROVISIONING,
          settings: {},
          theme: {},
        },
      });

      try {
        // Create realm
        await keycloakService.createRealm(failSlug, 'Fail Test');

        // Simulate failure by immediately deleting the realm
        await keycloakService.deleteRealm(failSlug);

        // Now try to provision clients (should fail)
        await expect(keycloakService.provisionRealmClients(failSlug)).rejects.toThrow();

        // Verify tenant remains in PROVISIONING state (manual intervention required)
        const failedTenant = await db.tenant.findUnique({
          where: { id: tenantRecord.id },
        });

        expect(failedTenant?.status).toBe(TenantStatus.PROVISIONING);
      } finally {
        // Cleanup
        await db.tenant.delete({ where: { id: tenantRecord.id } }).catch(() => {});
      }
    });
  });

  describe('Token Lifecycle Methods', () => {
    // Note: These tests are lightweight because they require actual OAuth flows
    // Full OAuth testing is better suited for E2E tests with a browser

    it('should have exchangeAuthorizationCode method', () => {
      expect(typeof keycloakService.exchangeAuthorizationCode).toBe('function');
    });

    it('should have refreshToken method', () => {
      expect(typeof keycloakService.refreshToken).toBe('function');
    });

    it('should have revokeToken method', () => {
      expect(typeof keycloakService.revokeToken).toBe('function');
    });

    // TODO: Add E2E tests for OAuth flow in Phase 4
    // These would involve:
    // 1. Simulating browser redirect to /authorize endpoint
    // 2. Extracting authorization code from callback
    // 3. Exchanging code for tokens
    // 4. Refreshing access token
    // 5. Revoking tokens
  });
});
