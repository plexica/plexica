// notification-connection-manager.test.ts
// UNIT: SSE ConnectionManager tenant isolation (review M1 — the #1 AGENTS.md
// invariant). publish() to tenant A must never reach tenant B's connections,
// even when both tenants share the same userId (pools are keyed by
// tenantSlug + userId). Cheap and deterministic — no DB, no Redis.

import { describe, expect, it } from 'vitest';

import { connectionManager } from '../../modules/notification/connection-manager.js';
import {
  asServerResponse,
  createFakeSseResponse,
  hasSseEvent,
} from '../helpers/notification-sse.helpers.js';

import type { NotificationDto } from '../../modules/notification/types.js';

function dto(id: string): NotificationDto {
  return {
    id,
    type: 'workspace.invite',
    titleKey: 'notifications.workspace.invite.title',
    bodyKey: null,
    metadata: {},
    read: false,
    createdAt: new Date().toISOString(),
  };
}

describe('ConnectionManager tenant isolation (M1)', () => {
  it('publish to tenant A never reaches tenant B connections', () => {
    const resA = createFakeSseResponse();
    const resB = createFakeSseResponse();
    const handleA = connectionManager.connect('tenant-a', 'user-1', asServerResponse(resA));
    const handleB = connectionManager.connect('tenant-b', 'user-1', asServerResponse(resB));
    try {
      const deliveredA = connectionManager.publish('tenant-a', 'user-1', dto('notif-a'));
      expect(deliveredA).toBe(true);
      expect(hasSseEvent(resA, 'notification')).toBe(true);
      // Tenant B saw nothing — even though the userId is identical.
      expect(resB.frames.length).toBe(0);
    } finally {
      handleA.close();
      handleB.close();
    }
  });

  it('publish to tenant B never reaches tenant A connections (vice versa)', () => {
    const resA = createFakeSseResponse();
    const resB = createFakeSseResponse();
    const handleA = connectionManager.connect('tenant-a', 'user-1', asServerResponse(resA));
    const handleB = connectionManager.connect('tenant-b', 'user-1', asServerResponse(resB));
    try {
      const deliveredB = connectionManager.publish('tenant-b', 'user-1', dto('notif-b'));
      expect(deliveredB).toBe(true);
      expect(hasSseEvent(resB, 'notification')).toBe(true);
      expect(resA.frames.length).toBe(0);
    } finally {
      handleA.close();
      handleB.close();
    }
  });

  it('a same-tenant publish with a different userId does not bleed either', () => {
    const resOwner = createFakeSseResponse();
    const resOther = createFakeSseResponse();
    const handleOwner = connectionManager.connect('tenant-a', 'owner', asServerResponse(resOwner));
    const handleOther = connectionManager.connect('tenant-a', 'other', asServerResponse(resOther));
    try {
      connectionManager.publish('tenant-a', 'owner', dto('notif-owner'));
      expect(hasSseEvent(resOwner, 'notification')).toBe(true);
      expect(resOther.frames.length).toBe(0);
    } finally {
      handleOwner.close();
      handleOther.close();
    }
  });
});
