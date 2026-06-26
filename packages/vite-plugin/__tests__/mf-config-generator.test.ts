// mf-config-generator.test.ts

import { describe, expect, it } from 'vitest';
import { generateMfConfig } from '../src/mf-config-generator.js';
import { SHARED_DEPS } from '../src/shared-deps.js';

const testManifest = {
  slug: 'test-crm',
  name: 'Test CRM',
  version: '1.0.0',
  ui: {
    remoteEntry: 'remoteEntry.js',
    extensionPoints: ['sidebar:admin', 'workspace-panel:main'],
  },
};

describe('generateMfConfig', () => {
  it('generates correct name from manifest slug', () => {
    const config = generateMfConfig(testManifest, SHARED_DEPS);
    expect(config.name).toBe('test-crm');
  });

  it('maps extension points to exposes with colon-to-hyphen paths', () => {
    const config = generateMfConfig(testManifest, SHARED_DEPS);
    expect(config.exposes['./sidebar:admin']).toBe('./ui/sidebar-admin.tsx');
    expect(config.exposes['./workspace-panel:main']).toBe('./ui/workspace-panel-main.tsx');
  });

  it('uses custom filename from manifest', () => {
    const config = generateMfConfig(testManifest, SHARED_DEPS);
    expect(config.filename).toBe('remoteEntry.js');
  });

  it('defaults filename when manifest omits ui.remoteEntry', () => {
    const manifestNoEntry = { ...testManifest, ui: { extensionPoints: [] } };
    const config = generateMfConfig(manifestNoEntry, SHARED_DEPS);
    expect(config.filename).toBe('remoteEntry.js');
  });

  it('includes shared deps in generated config', () => {
    const config = generateMfConfig(testManifest, SHARED_DEPS);
    expect(config.shared).toBe(SHARED_DEPS);
  });

  it('produces empty exposes when no extension points declared', () => {
    const manifestNoPoints = { ...testManifest, ui: { extensionPoints: [] } };
    const config = generateMfConfig(manifestNoPoints, SHARED_DEPS);
    expect(Object.keys(config.exposes)).toHaveLength(0);
  });
});
