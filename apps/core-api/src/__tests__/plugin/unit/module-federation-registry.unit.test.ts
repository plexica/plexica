/**
 * T004-13 Unit Tests: ModuleFederationRegistryService
 *
 * Tests verify that:
 *   - registerRemoteEntry() updates the correct Prisma fields
 *   - getActiveRemoteEntries() filters to only ACTIVE plugins with a non-null URL
 *
 * No live database connection required — all Prisma calls are mocked.
 *
 * Constitution Art. 4.1: ≥80% coverage; Art. 8.2: deterministic, independent.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModuleFederationRegistryService } from '../../../services/module-federation-registry.service.js';
import { db } from '../../../lib/db.js';
import { PluginLifecycleStatus } from '@plexica/database';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../../lib/db', () => ({
  db: {
    plugin: {
      update: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../../../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('T004-13: ModuleFederationRegistryService', () => {
  let svc: ModuleFederationRegistryService;

  beforeEach(() => {
    vi.resetAllMocks();
    svc = new ModuleFederationRegistryService();
  });

  // -----------------------------------------------------------------------
  // registerRemoteEntry()
  // -----------------------------------------------------------------------

  describe('registerRemoteEntry()', () => {
    it('should update remoteEntryUrl and frontendRoutePrefix on the plugin record', async () => {
      vi.mocked(db.plugin.update).mockResolvedValue({} as any);

      await svc.registerRemoteEntry('crm', 'https://cdn.example.com/crm/remoteEntry.js', '/crm');

      expect(db.plugin.update).toHaveBeenCalledWith({
        where: { id: 'crm' },
        data: {
          remoteEntryUrl: 'https://cdn.example.com/crm/remoteEntry.js',
          frontendRoutePrefix: '/crm',
        },
      });
    });

    it('should set frontendRoutePrefix to null when routePrefix is omitted', async () => {
      vi.mocked(db.plugin.update).mockResolvedValue({} as any);

      await svc.registerRemoteEntry('crm', 'https://cdn.example.com/crm/remoteEntry.js');

      expect(db.plugin.update).toHaveBeenCalledWith({
        where: { id: 'crm' },
        data: {
          remoteEntryUrl: 'https://cdn.example.com/crm/remoteEntry.js',
          frontendRoutePrefix: null,
        },
      });
    });

    it('should set frontendRoutePrefix to null when routePrefix is explicitly null', async () => {
      vi.mocked(db.plugin.update).mockResolvedValue({} as any);

      await svc.registerRemoteEntry('crm', 'https://cdn.example.com/crm/remoteEntry.js', null);

      expect(db.plugin.update).toHaveBeenCalledWith({
        where: { id: 'crm' },
        data: {
          remoteEntryUrl: 'https://cdn.example.com/crm/remoteEntry.js',
          frontendRoutePrefix: null,
        },
      });
    });
  });

  // -----------------------------------------------------------------------
  // getActiveRemoteEntries()
  // -----------------------------------------------------------------------

  describe('getActiveRemoteEntries()', () => {
    it('should query only ACTIVE plugins with a non-null remoteEntryUrl', async () => {
      vi.mocked(db.plugin.findMany).mockResolvedValue([]);

      await svc.getActiveRemoteEntries();

      expect(db.plugin.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            lifecycleStatus: PluginLifecycleStatus.ACTIVE,
            remoteEntryUrl: { not: null },
          },
        })
      );
    });

    it('should return mapped RemoteEntry objects for each active plugin', async () => {
      vi.mocked(db.plugin.findMany).mockResolvedValue([
        {
          id: 'crm',
          remoteEntryUrl: 'https://cdn.example.com/crm/remoteEntry.js',
          frontendRoutePrefix: '/crm',
        } as any,
        {
          id: 'hr',
          remoteEntryUrl: 'https://cdn.example.com/hr/remoteEntry.js',
          frontendRoutePrefix: null,
        } as any,
      ]);

      const result = await svc.getActiveRemoteEntries();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        pluginId: 'crm',
        remoteEntryUrl: 'https://cdn.example.com/crm/remoteEntry.js',
        routePrefix: '/crm',
      });
      expect(result[1]).toEqual({
        pluginId: 'hr',
        remoteEntryUrl: 'https://cdn.example.com/hr/remoteEntry.js',
        routePrefix: null,
      });
    });

    it('should return an empty array when no active plugins have a remoteEntryUrl', async () => {
      vi.mocked(db.plugin.findMany).mockResolvedValue([]);

      const result = await svc.getActiveRemoteEntries();

      expect(result).toEqual([]);
    });

    it('should defensively filter out any entry with a null remoteEntryUrl', async () => {
      // Should not happen given the WHERE filter, but guard against it defensively
      vi.mocked(db.plugin.findMany).mockResolvedValue([
        {
          id: 'crm',
          remoteEntryUrl: 'https://cdn.example.com/crm/remoteEntry.js',
          frontendRoutePrefix: null,
        } as any,
        {
          id: 'broken',
          remoteEntryUrl: null, // should be filtered out
          frontendRoutePrefix: null,
        } as any,
      ]);

      const result = await svc.getActiveRemoteEntries();

      expect(result).toHaveLength(1);
      expect(result[0].pluginId).toBe('crm');
    });
  });
});
