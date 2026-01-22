/**
 * Plugin Manifest Schema Tests (M2.3 Task 11)
 *
 * Unit tests for validating plugin manifest schemas
 */

import { describe, it, expect } from 'vitest';
import {
  validatePluginManifest,
  validatePluginApiSection,
  PluginApiServiceSchema,
  PluginApiDependencySchema,
  PluginApiEndpointSchema,
} from '../../schemas/plugin-manifest.schema.js';

describe('Plugin Manifest Schema Validation', () => {
  describe('validatePluginManifest', () => {
    it('should validate a valid minimal manifest', () => {
      const manifest = {
        id: 'plugin-test',
        name: 'Test Plugin',
        version: '1.0.0',
        description: 'A test plugin',
      };

      const result = validatePluginManifest(manifest);

      expect(result.valid).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.errors).toBeUndefined();
    });

    it('should validate CRM plugin manifest with API section', () => {
      const manifest = {
        id: 'plugin-crm',
        name: 'CRM Plugin',
        version: '1.0.0',
        description: 'Customer Relationship Management plugin',
        api: {
          services: [
            {
              name: 'crm.contacts',
              version: '1.0.0',
              description: 'Manage customer contacts',
              endpoints: [
                { method: 'GET', path: '/contacts' },
                { method: 'POST', path: '/contacts' },
                { method: 'GET', path: '/contacts/:id' },
              ],
            },
          ],
        },
      };

      const result = validatePluginManifest(manifest);

      expect(result.valid).toBe(true);
      expect(result.data?.api?.services).toHaveLength(1);
    });

    it('should validate Analytics plugin with dependencies', () => {
      const manifest = {
        id: 'plugin-analytics',
        name: 'Analytics Plugin',
        version: '1.0.0',
        description: 'Analytics and reporting',
        api: {
          dependencies: [
            {
              pluginId: 'plugin-crm',
              serviceName: 'crm.contacts',
              version: '^1.0.0',
              required: true,
              reason: 'Needs CRM data for reports',
            },
          ],
        },
      };

      const result = validatePluginManifest(manifest);

      expect(result.valid).toBe(true);
      expect(result.data?.api?.dependencies).toHaveLength(1);
    });

    it('should reject invalid plugin ID format', () => {
      const manifest = {
        id: 'invalid-id', // Missing 'plugin-' prefix
        name: 'Test Plugin',
        version: '1.0.0',
        description: 'Test',
      };

      const result = validatePluginManifest(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.some((e) => e.path === 'id')).toBe(true);
    });

    it('should reject invalid semver version', () => {
      const manifest = {
        id: 'plugin-test',
        name: 'Test Plugin',
        version: 'v1.0', // Invalid semver
        description: 'Test',
      };

      const result = validatePluginManifest(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors?.some((e) => e.path === 'version')).toBe(true);
    });

    it('should reject manifest missing required fields', () => {
      const manifest = {
        id: 'plugin-test',
        name: 'Test Plugin',
        // Missing version and description
      };

      const result = validatePluginManifest(manifest);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe('PluginApiServiceSchema', () => {
    it('should validate valid service definition', () => {
      const service = {
        name: 'crm.contacts',
        version: '1.0.0',
        description: 'Contact management',
        endpoints: [
          { method: 'GET', path: '/contacts' },
          { method: 'POST', path: '/contacts' },
        ],
      };

      const result = PluginApiServiceSchema.safeParse(service);

      expect(result.success).toBe(true);
    });

    it('should require at least one endpoint', () => {
      const service = {
        name: 'crm.contacts',
        version: '1.0.0',
        endpoints: [], // Empty array
      };

      const result = PluginApiServiceSchema.safeParse(service);

      expect(result.success).toBe(false);
    });

    it('should reject invalid service name format', () => {
      const service = {
        name: 'invalid-name', // Should be {plugin}.{resource}
        version: '1.0.0',
        endpoints: [{ method: 'GET', path: '/' }],
      };

      const result = PluginApiServiceSchema.safeParse(service);

      expect(result.success).toBe(false);
    });

    it('should allow optional baseUrl', () => {
      const service = {
        name: 'crm.contacts',
        version: '1.0.0',
        baseUrl: 'http://localhost:3100',
        endpoints: [{ method: 'GET', path: '/contacts' }],
      };

      const result = PluginApiServiceSchema.safeParse(service);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.baseUrl).toBe('http://localhost:3100');
      }
    });

    it('should allow metadata', () => {
      const service = {
        name: 'crm.contacts',
        version: '1.0.0',
        endpoints: [{ method: 'GET', path: '/contacts' }],
        metadata: {
          rateLimit: 1000,
          cacheTTL: 300,
        },
      };

      const result = PluginApiServiceSchema.safeParse(service);

      expect(result.success).toBe(true);
    });
  });

  describe('PluginApiDependencySchema', () => {
    it('should validate valid dependency', () => {
      const dependency = {
        pluginId: 'plugin-crm',
        serviceName: 'crm.contacts',
        version: '^1.0.0',
        required: true,
      };

      const result = PluginApiDependencySchema.safeParse(dependency);

      expect(result.success).toBe(true);
    });

    it('should validate semver constraints', () => {
      const validConstraints = ['^1.0.0', '~2.3.4', '>=1.0.0', '>1.0.0', '1.0.0'];

      validConstraints.forEach((version) => {
        const dependency = {
          pluginId: 'plugin-test',
          version,
          required: true,
        };

        const result = PluginApiDependencySchema.safeParse(dependency);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid plugin ID', () => {
      const dependency = {
        pluginId: 'invalid', // Missing 'plugin-' prefix
        version: '^1.0.0',
        required: true,
      };

      const result = PluginApiDependencySchema.safeParse(dependency);

      expect(result.success).toBe(false);
    });

    it('should reject invalid version constraint', () => {
      const dependency = {
        pluginId: 'plugin-test',
        version: 'latest', // Not a valid semver constraint
        required: true,
      };

      const result = PluginApiDependencySchema.safeParse(dependency);

      expect(result.success).toBe(false);
    });

    it('should allow optional serviceName', () => {
      const dependency = {
        pluginId: 'plugin-crm',
        version: '^1.0.0',
        required: true,
        // serviceName is optional
      };

      const result = PluginApiDependencySchema.safeParse(dependency);

      expect(result.success).toBe(true);
    });

    it('should allow optional reason', () => {
      const dependency = {
        pluginId: 'plugin-crm',
        version: '^1.0.0',
        required: false,
        reason: 'Optional integration with CRM',
      };

      const result = PluginApiDependencySchema.safeParse(dependency);

      expect(result.success).toBe(true);
    });
  });

  describe('PluginApiEndpointSchema', () => {
    it('should validate valid endpoints', () => {
      const validEndpoints = [
        { method: 'GET', path: '/contacts' },
        { method: 'POST', path: '/contacts' },
        { method: 'PUT', path: '/contacts/:id' },
        { method: 'PATCH', path: '/contacts/:id' },
        { method: 'DELETE', path: '/contacts/:id' },
      ];

      validEndpoints.forEach((endpoint) => {
        const result = PluginApiEndpointSchema.safeParse(endpoint);
        expect(result.success).toBe(true);
      });
    });

    it('should require path to start with /', () => {
      const endpoint = {
        method: 'GET',
        path: 'contacts', // Missing leading /
      };

      const result = PluginApiEndpointSchema.safeParse(endpoint);

      expect(result.success).toBe(false);
    });

    it('should allow path parameters', () => {
      const endpoint = {
        method: 'GET',
        path: '/contacts/:id/deals/:dealId',
      };

      const result = PluginApiEndpointSchema.safeParse(endpoint);

      expect(result.success).toBe(true);
    });

    it('should allow optional description', () => {
      const endpoint = {
        method: 'GET',
        path: '/contacts',
        description: 'List all contacts',
      };

      const result = PluginApiEndpointSchema.safeParse(endpoint);

      expect(result.success).toBe(true);
    });

    it('should allow optional permissions array', () => {
      const endpoint = {
        method: 'POST',
        path: '/contacts',
        permissions: ['contacts.create', 'contacts.write'],
      };

      const result = PluginApiEndpointSchema.safeParse(endpoint);

      expect(result.success).toBe(true);
    });

    it('should allow optional metadata', () => {
      const endpoint = {
        method: 'GET',
        path: '/contacts',
        metadata: {
          rateLimit: 100,
          cache: true,
        },
      };

      const result = PluginApiEndpointSchema.safeParse(endpoint);

      expect(result.success).toBe(true);
    });
  });

  describe('validatePluginApiSection', () => {
    it('should validate valid API section', () => {
      const api = {
        services: [
          {
            name: 'crm.contacts',
            version: '1.0.0',
            endpoints: [{ method: 'GET', path: '/contacts' }],
          },
        ],
        dependencies: [
          {
            pluginId: 'plugin-auth',
            version: '^2.0.0',
            required: true,
          },
        ],
      };

      const result = validatePluginApiSection(api);

      expect(result.valid).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should allow empty API section', () => {
      const api = {};

      const result = validatePluginApiSection(api);

      expect(result.valid).toBe(true);
    });

    it('should allow only services', () => {
      const api = {
        services: [
          {
            name: 'crm.contacts',
            version: '1.0.0',
            endpoints: [{ method: 'GET', path: '/contacts' }],
          },
        ],
      };

      const result = validatePluginApiSection(api);

      expect(result.valid).toBe(true);
    });

    it('should allow only dependencies', () => {
      const api = {
        dependencies: [
          {
            pluginId: 'plugin-crm',
            version: '^1.0.0',
            required: true,
          },
        ],
      };

      const result = validatePluginApiSection(api);

      expect(result.valid).toBe(true);
    });

    it('should reject invalid service in API section', () => {
      const api = {
        services: [
          {
            name: 'invalid name', // Invalid service name format
            version: '1.0.0',
            endpoints: [{ method: 'GET', path: '/test' }],
          },
        ],
      };

      const result = validatePluginApiSection(api);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe('Real-world manifest validation', () => {
    it('should validate actual CRM plugin.json', () => {
      const crmManifest = {
        id: 'plugin-crm',
        name: 'CRM Plugin',
        version: '1.0.0',
        description: 'Customer Relationship Management - Manage contacts and deals',
        category: 'Business',
        author: 'Plexica Team',
        license: 'MIT',
        api: {
          services: [
            {
              name: 'crm.contacts',
              version: '1.0.0',
              description: 'Contact management API',
              endpoints: [
                { method: 'GET', path: '/contacts', description: 'List contacts' },
                { method: 'POST', path: '/contacts', description: 'Create contact' },
              ],
            },
            {
              name: 'crm.deals',
              version: '1.0.0',
              description: 'Deal management API',
              endpoints: [
                { method: 'GET', path: '/deals', description: 'List deals' },
                { method: 'POST', path: '/deals', description: 'Create deal' },
              ],
            },
          ],
        },
      };

      const result = validatePluginManifest(crmManifest);

      expect(result.valid).toBe(true);
    });

    it('should validate actual Analytics plugin.json', () => {
      const analyticsManifest = {
        id: 'plugin-analytics',
        name: 'Analytics Plugin',
        version: '1.0.0',
        description: 'Business Analytics and Reporting',
        category: 'Analytics',
        author: 'Plexica Team',
        license: 'MIT',
        api: {
          services: [
            {
              name: 'analytics.reports',
              version: '1.0.0',
              description: 'Report generation API',
              endpoints: [
                { method: 'GET', path: '/reports', description: 'List reports' },
                { method: 'POST', path: '/reports/:id/run', description: 'Run report' },
              ],
            },
          ],
          dependencies: [
            {
              pluginId: 'plugin-crm',
              serviceName: 'crm.contacts',
              version: '^1.0.0',
              required: true,
              reason: 'Analyzes CRM contacts data',
            },
            {
              pluginId: 'plugin-crm',
              serviceName: 'crm.deals',
              version: '^1.0.0',
              required: true,
              reason: 'Generates deal pipeline reports',
            },
          ],
        },
      };

      const result = validatePluginManifest(analyticsManifest);

      expect(result.valid).toBe(true);
    });
  });
});
