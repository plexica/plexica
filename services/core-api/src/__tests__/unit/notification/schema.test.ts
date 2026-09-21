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

describe('emitBodySchema — metadata.link route-relative guard (N1)', () => {
  const parseWithLink = (link: unknown): boolean => {
    try {
      emitBodySchema.parse({ ...base, type: 'plugin.crm.contact_created', metadata: { link } });
      return true;
    } catch {
      return false;
    }
  };

  it('accepts a route-relative path', () => {
    expect(parseWithLink('/contacts/123')).toBe(true);
  });

  it('accepts the bare root "/"', () => {
    expect(parseWithLink('/')).toBe(true);
  });

  it('rejects an absolute https:// URL', () => {
    expect(parseWithLink('https://evil.example')).toBe(false);
  });

  it('rejects a javascript: URL', () => {
    expect(parseWithLink('javascript:alert(1)')).toBe(false);
  });

  it('rejects a protocol-relative //host link', () => {
    expect(parseWithLink('//evil.example')).toBe(false);
  });

  it('rejects a backslash-normalized /\\host link', () => {
    expect(parseWithLink('/\\evil.example')).toBe(false);
  });

  it('rejects non-string link values', () => {
    expect(parseWithLink(42)).toBe(false);
    expect(parseWithLink(null)).toBe(false);
    expect(parseWithLink({ href: '/contacts/123' })).toBe(false);
  });

  it('rejects an empty-string link', () => {
    expect(parseWithLink('')).toBe(false);
  });

  it('allows metadata without a link key', () => {
    const parsed = emitBodySchema.parse({
      ...base,
      type: 'plugin.crm.contact_created',
      metadata: { workspaceId: 'ws-1' },
    });
    expect(parsed.metadata).toEqual({ workspaceId: 'ws-1' });
  });
});
