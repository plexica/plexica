// kafka-topics.test.ts
// Unit tests — Kafka topic naming conventions.

import { describe, expect, it } from 'vitest';

describe('Topic naming conventions', () => {
  const topics = {
    workspace: (action: string) => `plexica.workspace.${action}`,
    user: (action: string) => `plexica.user.${action}`,
    tenant: (action: string) => `plexica.tenant.${action}`,
    plugin: (action: string) => `plexica.plugin.${action}`,
    pluginCustom: (slug: string, entity: string, action: string) => `plugin.${slug}.${entity}.${action}`,
    dlq: 'plexica.plugin.dlq',
  };

  it('workspace.created', () => {
    expect(topics.workspace('created')).toBe('plexica.workspace.created');
  });

  it('workspace.updated', () => {
    expect(topics.workspace('updated')).toBe('plexica.workspace.updated');
  });

  it('workspace.deleted', () => {
    expect(topics.workspace('deleted')).toBe('plexica.workspace.deleted');
  });

  it('user.invited', () => {
    expect(topics.user('invited')).toBe('plexica.user.invited');
  });

  it('user.joined', () => {
    expect(topics.user('joined')).toBe('plexica.user.joined');
  });

  it('user.removed', () => {
    expect(topics.user('removed')).toBe('plexica.user.removed');
  });

  it('tenant.created', () => {
    expect(topics.tenant('created')).toBe('plexica.tenant.created');
  });

  it('tenant.suspended', () => {
    expect(topics.tenant('suspended')).toBe('plexica.tenant.suspended');
  });

  it('tenant.deleted', () => {
    expect(topics.tenant('deleted')).toBe('plexica.tenant.deleted');
  });

  it('plugin lifecycle events', () => {
    expect(topics.plugin('installed')).toBe('plexica.plugin.installed');
    expect(topics.plugin('activated')).toBe('plexica.plugin.activated');
    expect(topics.plugin('deactivated')).toBe('plexica.plugin.deactivated');
    expect(topics.plugin('uninstalled')).toBe('plexica.plugin.uninstalled');
  });

  it('plugin custom event — CRM contact created', () => {
    expect(topics.pluginCustom('crm', 'contact', 'created')).toBe('plugin.crm.contact.created');
  });

  it('plugin custom event — CRM deal closed', () => {
    expect(topics.pluginCustom('crm', 'deal', 'closed')).toBe('plugin.crm.deal.closed');
  });

  it('DLQ topic name', () => {
    expect(topics.dlq).toBe('plexica.plugin.dlq');
  });
});
