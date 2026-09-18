// unit/notification/schema.test.ts
// Unit tests for the emit body plugin-type refinement (fix 13): the type must
// have a non-empty suffix after the plugin slug (`plugin.valid.` is rejected).

import { describe, expect, it } from 'vitest';

import { emitBodySchema } from '../../../modules/notification/schema.js';

const UUID = '11111111-1111-4111-8111-111111111111';
const base = {
  userId: UUID,
  titleKey: 'crm.contact_created.title',
  timestamp: '2026-09-18T00:00:00.000Z',
  correlationId: UUID,
};

describe('emitBodySchema — plugin type refinement (fix 13)', () => {
  it('accepts a well-formed plugin type with a non-empty suffix', () => {
    const parsed = emitBodySchema.parse({ ...base, type: 'plugin.crm.contact_created' });
    expect(parsed.type).toBe('plugin.crm.contact_created');
  });

  it('rejects a trailing dot (empty suffix) after the slug', () => {
    expect(() => emitBodySchema.parse({ ...base, type: 'plugin.valid.' })).toThrow();
  });

  it('rejects a double dot (empty segment) in the suffix', () => {
    expect(() => emitBodySchema.parse({ ...base, type: 'plugin.valid..type' })).toThrow();
  });

  it('still rejects an invalid slug', () => {
    expect(() => emitBodySchema.parse({ ...base, type: 'plugin.INVALID.type' })).toThrow();
  });
});
