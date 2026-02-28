/**
 * T004-12 & T004-14 Unit Tests:
 *   T004-12 — Redpanda topic wiring in PluginLifecycleService.activatePlugin()
 *   T004-14 — Translation namespace loading in PluginLifecycleService.activatePlugin()
 *
 * Tests inject mock TopicManager and TranslationService via the constructor.
 * No live Redpanda, Redis, or filesystem access is required.
 *
 * Constitution Art. 4.1: ≥80% coverage; Art. 8.2: deterministic, independent tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PluginLifecycleService } from '../../../services/plugin.service.js';
import { NullContainerAdapter } from '../../../lib/container-adapter.js';
import type { TenantMigrationService } from '../../../services/tenant-migration.service.js';
import type { TopicManager } from '@plexica/event-bus';
import type { TranslationService } from '../../../modules/i18n/i18n.service.js';
import { db } from '../../../lib/db.js';
import { PluginLifecycleStatus } from '@plexica/database';

// ---------------------------------------------------------------------------
// Module mocks — keep identical to the pattern in plugin-container-adapter.unit.test.ts
// ---------------------------------------------------------------------------

vi.mock('../../../lib/db', () => ({
  db: {
    plugin: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    tenantPlugin: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../../lib/redis', () => ({
  redis: { get: vi.fn(), set: vi.fn() },
}));

vi.mock('../../../modules/authorization/permission-registration.service', () => ({
  permissionRegistrationService: {
    registerPluginPermissions: vi.fn().mockResolvedValue(undefined),
    removePluginPermissions: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../services/tenant.service', () => ({
  tenantService: { getSchemaName: vi.fn().mockReturnValue('tenant_test') },
}));

vi.mock('../../../services/service-registry.service', () => ({
  ServiceRegistryService: class {
    registerService = vi.fn().mockResolvedValue(undefined);
    deregisterService = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock('../../../services/dependency-resolution.service', () => ({
  DependencyResolutionService: class {
    registerDependencies = vi.fn().mockResolvedValue(undefined);
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal valid plugin manifest */
function buildManifest(id = 'crm') {
  return {
    id,
    name: 'CRM Plugin',
    version: '1.0.0',
    description: 'A CRM plugin for unit testing purposes',
    category: 'analytics',
    metadata: { license: 'MIT', author: { name: 'Tester' } },
  };
}

/** Build a mock TenantMigrationService */
function buildMigrationService(): TenantMigrationService {
  return {
    runPluginMigrations: vi.fn().mockResolvedValue([]),
    rollbackPluginMigrations: vi.fn().mockResolvedValue(undefined),
  } as unknown as TenantMigrationService;
}

/** Build a mock TopicManager with spied createTopic and buildPluginTopicName */
function buildTopicManager(): TopicManager {
  return {
    buildPluginTopicName: vi.fn(
      (pluginId: string, eventName: string) => `plugin.${pluginId}.${eventName}`
    ),
    createTopic: vi.fn().mockResolvedValue(undefined),
  } as unknown as TopicManager;
}

/** Build a mock TranslationService */
function buildTranslationService(): TranslationService {
  return {
    loadNamespaceFile: vi.fn().mockResolvedValue(undefined),
  } as unknown as TranslationService;
}

/** Wire up the common db mock responses for a successful activatePlugin() call */
function wireActivatePluginMocks(tenantId: string, pluginId: string, manifest: object) {
  // tenantPlugin.findUnique → installed but not yet enabled
  vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue({
    tenantId,
    pluginId,
    enabled: false,
    plugin: { manifest, lifecycleStatus: PluginLifecycleStatus.INSTALLED } as any,
  } as any);

  // transitionLifecycleStatus(ACTIVE): plugin.findUnique → INSTALLED, then update
  vi.mocked(db.plugin.findUnique).mockResolvedValue({
    lifecycleStatus: PluginLifecycleStatus.INSTALLED,
  } as any);
  vi.mocked(db.plugin.update).mockResolvedValue({} as any);

  // tenantPlugin.update → returns enabled installation
  vi.mocked(db.tenantPlugin.update).mockResolvedValue({
    tenantId,
    pluginId,
    enabled: true,
    plugin: manifest,
  } as any);
}

// ---------------------------------------------------------------------------
// T004-12: Redpanda topic wiring
// ---------------------------------------------------------------------------

describe('T004-12: PluginLifecycleService — Redpanda topic wiring', () => {
  const tenantId = '__global__';
  const pluginId = 'crm';

  let topicManager: TopicManager;
  let svc: PluginLifecycleService;

  beforeEach(() => {
    vi.resetAllMocks();
    topicManager = buildTopicManager();
    svc = new PluginLifecycleService(
      undefined, // logger
      new NullContainerAdapter(), // adapter (no Docker)
      buildMigrationService(), // migrationService
      topicManager, // T004-12
      null // translationService (not under test here)
    );
  });

  it('should call createTopic with correct name for a published event', async () => {
    const manifest = {
      ...buildManifest(pluginId),
      events: { publishes: ['deal.won'] },
    };
    wireActivatePluginMocks(tenantId, pluginId, manifest);

    await svc.activatePlugin(tenantId, pluginId);

    expect(topicManager.buildPluginTopicName).toHaveBeenCalledWith(pluginId, 'deal.won');
    expect(topicManager.createTopic).toHaveBeenCalledWith('plugin.crm.deal.won');
  });

  it('should call createTopic for both publishes and subscribes events', async () => {
    const manifest = {
      ...buildManifest(pluginId),
      events: {
        publishes: ['deal.won', 'deal.lost'],
        subscribes: ['contact.created'],
      },
    };
    wireActivatePluginMocks(tenantId, pluginId, manifest);

    await svc.activatePlugin(tenantId, pluginId);

    expect(topicManager.createTopic).toHaveBeenCalledTimes(3);
    expect(topicManager.createTopic).toHaveBeenCalledWith('plugin.crm.deal.won');
    expect(topicManager.createTopic).toHaveBeenCalledWith('plugin.crm.deal.lost');
    expect(topicManager.createTopic).toHaveBeenCalledWith('plugin.crm.contact.created');
  });

  it('should NOT reject activatePlugin when createTopic throws (fail-open)', async () => {
    const manifest = {
      ...buildManifest(pluginId),
      events: { publishes: ['deal.won'] },
    };
    wireActivatePluginMocks(tenantId, pluginId, manifest);

    // Simulate Redpanda being unavailable
    vi.mocked(topicManager.createTopic).mockRejectedValue(new Error('Redpanda unavailable'));

    // activatePlugin must NOT throw even though createTopic fails
    await expect(svc.activatePlugin(tenantId, pluginId)).resolves.not.toThrow();
  });

  it('should skip topic creation when topicManager is null', async () => {
    const svcNoTopics = new PluginLifecycleService(
      undefined,
      new NullContainerAdapter(),
      buildMigrationService(),
      null, // no topic manager
      null
    );
    const manifest = {
      ...buildManifest(pluginId),
      events: { publishes: ['deal.won'] },
    };
    wireActivatePluginMocks(tenantId, pluginId, manifest);

    // Must not throw and topicManager is not called (it's null — no reference error)
    await expect(svcNoTopics.activatePlugin(tenantId, pluginId)).resolves.not.toThrow();
  });

  it('should skip topic creation when manifest has no events field', async () => {
    const manifest = buildManifest(pluginId); // no events field
    wireActivatePluginMocks(tenantId, pluginId, manifest);

    await svc.activatePlugin(tenantId, pluginId);

    expect(topicManager.createTopic).not.toHaveBeenCalled();
  });

  it('should still transition plugin to ACTIVE even when topic creation fails', async () => {
    const manifest = {
      ...buildManifest(pluginId),
      events: { publishes: ['deal.won'] },
    };
    wireActivatePluginMocks(tenantId, pluginId, manifest);
    vi.mocked(topicManager.createTopic).mockRejectedValue(new Error('Redpanda down'));

    await svc.activatePlugin(tenantId, pluginId);

    // INSTALLED → ACTIVE lifecycle transition must still have happened
    expect(db.plugin.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lifecycleStatus: PluginLifecycleStatus.ACTIVE } })
    );
    expect(db.tenantPlugin.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { enabled: true } })
    );
  });

  it('should NOT delete topics on deactivatePlugin (data preservation, ADR-005)', async () => {
    // Wire deactivatePlugin mocks: plugin is installed and enabled
    vi.mocked(db.tenantPlugin.findUnique).mockResolvedValue({
      tenantId,
      pluginId,
      enabled: true,
      plugin: {
        manifest: buildManifest(pluginId),
        lifecycleStatus: PluginLifecycleStatus.ACTIVE,
      } as any,
    } as any);
    // $transaction must execute the callback for the TOCTOU-safe logic to run
    vi.mocked(db.$transaction).mockImplementation(async (fn: any) => fn(db));
    // deactivatePlugin guard: no other tenants have plugin enabled (0 → will transition & stop)
    vi.mocked(db.tenantPlugin.count).mockResolvedValueOnce(0);
    vi.mocked(db.plugin.findUnique).mockResolvedValue({
      lifecycleStatus: PluginLifecycleStatus.ACTIVE,
    } as any);
    vi.mocked(db.plugin.update).mockResolvedValue({} as any);
    vi.mocked(db.tenantPlugin.update).mockResolvedValue({
      tenantId,
      pluginId,
      enabled: false,
      plugin: buildManifest(pluginId),
    } as any);

    // Post-tx re-fetch for return value
    vi.mocked(db.tenantPlugin.findUniqueOrThrow).mockResolvedValue({
      tenantId,
      pluginId,
      enabled: false,
      plugin: buildManifest(pluginId),
    } as any);

    await svc.deactivatePlugin(tenantId, pluginId);

    // createTopic should NOT be called during deactivation
    expect(topicManager.createTopic).not.toHaveBeenCalled();
    // TopicManager has no deleteTopic method — but verify no topic-related calls happened
    expect(topicManager.buildPluginTopicName).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T004-14: Translation namespace loading
// ---------------------------------------------------------------------------

describe('T004-14: PluginLifecycleService — translation namespace loading', () => {
  const tenantId = '__global__';
  const pluginId = 'crm';

  let translationService: TranslationService;
  let svc: PluginLifecycleService;

  beforeEach(() => {
    vi.resetAllMocks();
    translationService = buildTranslationService();
    svc = new PluginLifecycleService(
      undefined,
      new NullContainerAdapter(),
      buildMigrationService(),
      null, // topicManager (not under test here)
      translationService // T004-14
    );
  });

  it('should call loadNamespaceFile for each namespace × locale combination', async () => {
    const manifest = {
      ...buildManifest(pluginId),
      translations: {
        namespaces: ['crm', 'crm-admin'],
        supportedLocales: ['en', 'de'],
      },
    };
    wireActivatePluginMocks(tenantId, pluginId, manifest);

    await svc.activatePlugin(tenantId, pluginId);

    // 2 namespaces × 2 locales = 4 calls
    expect(translationService.loadNamespaceFile).toHaveBeenCalledTimes(4);
    expect(translationService.loadNamespaceFile).toHaveBeenCalledWith('en', 'crm');
    expect(translationService.loadNamespaceFile).toHaveBeenCalledWith('de', 'crm');
    expect(translationService.loadNamespaceFile).toHaveBeenCalledWith('en', 'crm-admin');
    expect(translationService.loadNamespaceFile).toHaveBeenCalledWith('de', 'crm-admin');
  });

  it('should NOT reject activatePlugin when loadNamespaceFile throws (fail-open)', async () => {
    const manifest = {
      ...buildManifest(pluginId),
      translations: {
        namespaces: ['crm'],
        supportedLocales: ['en'],
      },
    };
    wireActivatePluginMocks(tenantId, pluginId, manifest);

    vi.mocked(translationService.loadNamespaceFile).mockRejectedValue(
      new Error('Translation file not found')
    );

    await expect(svc.activatePlugin(tenantId, pluginId)).resolves.not.toThrow();
  });

  it('should skip translation loading when translationService is null', async () => {
    const svcNoI18n = new PluginLifecycleService(
      undefined,
      new NullContainerAdapter(),
      buildMigrationService(),
      null,
      null // no translation service
    );
    const manifest = {
      ...buildManifest(pluginId),
      translations: { namespaces: ['crm'], supportedLocales: ['en'] },
    };
    wireActivatePluginMocks(tenantId, pluginId, manifest);

    await expect(svcNoI18n.activatePlugin(tenantId, pluginId)).resolves.not.toThrow();
  });

  it('should skip translation loading when manifest has no translations field', async () => {
    const manifest = buildManifest(pluginId); // no translations field
    wireActivatePluginMocks(tenantId, pluginId, manifest);

    await svc.activatePlugin(tenantId, pluginId);

    expect(translationService.loadNamespaceFile).not.toHaveBeenCalled();
  });

  it('should still transition to ACTIVE even when all translation loads fail', async () => {
    const manifest = {
      ...buildManifest(pluginId),
      translations: { namespaces: ['crm'], supportedLocales: ['en'] },
    };
    wireActivatePluginMocks(tenantId, pluginId, manifest);
    vi.mocked(translationService.loadNamespaceFile).mockRejectedValue(new Error('fs error'));

    await svc.activatePlugin(tenantId, pluginId);

    expect(db.plugin.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lifecycleStatus: PluginLifecycleStatus.ACTIVE } })
    );
    expect(db.tenantPlugin.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { enabled: true } })
    );
  });

  it('should process remaining namespaces when one locale fails (partial failure)', async () => {
    const manifest = {
      ...buildManifest(pluginId),
      translations: {
        namespaces: ['crm'],
        supportedLocales: ['en', 'fr'],
      },
    };
    wireActivatePluginMocks(tenantId, pluginId, manifest);

    // Only 'en' fails, 'fr' succeeds
    vi.mocked(translationService.loadNamespaceFile)
      .mockRejectedValueOnce(new Error('en missing'))
      .mockResolvedValueOnce(undefined);

    await svc.activatePlugin(tenantId, pluginId);

    // Both locales were attempted despite the first failure
    expect(translationService.loadNamespaceFile).toHaveBeenCalledTimes(2);
    expect(translationService.loadNamespaceFile).toHaveBeenCalledWith('en', 'crm');
    expect(translationService.loadNamespaceFile).toHaveBeenCalledWith('fr', 'crm');
  });
});
