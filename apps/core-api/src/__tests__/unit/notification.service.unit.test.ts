// apps/core-api/src/__tests__/unit/notification.service.unit.test.ts
// T007-37 — Unit tests for NotificationService
// Tests: email (valid, invalid, SMTP not configured), inApp, push (stub), sendBulk, send dispatcher

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoist mock variables so they are available when vi.mock factories run
// ---------------------------------------------------------------------------

const { mockSendMail, mockCreateTransport, mockCreate, mockUpdateStatus, mockFindByUserId } =
  vi.hoisted(() => {
    const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-msg-id' });
    const mockCreateTransport = vi.fn(() => ({ sendMail: mockSendMail }));
    const mockCreate = vi.fn();
    const mockUpdateStatus = vi.fn();
    const mockFindByUserId = vi.fn();
    return { mockSendMail, mockCreateTransport, mockCreate, mockUpdateStatus, mockFindByUserId };
  });

// ---------------------------------------------------------------------------
// Mock external dependencies before importing the SUT
// ---------------------------------------------------------------------------

vi.mock('nodemailer', () => ({
  default: { createTransport: mockCreateTransport },
  createTransport: mockCreateTransport,
}));

vi.mock('../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../modules/notifications/notification.repository.js', () => ({
  NotificationRepository: vi.fn().mockImplementation(function (this: any) {
    this.create = mockCreate;
    this.updateStatus = mockUpdateStatus;
    this.findByUserId = mockFindByUserId;
  }),
}));

vi.mock('../../modules/notifications/notification-template.js', () => ({
  renderTemplate: vi.fn((template: string) => template),
}));

import { NotificationService } from '../../modules/notifications/notification.service.js';
import { NotificationRepository } from '../../modules/notifications/notification.repository.js';
import {
  NotificationChannel,
  NotificationStatus,
  NotificationErrorCode,
} from '../../types/core-services.types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-001';
const USER_ID = 'user-001';

function makeSmtp() {
  return {
    host: 'smtp.test.com',
    port: 587,
    user: 'test@test.com',
    pass: 'secret',
    from: 'noreply@test.com',
  };
}

function makeRepo() {
  return new NotificationRepository() as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NotificationService', () => {
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(() => {
    repo = makeRepo();
    vi.clearAllMocks();
    mockSendMail.mockResolvedValue({ messageId: 'test-msg-id' });
  });

  // -------------------------------------------------------------------------
  // email()
  // -------------------------------------------------------------------------
  describe('email()', () => {
    it('should reject an invalid email address immediately', async () => {
      const svc = new NotificationService(repo, makeSmtp());
      await expect(
        svc.email(TENANT_ID, { to: 'not-an-email', subject: 'Hi', body: 'Hello' })
      ).rejects.toMatchObject({ code: NotificationErrorCode.INVALID_EMAIL });
    });

    it('should skip sending (warn) when SMTP is not configured', async () => {
      const svc = new NotificationService(repo, null);
      // No error thrown — just a warn log
      await expect(
        svc.email(TENANT_ID, { to: 'user@example.com', subject: 'Test', body: 'Hello' })
      ).resolves.toBeUndefined();
    });

    it('should send email and persist a SENT record when SMTP is configured', async () => {
      const dbRecord = {
        id: 'notif-001',
        tenantId: TENANT_ID,
        userId: 'user@example.com',
        channel: NotificationChannel.EMAIL,
        status: NotificationStatus.PENDING,
        title: 'Test Subject',
        body: 'Test Body',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockCreate.mockResolvedValue(dbRecord);
      mockUpdateStatus.mockResolvedValue(undefined);

      const svc = new NotificationService(repo, makeSmtp());

      await svc.email(TENANT_ID, {
        to: 'user@example.com',
        subject: 'Test Subject',
        body: 'Test Body',
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          userId: 'user@example.com',
          channel: NotificationChannel.EMAIL,
          status: NotificationStatus.PENDING,
        })
      );
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          subject: 'Test Subject',
        })
      );
      expect(mockUpdateStatus).toHaveBeenCalledWith('notif-001', NotificationStatus.SENT);
    });

    it('should mark notification as FAILED and rethrow on sendMail error', async () => {
      const dbRecord = { id: 'notif-err' };
      mockCreate.mockResolvedValue(dbRecord);
      mockUpdateStatus.mockResolvedValue(undefined);
      mockSendMail.mockRejectedValue(new Error('SMTP connection refused'));

      const svc = new NotificationService(repo, makeSmtp());

      await expect(
        svc.email(TENANT_ID, { to: 'user@example.com', subject: 'Fail', body: 'Body' })
      ).rejects.toMatchObject({ code: NotificationErrorCode.SEND_FAILED });

      expect(mockUpdateStatus).toHaveBeenCalledWith('notif-err', NotificationStatus.FAILED);
    });
  });

  // -------------------------------------------------------------------------
  // inApp()
  // -------------------------------------------------------------------------
  describe('inApp()', () => {
    it('should persist an in-app notification and return it', async () => {
      const dbRecord = {
        id: 'notif-inapp-001',
        tenantId: TENANT_ID,
        userId: USER_ID,
        channel: NotificationChannel.IN_APP,
        status: NotificationStatus.SENT,
        title: 'Welcome',
        body: 'You have a new message',
        metadata: { link: '/dashboard' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockCreate.mockResolvedValue(dbRecord);

      const svc = new NotificationService(repo, null);
      const result = await svc.inApp(TENANT_ID, {
        userId: USER_ID,
        title: 'Welcome',
        body: 'You have a new message',
        metadata: { link: '/dashboard' },
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          userId: USER_ID,
          channel: NotificationChannel.IN_APP,
          status: NotificationStatus.SENT,
        })
      );
      expect(result.id).toBe('notif-inapp-001');
      expect(result.channel).toBe(NotificationChannel.IN_APP);
      expect(result.status).toBe(NotificationStatus.SENT);
    });
  });

  // -------------------------------------------------------------------------
  // push() — stub
  // -------------------------------------------------------------------------
  describe('push()', () => {
    it('should resolve without throwing (Firebase stub)', async () => {
      const svc = new NotificationService(repo, null);
      await expect(
        svc.push(TENANT_ID, { userId: USER_ID, title: 'Push Test', body: 'Body' })
      ).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // send() — dispatcher
  // -------------------------------------------------------------------------
  describe('send()', () => {
    it('should route IN_APP channel to inApp()', async () => {
      const dbRecord = {
        id: 'notif-dispatch',
        tenantId: TENANT_ID,
        userId: USER_ID,
        channel: NotificationChannel.IN_APP,
        status: NotificationStatus.SENT,
        title: 'Hi',
        body: 'Hello',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockCreate.mockResolvedValue(dbRecord);

      const svc = new NotificationService(repo, null);
      const notification = {
        id: 'n1',
        tenantId: TENANT_ID,
        userId: USER_ID,
        channel: NotificationChannel.IN_APP,
        status: NotificationStatus.PENDING,
        title: 'Hi',
        body: 'Hello',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const result = await svc.send(notification);
      expect(result).toBeDefined();
    });

    it('should throw SEND_FAILED for unknown channel', async () => {
      const svc = new NotificationService(repo, null);
      const notification = {
        id: 'n2',
        tenantId: TENANT_ID,
        userId: USER_ID,
        channel: 'UNKNOWN' as any,
        status: NotificationStatus.PENDING,
        title: 'Test',
        body: 'Body',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await expect(svc.send(notification)).rejects.toMatchObject({
        code: NotificationErrorCode.SEND_FAILED,
      });
    });
  });

  // -------------------------------------------------------------------------
  // sendBulk()
  // -------------------------------------------------------------------------
  describe('sendBulk()', () => {
    it('should enqueue notifications via jobQueueService when available', async () => {
      const mockEnqueue = vi.fn().mockResolvedValue({ jobId: 'job-001' });
      const svc = new NotificationService(repo, null);
      svc.setJobQueueService({ enqueue: mockEnqueue });

      const notifications = [
        {
          id: 'n1',
          tenantId: TENANT_ID,
          userId: USER_ID,
          channel: NotificationChannel.IN_APP,
          status: NotificationStatus.PENDING,
          title: 'Msg 1',
          body: 'Body 1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'n2',
          tenantId: TENANT_ID,
          userId: USER_ID,
          channel: NotificationChannel.IN_APP,
          status: NotificationStatus.PENDING,
          title: 'Msg 2',
          body: 'Body 2',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      await svc.sendBulk(notifications);
      expect(mockEnqueue).toHaveBeenCalledTimes(2);
      expect(mockEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'notifications.send' })
      );
    });

    it('should fall back to synchronous send when no jobQueueService', async () => {
      const dbRecord = {
        id: 'notif-fallback',
        tenantId: TENANT_ID,
        userId: USER_ID,
        channel: NotificationChannel.IN_APP,
        status: NotificationStatus.SENT,
        title: 'Fallback',
        body: 'Test',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockCreate.mockResolvedValue(dbRecord);

      const svc = new NotificationService(repo, null);
      const notifications = [
        {
          id: 'n1',
          tenantId: TENANT_ID,
          userId: USER_ID,
          channel: NotificationChannel.IN_APP,
          status: NotificationStatus.PENDING,
          title: 'Fallback',
          body: 'Test',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // No jobQueueService set — falls back to Promise.allSettled
      await expect(svc.sendBulk(notifications)).resolves.toBeUndefined();
    });
  });
});
