import { afterEach, describe, expect, it } from 'vitest';

import {
  disableDevBackend,
  enableDevBackend,
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
});
