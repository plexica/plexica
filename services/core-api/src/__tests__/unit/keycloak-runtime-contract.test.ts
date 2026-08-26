import { describe, expect, it } from 'vitest';

import { parseConfig } from '../../lib/config.js';

import { containerBase, hostBase } from './ci-runtime-contract-fixtures.js';

describe('CI runtime contract — R1 host admin endpoint is container-prohibited / host-required', () => {
  it('container mode rejects KEYCLOAK_HOST_ADMIN_BASE', () => {
    expect(() =>
      parseConfig({ ...containerBase, KEYCLOAK_HOST_ADMIN_BASE: 'http://127.0.0.1:32000' })
    ).toThrow('must not receive');
  });
  it('host mode accepts the loopback admin base', () => {
    expect(parseConfig(hostBase).KEYCLOAK_HOST_ADMIN_BASE).toBe('http://127.0.0.1:32000');
  });
});

describe('CI runtime contract — R2 host admin base must be the loopback issuer pair', () => {
  it.each([
    { KEYCLOAK_HOST_ADMIN_BASE: undefined, label: 'missing' },
    { KEYCLOAK_HOST_ADMIN_BASE: 'https://127.0.0.1:32000', label: 'non-http' },
    { KEYCLOAK_HOST_ADMIN_BASE: 'http://keycloak:8080', label: 'foreign host' },
    { KEYCLOAK_HOST_ADMIN_BASE: 'http://127.0.0.1:32999', label: 'port mismatch' },
  ])('host mode rejects a non-pair admin base ($label)', (override) => {
    expect(() => parseConfig({ ...hostBase, ...override })).toThrow('KEYCLOAK_HOST_ADMIN_BASE');
  });
});

describe('CI runtime contract — R3 public issuer is a loopback origin in both modes', () => {
  it.each(['http://localhost:32000', 'http://[::1]:32000'])(
    'container mode rejects issuer %s',
    (issuer) => {
      expect(() => parseConfig({ ...containerBase, KEYCLOAK_PUBLIC_ISSUER_BASE: issuer })).toThrow(
        'loopback'
      );
    }
  );
  it.each(['http://localhost:32000', 'https://127.0.0.1:32000'])(
    'host mode rejects issuer %s',
    (issuer) => {
      expect(() => parseConfig({ ...hostBase, KEYCLOAK_PUBLIC_ISSUER_BASE: issuer })).toThrow(
        'loopback'
      );
    }
  );
});

describe('CI runtime contract — R4 Core Keycloak URL is container DNS-only', () => {
  it('container mode accepts http://keycloak:8080', () => {
    expect(parseConfig(containerBase).KEYCLOAK_URL).toBe('http://keycloak:8080');
  });
  it('container mode rejects a host-loopback Core URL', () => {
    expect(() => parseConfig({ ...containerBase, KEYCLOAK_URL: 'http://127.0.0.1:32000' })).toThrow(
      'Core Keycloak calls'
    );
  });
  it('host mode accepts the loopback Core URL', () => {
    expect(parseConfig(hostBase).KEYCLOAK_URL).toBe('http://127.0.0.1:32000');
  });
});

describe('CI runtime contract — R5 JWKS/Admin base is container DNS-only', () => {
  it('container mode accepts http://keycloak:8080', () => {
    expect(parseConfig(containerBase).KEYCLOAK_CONTAINER_ADMIN_JWKS_BASE).toBe(
      'http://keycloak:8080'
    );
  });
  it('container mode rejects a host-loopback JWKS base', () => {
    expect(() =>
      parseConfig({
        ...containerBase,
        KEYCLOAK_CONTAINER_ADMIN_JWKS_BASE: 'http://127.0.0.1:32000',
      })
    ).toThrow('JWKS');
  });
  it('host mode passes with the JWKS base unset (falls back to loopback KEYCLOAK_URL)', () => {
    expect(parseConfig(hostBase).KEYCLOAK_CONTAINER_ADMIN_JWKS_BASE).toBeUndefined();
  });
});
