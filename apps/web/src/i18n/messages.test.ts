// messages.test.ts — Notification i18n resolution contract (E2E 006-01/02/05).
// The backend persists i18n KEYS in notifications.title (no PII, Security §6);
// the UI resolves them via react-intl (notification-item.tsx). These tests pin
// the catalog so the E2E-asserted English strings can never silently diverge:
//   'You have been invited to a workspace' (invite, center + SSE specs)
//   'New contact: {name}' → 'New contact: Ada' (plugin emission spec)

import { createIntl } from 'react-intl';
import { describe, expect, it } from 'vitest';

import { messages } from './messages.en.js';
import { messagesItNotifications } from './messages.it.notifications.js';

const intl = createIntl({ locale: 'en', messages });

describe('notification i18n resolution', () => {
  it('EN catalog carries the invite title/body the center asserts', () => {
    expect(messages['notifications.workspace.invite.title']).toBe(
      'You have been invited to a workspace'
    );
    expect(messages['notifications.workspace.invite.body']).toBe(
      'Join the workspace to start collaborating.'
    );
  });

  it('EN catalog carries the plugin contact_created title with {name} param', () => {
    expect(messages['notifications.plugin.crm.contact_created.title']).toBe('New contact: {name}');
  });

  it('formatMessage resolves the persisted invite key to the expected string', () => {
    expect(
      intl.formatMessage({ id: 'notifications.workspace.invite.title', defaultMessage: 'missing' })
    ).toBe('You have been invited to a workspace');
  });

  it('formatMessage resolves the plugin title with titleParams (Ada)', () => {
    expect(
      intl.formatMessage(
        { id: 'notifications.plugin.crm.contact_created.title', defaultMessage: 'missing' },
        { name: 'Ada' }
      )
    ).toBe('New contact: Ada');
  });

  it('IT catalog carries the Italian translations', () => {
    expect(messagesItNotifications['notifications.workspace.invite.title']).toBe(
      'Sei stato invitato a un workspace'
    );
    expect(messagesItNotifications['notifications.plugin.crm.contact_created.title']).toBe(
      'Nuovo contatto: {name}'
    );
  });
});
