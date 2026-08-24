import { describe, expect, it, beforeEach, vi } from 'vitest';

const state = vi.hoisted(() => ({ env: {} as Record<string, string | undefined> }));

vi.mock('../../lib/config.js', () => ({
  config: new Proxy(
    {},
    {
      get: (_target, key: string) => state.env[key],
    }
  ),
}));

import {
  assertCiPluginTarget,
  isCiPluginRuntime,
  pluginContainerIdentity,
} from '../../modules/plugin/services/plugin-container-identity.js';
import { pluginRuntimeScope } from '../../modules/plugin/services/plugin-runtime-scope.js';

const INSTALL_ID = '123e4567-e89b-42d3-a456-426614174000';
const PROJECT = 'plexica-ci-contract-123456789012345678901234567';

function ciEnv(): Record<string, string> {
  const scope = pluginRuntimeScope(PROJECT);
  return {
    CI_RUNTIME_CONTRACT: '1',
    CI_RUNTIME_PROJECT: PROJECT,
    PLUGIN_RUNTIME_SCOPE: scope,
    PLUGIN_DOCKER_NETWORK: `${PROJECT}_default`,
  };
}

describe('isCiPluginRuntime', () => {
  beforeEach(() => {
    state.env = {};
  });
  it('is disabled outside the CI runtime contract', () => {
    expect(isCiPluginRuntime()).toBe(false);
  });
  it('is enabled only when CI_RUNTIME_CONTRACT=1', () => {
    state.env = ciEnv();
    expect(isCiPluginRuntime()).toBe(true);
  });
});

describe('assertCiPluginTarget SSRF gate', () => {
  beforeEach(() => {
    state.env = {};
  });

  it('accepts any target outside the CI runtime contract (dev path)', () => {
    expect(() => assertCiPluginTarget(INSTALL_ID, 'http://localhost:9999')).not.toThrow();
  });

  it('rejects a loopback target in CI', () => {
    state.env = ciEnv();
    expect(() => assertCiPluginTarget(INSTALL_ID, 'http://127.0.0.1:3000/')).toThrow(
      /derived sidecar alias/
    );
  });

  it('rejects a raw IP target in CI', () => {
    state.env = ciEnv();
    expect(() => assertCiPluginTarget(INSTALL_ID, 'http://10.1.2.3:3000/')).toThrow(
      /derived sidecar alias/
    );
  });

  it('rejects the host-gateway alias in CI', () => {
    state.env = ciEnv();
    expect(() => assertCiPluginTarget(INSTALL_ID, 'http://host.docker.internal:3000/')).toThrow(
      /derived sidecar alias/
    );
  });

  it('rejects a foreign sidecar alias in CI', () => {
    state.env = ciEnv();
    expect(() =>
      assertCiPluginTarget(INSTALL_ID, 'http://plexica-plugin-other-abcdef0123456789:3000/')
    ).toThrow(/derived sidecar alias/);
  });

  it('rejects non-http schemes and embedded credentials in CI', () => {
    state.env = ciEnv();
    const identity = pluginContainerIdentity(INSTALL_ID);
    expect(() => assertCiPluginTarget(INSTALL_ID, `https://${identity.alias}:3000/`)).toThrow();
    expect(() =>
      assertCiPluginTarget(INSTALL_ID, `http://user:pass@${identity.alias}:3000/`)
    ).toThrow();
  });

  it('accepts exactly the derived alias with the manifest port in CI', () => {
    state.env = ciEnv();
    const identity = pluginContainerIdentity(INSTALL_ID);
    const url = `http://${identity.alias}:3000/`;
    expect(() => assertCiPluginTarget(INSTALL_ID, url)).not.toThrow();
    expect(() => assertCiPluginTarget(INSTALL_ID, url, 3000)).not.toThrow();
  });
});

describe('assertCiPluginTarget port validation', () => {
  beforeEach(() => {
    state.env = ciEnv();
  });

  it('rejects an implicit default port (no explicit :port)', () => {
    const identity = pluginContainerIdentity(INSTALL_ID);
    expect(() => assertCiPluginTarget(INSTALL_ID, `http://${identity.alias}/`)).toThrow(
      /explicit sidecar TCP port/
    );
  });

  it('rejects port zero and out-of-range ports', () => {
    const identity = pluginContainerIdentity(INSTALL_ID);
    expect(() => assertCiPluginTarget(INSTALL_ID, `http://${identity.alias}:0/`)).toThrow(
      /explicit sidecar TCP port/
    );
    // The WHATWG URL parser itself fails closed above 65535.
    expect(() => assertCiPluginTarget(INSTALL_ID, `http://${identity.alias}:70000/`)).toThrow();
  });

  it('rejects a mismatched manifest port', () => {
    const identity = pluginContainerIdentity(INSTALL_ID);
    expect(() => assertCiPluginTarget(INSTALL_ID, `http://${identity.alias}:3001/`, 3000)).toThrow(
      /does not match the installation manifest/
    );
  });
});
