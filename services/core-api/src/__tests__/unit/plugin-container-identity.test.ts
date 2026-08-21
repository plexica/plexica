import { describe, expect, it } from 'vitest';

import { pluginContainerIdentity } from '../../modules/plugin/services/plugin-container-identity.js';

describe('plugin CI container identity', () => {
  it('derives a bounded deterministic alias and scope labels', () => {
    const identity = pluginContainerIdentity('123e4567-e89b-42d3-a456-426614174000', 'local', 'local_default');
    expect(identity.alias).toMatch(/^plexica-plugin-local-[a-f0-9]{16}$/);
    expect(identity.labels['io.plexica.runtime-scope']).toBe('local');
  });
  it('rejects a non-UUID installation ID', () => {
    expect(() => pluginContainerIdentity('not-a-uuid', 'local', 'local_default')).toThrow('UUID');
  });
});
