import { describe, expect, it } from 'vitest';

import { parseConfig } from '../../lib/config.js';
import { pluginRuntimeScope } from '../../modules/plugin/services/plugin-runtime-scope.js';

import { containerBase, contractProject, hostBase } from './ci-runtime-contract-fixtures.js';

describe('CI runtime contract — R6 plugin Core URL is container DNS-only', () => {
  it('container mode accepts core-api-e2e DNS', () => {
    expect(parseConfig(containerBase).PLUGIN_CORE_API_URL).toBe('http://core-api-e2e:3001');
  });
  it('container mode rejects a loopback plugin Core URL', () => {
    expect(() =>
      parseConfig({ ...containerBase, PLUGIN_CORE_API_URL: 'http://localhost:3001' })
    ).toThrow('core-api-e2e DNS');
  });
  it('host mode passes with the Zod localhost default', () => {
    expect(parseConfig(hostBase).PLUGIN_CORE_API_URL).toBe('http://localhost:3001');
  });
});

describe('CI runtime contract — R7 project ID binds scope and network in container mode', () => {
  it('container mode accepts matching scope/network', () => {
    expect(parseConfig(containerBase).PLUGIN_RUNTIME_SCOPE).toBe(pluginRuntimeScope(contractProject));
  });
  it('container mode rejects a foreign scope/network pair', () => {
    expect(() =>
      parseConfig({
        ...containerBase,
        PLUGIN_RUNTIME_SCOPE: pluginRuntimeScope('plexica-ci-foreign-123456'),
        PLUGIN_DOCKER_NETWORK: 'plexica-ci-foreign-123456_default',
      })
    ).toThrow('immutable project ID');
  });
  it('container mode rejects an invalid project ID', () => {
    expect(() =>
      parseConfig({
        ...containerBase,
        CI_RUNTIME_PROJECT: 'plexica-ci-x',
        PLUGIN_RUNTIME_SCOPE: pluginRuntimeScope('plexica-ci-x'),
        PLUGIN_DOCKER_NETWORK: 'plexica-ci-x_default',
      })
    ).toThrow('immutable project ID');
  });
  it('maps a long immutable project to a bounded deterministic scope', () => {
    const long = 'plexica-ci-contract-123456789012345678901234567';
    const scope = pluginRuntimeScope(long);
    expect(scope).toHaveLength(31);
    expect(
      parseConfig({
        ...containerBase,
        CI_RUNTIME_PROJECT: long,
        CI_RUNTIME_CA_FILE: `/run/plexica-ci-${long}/postgres-ca.crt`,
        PLUGIN_RUNTIME_SCOPE: scope,
        PLUGIN_DOCKER_NETWORK: `${long}_default`,
      }).PLUGIN_RUNTIME_SCOPE
    ).toBe(scope);
  });
  it('host mode passes without any plugin scope variables', () => {
    const parsed = parseConfig(hostBase);
    expect(parsed.CI_RUNTIME_PROJECT).toBeUndefined();
    expect(parsed.PLUGIN_RUNTIME_SCOPE).toBeUndefined();
    expect(parsed.PLUGIN_DOCKER_NETWORK).toBeUndefined();
  });
});

describe('CI runtime contract — R8 plugin Docker control is the private proxy', () => {
  it('container mode accepts the private proxy', () => {
    expect(parseConfig(containerBase).PLUGIN_DOCKER_HOST).toBe('http://plugin-docker-proxy:2375');
  });
  it('container mode rejects direct Docker access', () => {
    expect(() =>
      parseConfig({ ...containerBase, PLUGIN_DOCKER_HOST: 'http://docker:2375' })
    ).toThrow('Docker control');
  });
  it('host mode passes with direct Docker access unset', () => {
    expect(parseConfig(hostBase).PLUGIN_DOCKER_HOST).toBeUndefined();
  });
});

describe('CI runtime contract — R11 container mode requires the exact runtime CA path', () => {
  // A present-but-wrong value fails at the per-project path check in the
  // cross-field container contract; an absent value must also fail closed.
  it.each([
    '/etc/ssl/certs/ca-certificates.crt',
    '/run/plexica-ci/postgres-ca.pem',
    '/run/plexica-ci/postgres-ca.crt',
    '/run/plexica-ci-other-123456/postgres-ca.crt',
  ])('rejects CI_RUNTIME_CA_FILE=%s', (caFile) => {
    expect(() => parseConfig({ ...containerBase, CI_RUNTIME_CA_FILE: caFile })).toThrow(
      /runtime Postgres CA/
    );
  });
  it('rejects a missing CI_RUNTIME_CA_FILE in the container contract', () => {
    expect(() => parseConfig({ ...containerBase, CI_RUNTIME_CA_FILE: undefined })).toThrow(
      /runtime Postgres CA/
    );
  });
  it('host mode passes without the runtime CA variable', () => {
    expect(parseConfig(hostBase).CI_RUNTIME_CA_FILE).toBeUndefined();
  });
});

describe('CI runtime contract — R9 KAFKA_BROKERS is strict loopback on host, Compose DNS in containers', () => {
  it('host mode accepts an inspected loopback listener', () => {
    expect(parseConfig(hostBase).KAFKA_BROKERS).toBe('127.0.0.1:9092');
  });
  it.each([
    ['redpanda:9092', 'DNS name'],
    ['127.0.0.1:0', 'invalid port'],
    ['localhost:9092', 'localhost'],
    ['10.0.0.5:9092', 'non-loopback IP'],
  ])('host mode rejects %s (%s)', (brokers) => {
    expect(() => parseConfig({ ...hostBase, KAFKA_BROKERS: brokers })).toThrow('KAFKA_BROKERS');
  });
  it('container mode accepts the Compose DNS broker', () => {
    expect(parseConfig(containerBase).KAFKA_BROKERS).toBe('redpanda:9092');
  });
});

describe('CI runtime contract — R10 MINIO_ENDPOINT is strict loopback on host, Compose DNS in containers', () => {
  it('host mode accepts an inspected loopback endpoint', () => {
    expect(parseConfig(hostBase).MINIO_ENDPOINT).toBe('http://127.0.0.1:9000');
  });
  it.each([
    ['http://minio:9000', 'DNS name'],
    ['http://127.0.0.1', 'missing port'],
    ['https://127.0.0.1:9000', 'non-http scheme'],
  ])('host mode rejects %s (%s)', (endpoint) => {
    expect(() => parseConfig({ ...hostBase, MINIO_ENDPOINT: endpoint })).toThrow('MINIO_ENDPOINT');
  });
  it('container mode accepts the Compose DNS endpoint', () => {
    expect(parseConfig(containerBase).MINIO_ENDPOINT).toBe('http://minio:9000');
  });
});

describe('CI runtime contract — gate is off outside the contract', () => {
  it('accepts plain dev configuration without any marker', () => {
    const { CI_RUNTIME_CONTRACT: _c, ...dev } = hostBase;
    void _c;
    expect(() => parseConfig(dev)).not.toThrow();
  });
});
