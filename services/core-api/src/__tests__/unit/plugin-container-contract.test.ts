import { describe, expect, it } from 'vitest';

import { assertCiPluginContainer } from '../../modules/plugin/services/plugin-container-contract.js';
import { pluginContainerIdentity } from '../../modules/plugin/services/plugin-container-identity.js';

const installId = '123e4567-e89b-42d3-a456-426614174000';
const localIdentity = pluginContainerIdentity(installId, 'local', 'local_default');
const identity = {
  ...localIdentity,
  network: 'plexica-ci-contract-123456_default',
  labels: { ...localIdentity.labels, 'com.docker.compose.project': 'plexica-ci-contract-123456' },
};

interface ContainerFixture {
  Name: string;
  Config: { Labels: Record<string, string>; Env: string[] };
  HostConfig: { Binds: string[]; PortBindings: Record<string, unknown>; ExtraHosts: string[] };
  NetworkSettings: { Ports: Record<string, unknown>; Networks: Record<string, { Aliases: string[] }> };
}

function inspected(): ContainerFixture {
  return {
    Name: `/${identity.name}`,
    Config: { Labels: { ...identity.labels }, Env: ['CORE_API_URL=http://core-api-e2e:3001'] },
   HostConfig: { Binds: ['/etc/ssl/certs/ca-certificates.crt:/tmp/plexica-postgres-ca.crt:ro'], PortBindings: {}, ExtraHosts: [] },
    NetworkSettings: {
      Ports: { '3000/tcp': null },
      Networks: { 'plexica-ci-contract-123456_default': { Aliases: [identity.alias] } },
    },
  };
}

describe('CI plugin container contract', () => {
  it('accepts the exact identity, network, alias, and unbound port', () => {
    expect(() => assertCiPluginContainer(identity, inspected(), true)).not.toThrow();
  });
  it.each([
    ['foreign network', (value: ContainerFixture) => { value.NetworkSettings.Networks = { foreign_default: { Aliases: [identity.alias] } }; }],
    ['foreign alias', (value: ContainerFixture) => { value.NetworkSettings.Networks['plexica-ci-contract-123456_default']!.Aliases.push('foreign'); }],
    ['published port', (value: ContainerFixture) => { value.NetworkSettings.Ports = { '3000/tcp': [{ HostPort: '32000' }] }; }],
    ['host gateway', (value: ContainerFixture) => { value.HostConfig.ExtraHosts = ['host.docker.internal:host-gateway']; }],
    ['arbitrary extra host mapping', (value: ContainerFixture) => { value.HostConfig.ExtraHosts = ['runner.internal:10.0.0.5']; }],
    ['foreign scope', (value: ContainerFixture) => { value.Config.Labels['io.plexica.runtime-scope'] = 'foreign'; }],
    ['foreign project with the same scope', (value: ContainerFixture) => { value.Config.Labels['com.docker.compose.project'] = 'plexica-ci-foreign-123456'; }],
    ['forged runtime-project ownership label', (value: ContainerFixture) => { value.Config.Labels['io.plexica.runtime-project'] = 'plexica-ci-foreign-123456'; }],
    ['forged extra label', (value: ContainerFixture) => { value.Config.Labels['io.plexica.forged'] = 'true'; }],
  ])('rejects %s before lifecycle operations', (_name, mutate) => {
    const value = inspected();
    mutate(value);
    expect(() => assertCiPluginContainer(identity, value, true)).toThrow();
  });
});
