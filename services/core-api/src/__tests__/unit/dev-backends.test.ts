import { afterEach, describe, expect, it } from 'vitest';

import {
  disableDevBackend,
  enableDevBackend,
  getDevBackend,
  getDevBackendForInstallation,
  registerDevBackend,
  unregisterDevBackend,
} from '../../modules/plugin/services/dev-backends.js';

const SLUG = 'dev-runtime-test';
const INSTALL_ID = '00000000-0000-4000-8000-000000000099';

afterEach(() => unregisterDevBackend(SLUG, INSTALL_ID));

describe('development backend lifecycle', () => {
  it('resolves only the exact active installation', () => {
    registerDevBackend(SLUG, { baseUrl: 'http://localhost:4000', installId: INSTALL_ID });

    expect(getDevBackendForInstallation(SLUG, INSTALL_ID)?.baseUrl)
      .toBe('http://localhost:4000');
    expect(getDevBackendForInstallation(SLUG, crypto.randomUUID())).toBeUndefined();
  });

  it('disables and restores the target only at lifecycle convergence', () => {
    registerDevBackend(SLUG, { baseUrl: 'http://localhost:4000', installId: INSTALL_ID });

    disableDevBackend(INSTALL_ID);
    expect(getDevBackendForInstallation(SLUG, INSTALL_ID)).toBeUndefined();

    enableDevBackend(INSTALL_ID);
    expect(getDevBackendForInstallation(SLUG, INSTALL_ID)).toBeDefined();
  });

  it('keeps the same slug isolated per tenant (CodeRabbit M-1)', () => {
    registerDevBackend(SLUG, { baseUrl: 'http://localhost:4000', installId: INSTALL_ID });
    registerDevBackend(SLUG, { baseUrl: 'http://localhost:4999', installId: 't2-install' }, 'tenant-b');

    // Each tenant resolves its own backend, not the other's.
    expect(getDevBackend(SLUG)?.baseUrl).toBe('http://localhost:4000');
    expect(getDevBackend(SLUG, 'tenant-b')?.baseUrl).toBe('http://localhost:4999');

    // Unregistering tenant-b must not affect the tenant-less entry.
    unregisterDevBackend(SLUG, 't2-install', 'tenant-b');
    expect(getDevBackend(SLUG, 'tenant-b')).toBeUndefined();
    expect(getDevBackend(SLUG)?.baseUrl).toBe('http://localhost:4000');
  });
});
