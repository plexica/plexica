import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/config.js', () => ({ config: {} }));

import { containerPort } from '../../modules/plugin/services/container-helpers.js';

function inspected(ports: unknown, exposed: Record<string, unknown>): never {
  return {
    Config: { ExposedPorts: exposed },
    NetworkSettings: { Ports: ports },
  } as never;
}

describe('containerPort resolution', () => {
  it('uses the manifest hosting port inside CI where publishing is forbidden', () => {
    // CI contract: unbound port entry plus the exposed manifest port only.
    const port = containerPort(inspected({ '3000/tcp': null }, { '3000/tcp': {} }));
    expect(port).toBe(3000);
  });

  it('prefers the daemon-assigned host binding outside CI', () => {
    // Local containers are created with HostPort '0'; after start the real
    // host port must win over the container-side exposed port.
    const port = containerPort(
      inspected({ '8080/tcp': [{ HostIp: '127.0.0.1', HostPort: '33441' }] }, { '8080/tcp': {} })
    );
    expect(port).toBe(33441);
  });

  it('ignores the placeholder HostPort "0" of a not-yet-started local container', () => {
    const port = containerPort(
      inspected({ '8080/tcp': [{ HostIp: '127.0.0.1', HostPort: '0' }] }, { '8080/tcp': {} })
    );
    expect(port).toBe(8080);
  });

  it('returns undefined when nothing is exposed or bound', () => {
    expect(containerPort(inspected({}, {}))).toBeUndefined();
  });
});
