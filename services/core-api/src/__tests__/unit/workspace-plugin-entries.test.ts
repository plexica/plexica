// unit/workspace-plugin-entries.test.ts
// Contract for `buildWorkspacePluginEntries` (spec 004, 006-09): the workspace
// plugin payload must carry an EXPLICIT per-locale presigned bundle URL for
// every locale the manifest declares (Blocker-2 fix) — never a URL derived
// from the remoteEntry presigned URL, whose SigV4 signature would not match
// the sibling `i18n/{locale}.json` object path.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPresignedReadUrl: vi.fn(),
  getDevBackendForInstallation: vi.fn(),
}));

vi.mock('../../lib/storage-client.js', () => ({
  getPresignedReadUrl: mocks.getPresignedReadUrl,
}));
vi.mock('../../modules/plugin/services/dev-backends.js', () => ({
  getDevBackendForInstallation: mocks.getDevBackendForInstallation,
}));

import { buildWorkspacePluginEntries } from '../../modules/plugin/services/workspace-plugin-entries.js';

const INSTALL_ID = '00000000-0000-4000-8000-000000000c01';

const manifest = {
  slug: 'crm',
  name: 'CRM',
  version: '1.0.0',
  description: 'CRM plugin',
  author: 'Plexica',
  icon: 'Contact2',
  categories: [],
  hosting: { type: 'sidecar', image: 'plexica/crm-plugin:1.0.0', port: 3000 },
  ui: {
    remoteEntry: 'remoteEntry.js',
    extensionPoints: ['sidebar:admin', 'workspace-panel:main'],
  },
  i18n: { bundles: ['en', 'it'] },
  events: { subscribes: ['plexica.workspace.created'] },
  declaredTables: [],
};

const noI18nManifest = { ...manifest, i18n: undefined };

const installations = [{ id: INSTALL_ID, pluginId: 'plugin-1' }];
const plugins = [{ id: 'plugin-1', slug: 'crm', version: '1.0.0', manifest }];

describe('buildWorkspacePluginEntries (006-09 Blocker-2 contract)', () => {
  beforeEach(() => {
    mocks.getPresignedReadUrl.mockReset();
    mocks.getDevBackendForInstallation.mockReset().mockReturnValue(undefined);
    mocks.getPresignedReadUrl.mockImplementation(
      async (_bucket: string, key: string) => `https://storage.example/${key}`
    );
  });

  it('presigns EACH locale bundle for its own object (never sibling-derived)', async () => {
    const entries = await buildWorkspacePluginEntries(installations, plugins);

    expect(entries).toHaveLength(2); // one per extension point
    for (const entry of entries) {
      expect(entry.i18nBundles).toEqual(['en', 'it']);
      expect(entry.i18nBundleUrls).toEqual({
        en: 'https://storage.example/plugins/crm/1.0.0/i18n/en.json',
        it: 'https://storage.example/plugins/crm/1.0.0/i18n/it.json',
      });
      expect(entry.remoteEntryUrl).toBe('https://storage.example/plugins/crm/1.0.0/remoteEntry.js');
    }

    const presignedKeys = mocks.getPresignedReadUrl.mock.calls.map((call) => call[1]);
    expect(presignedKeys).toContain('plugins/crm/1.0.0/remoteEntry.js');
    // Each per-locale URL is a standalone presign for its own object.
    expect(presignedKeys).toContain('plugins/crm/1.0.0/i18n/en.json');
    expect(presignedKeys).toContain('plugins/crm/1.0.0/i18n/it.json');
  });

  it('uses the bucket name plugin-assets for every presign', async () => {
    await buildWorkspacePluginEntries(installations, plugins);
    for (const call of mocks.getPresignedReadUrl.mock.calls) expect(call[0]).toBe('plugin-assets');
  });

  it('dev backend: uiUrl wins and NO presigned bundle URLs are served', async () => {
    mocks.getDevBackendForInstallation.mockReturnValue({
      baseUrl: 'http://localhost:3000',
      uiUrl: 'http://localhost:4001',
      extensionPoints: ['workspace-panel:main'],
    });
    const entries = await buildWorkspacePluginEntries(installations, plugins);

    expect(entries).toHaveLength(1);
    const [first] = entries;
    expect(first?.remoteEntryUrl).toBe('http://localhost:4001');
    expect(first?.i18nBundleUrls).toBeUndefined();
    expect(first?.i18nBundles).toEqual(['en', 'it']);
    expect(mocks.getPresignedReadUrl).not.toHaveBeenCalled();
  });

  it('plugin without i18n bundles serves an empty bundle list and no URLs', async () => {
    const entry = (
      await buildWorkspacePluginEntries(installations, [
        { id: 'plugin-1', slug: 'crm', version: '1.0.0', manifest: noI18nManifest },
      ])
    )[0];
    expect(entry?.i18nBundles).toEqual([]);
    expect(entry?.i18nBundleUrls).toBeUndefined();
  });
});
