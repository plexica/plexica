// plugin-install-logic.test.ts — unit tests for pure install/event helpers (A4, A5).
// Tests the re-install guard decision (blocksReInstall) and the event-emission
// schema/slug extraction without requiring a live stack.

import { describe, it, expect } from 'vitest';

import { blocksReInstall } from '../../modules/plugin/routes/lifecycle/install.routes.js';
import { _testExtractSlug, _testEmitEventSchema } from '../../modules/plugin/routes/events.routes.js';

describe('install.routes — blocksReInstall (A4 re-install guard)', () => {
  it('blocks re-install for active installs', () => {
    expect(blocksReInstall('active')).toBe(true);
  });

  it('blocks re-install for degraded installs', () => {
    expect(blocksReInstall('degraded')).toBe(true);
  });

  it('blocks re-install for deactivated installs', () => {
    expect(blocksReInstall('deactivated')).toBe(true);
  });

  it('blocks re-install for in-progress installs', () => {
    expect(blocksReInstall('installing')).toBe(true);
  });

  it('allows re-install over a failed install', () => {
    expect(blocksReInstall('failed')).toBe(false);
  });

  it('allows re-install over an uninstalled install', () => {
    expect(blocksReInstall('uninstalled')).toBe(false);
  });

  it('blocks unknown statuses (fail-closed)', () => {
    expect(blocksReInstall('unknown')).toBe(true);
    expect(blocksReInstall('')).toBe(true);
  });
});

describe('events.routes — emitEventSchema + extractSlug (A5)', () => {
  it('extracts the slug from a plugin.{slug}.{type} event', () => {
    expect(_testExtractSlug('plugin.crm.contact.created')).toBe('crm');
    expect(_testExtractSlug('plugin.sales.pipeline.updated')).toBe('sales');
  });

  it('returns empty string for malformed event types', () => {
    expect(_testExtractSlug('plugin')).toBe('');
    expect(_testExtractSlug('plugin.')).toBe('');
  });

  it('accepts a valid plugin event payload', () => {
    const result = _testEmitEventSchema.safeParse({
      type: 'plugin.crm.contact.created',
      payload: { id: '123' },
      timestamp: new Date().toISOString(),
      correlationId: '10000000-0000-4000-8000-000000000001',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an event type that does not start with "plugin."', () => {
    const result = _testEmitEventSchema.safeParse({
      type: 'crm.contact.created',
      payload: {},
      timestamp: new Date().toISOString(),
      correlationId: '10000000-0000-4000-8000-000000000001',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an event type with an invalid slug (uppercase)', () => {
    const result = _testEmitEventSchema.safeParse({
      type: 'plugin.CRM.contact',
      payload: {},
      timestamp: new Date().toISOString(),
      correlationId: '10000000-0000-4000-8000-000000000001',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an event type with fewer than 3 segments', () => {
    const result = _testEmitEventSchema.safeParse({
      type: 'plugin.crm',
      payload: {},
      timestamp: new Date().toISOString(),
      correlationId: '10000000-0000-4000-8000-000000000001',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a payload missing correlationId', () => {
    const result = _testEmitEventSchema.safeParse({
      type: 'plugin.crm.contact.created',
      payload: {},
      timestamp: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });
});
