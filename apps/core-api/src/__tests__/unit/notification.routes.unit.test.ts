// apps/core-api/src/__tests__/unit/notification.routes.unit.test.ts
// T007-41 — Unit tests for Notification API routes (fake-server pattern, no real DB)

import 'dotenv/config';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { NotificationService } from '../../modules/notifications/notification.service.js';

// ---------------------------------------------------------------------------
// Hoisted mocks — must come before any imports that trigger module resolution
// ---------------------------------------------------------------------------

const {
  mockSend,
  mockSendBulk,
  mockListForUser,
  mockGetUnreadCount,
  mockMarkAsRead,
  mockMarkAllAsRead,
} = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockSendBulk: vi.fn(),
  mockListForUser: vi.fn(),
  mockGetUnreadCount: vi.fn(),
  mockMarkAsRead: vi.fn(),
  mockMarkAllAsRead: vi.fn(),
}));

vi.mock('../../middleware/auth.js', () => ({
  authMiddleware: vi.fn((_req: any, _reply: any, done: () => void) => done()),
  requireRole: vi.fn(() => vi.fn((_req: any, _reply: any, done: () => void) => done())),
}));

vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn(() => ({ sendMail: vi.fn() })) },
  createTransport: vi.fn(() => ({ sendMail: vi.fn() })),
}));

vi.mock('../../modules/notifications/notification.service.js', () => ({
  NotificationService: vi.fn().mockImplementation(function (this: any) {
    this.send = mockSend;
    this.sendBulk = mockSendBulk;
  }),
}));

vi.mock('../../modules/notifications/notification.repository.js', () => ({
  NotificationRepository: vi.fn().mockImplementation(function (this: any) {
    this.listForUser = mockListForUser;
    this.getUnreadCount = mockGetUnreadCount;
    this.markAsRead = mockMarkAsRead;
    this.markAllAsRead = mockMarkAllAsRead;
    this.create = vi.fn();
    this.updateStatus = vi.fn();
    this.findByUserId = vi.fn();
  }),
}));

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import { notificationRoutes } from '../../modules/notifications/notification.routes.js';
import { NotificationErrorCode } from '../../types/core-services.types.js';
// NotificationService mock handle — needed to re-apply implementation after vi.clearAllMocks()
const MockNotificationService = NotificationService as unknown as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Fake server builder
// ---------------------------------------------------------------------------

type Handler = (req: any, reply: any) => Promise<any>;

function buildFakeServer() {
  const routes: Map<string, Map<string, Handler>> = new Map();

  const server: any = {
    addHook: vi.fn(),
    post: (path: string, _opts: any, handler: Handler) => {
      if (!routes.has('POST')) routes.set('POST', new Map());
      routes.get('POST')!.set(path, handler);
    },
    get: (path: string, _opts: any, handler: Handler) => {
      if (!routes.has('GET')) routes.set('GET', new Map());
      routes.get('GET')!.set(path, handler);
    },
    patch: (path: string, _opts: any, handler: Handler) => {
      if (!routes.has('PATCH')) routes.set('PATCH', new Map());
      routes.get('PATCH')!.set(path, handler);
    },
    delete: (path: string, _opts: any, handler: Handler) => {
      if (!routes.has('DELETE')) routes.set('DELETE', new Map());
      routes.get('DELETE')!.set(path, handler);
    },
  };

  return {
    server,
    getHandler: (method: string, path: string): Handler => {
      const handler = routes.get(method.toUpperCase())?.get(path);
      if (!handler) throw new Error(`No handler registered for ${method} ${path}`);
      return handler;
    },
  };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TENANT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-000000000001'; // valid UUIDv4 required by NotificationSchema (Zod v4 strict)
const USER_ID = 'user-notif-1';

function makeRequest(overrides: any = {}): Partial<FastifyRequest> {
  return {
    user: { id: USER_ID, tenantId: TENANT_ID } as any,
    headers: { authorization: 'Bearer test-token' },
    params: {},
    query: {},
    body: {},
    log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() } as any,
    ...overrides,
  };
}

function makeReply() {
  const reply: any = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  };
  return reply;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Notification API Routes', () => {
  let fakeServer: ReturnType<typeof buildFakeServer>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Re-apply constructor mock after vi.clearAllMocks() — clearAllMocks resets implementations
    MockNotificationService.mockImplementation(function (this: any) {
      this.send = mockSend;
      this.sendBulk = mockSendBulk;
    });

    // Safe defaults for every test
    mockSend.mockResolvedValue({ id: 'notif-1' });
    mockSendBulk.mockResolvedValue(undefined);
    mockListForUser.mockResolvedValue([]);
    mockGetUnreadCount.mockResolvedValue(0);
    mockMarkAsRead.mockResolvedValue({ id: 'notif-1', status: 'READ' });
    mockMarkAllAsRead.mockResolvedValue(3);

    fakeServer = buildFakeServer();
    await notificationRoutes(fakeServer.server, {} as any);
  });

  // -------------------------------------------------------------------------
  // Auth hook registration
  // -------------------------------------------------------------------------
  describe('Auth enforcement', () => {
    it('should register authMiddleware as a preHandler hook', () => {
      expect(fakeServer.server.addHook).toHaveBeenCalledWith('preHandler', expect.any(Function));
    });

    it('should throw when tenant context is missing from request', async () => {
      const handler = fakeServer.getHandler('POST', '/notifications');
      const req = makeRequest({ user: {} }); // no tenantId
      const reply = makeReply();

      await expect(handler(req, reply)).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // POST /notifications
  // -------------------------------------------------------------------------
  describe('POST /notifications', () => {
    it('should return 400 when body is invalid (missing required fields)', async () => {
      const handler = fakeServer.getHandler('POST', '/notifications');
      const req = makeRequest({ body: { invalidField: 'bad' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ code: 'VALIDATION_ERROR' }) })
      );
    });

    it('should send a notification and return 201', async () => {
      const notifResult = { id: 'notif-42', status: 'SENT' };
      mockSend.mockResolvedValue(notifResult);

      const handler = fakeServer.getHandler('POST', '/notifications');
      const req = makeRequest({
        body: { channel: 'IN_APP', userId: USER_ID, title: 'Hello', body: 'World' },
      });
      const reply = makeReply();

      await handler(req, reply);

      expect(mockSend).toHaveBeenCalled();
      expect(reply.code).toHaveBeenCalledWith(201);
      expect(reply.send).toHaveBeenCalledWith(notifResult);
    });

    it('should return 400 for INVALID_EMAIL error from service', async () => {
      mockSend.mockRejectedValue(
        Object.assign(new Error('Invalid email'), { code: NotificationErrorCode.INVALID_EMAIL })
      );

      const handler = fakeServer.getHandler('POST', '/notifications');
      const req = makeRequest({
        body: { channel: 'EMAIL', userId: USER_ID, title: 'Test', body: 'Body' },
      });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(400);
    });

    it('should return 500 on unexpected send failure', async () => {
      mockSend.mockRejectedValue(new Error('SMTP down'));

      const handler = fakeServer.getHandler('POST', '/notifications');
      const req = makeRequest({
        body: { channel: 'IN_APP', userId: USER_ID, title: 'Hi', body: 'Msg' },
      });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(500);
    });
  });

  // -------------------------------------------------------------------------
  // POST /notifications/bulk
  // -------------------------------------------------------------------------
  describe('POST /notifications/bulk', () => {
    it('should return 400 when body is not an array', async () => {
      const handler = fakeServer.getHandler('POST', '/notifications/bulk');
      const req = makeRequest({ body: { channel: 'IN_APP' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.objectContaining({ code: 'VALIDATION_ERROR' }) })
      );
    });

    it('should enqueue bulk notifications and return 202', async () => {
      const handler = fakeServer.getHandler('POST', '/notifications/bulk');
      const req = makeRequest({
        body: [
          { channel: 'IN_APP', userId: 'user-a', title: 'A', body: 'Msg A' },
          { channel: 'IN_APP', userId: 'user-b', title: 'B', body: 'Msg B' },
        ],
      });
      const reply = makeReply();

      await handler(req, reply);

      expect(mockSendBulk).toHaveBeenCalled();
      expect(reply.code).toHaveBeenCalledWith(202);
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ count: 2 }));
    });

    it('should return 500 on bulk send failure', async () => {
      mockSendBulk.mockRejectedValue(new Error('Queue unavailable'));

      const handler = fakeServer.getHandler('POST', '/notifications/bulk');
      const req = makeRequest({
        body: [{ channel: 'IN_APP', userId: 'user-a', title: 'X', body: 'Y' }],
      });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(500);
    });
  });

  // -------------------------------------------------------------------------
  // GET /notifications
  // -------------------------------------------------------------------------
  describe('GET /notifications', () => {
    it('should list notifications and return count + unreadCount', async () => {
      mockListForUser.mockResolvedValue([{ id: 'n1' }, { id: 'n2' }]);
      mockGetUnreadCount.mockResolvedValue(1);

      const handler = fakeServer.getHandler('GET', '/notifications');
      const req = makeRequest({ query: {} });
      const reply = makeReply();

      await handler(req, reply);

      expect(mockListForUser).toHaveBeenCalledWith(TENANT_ID, USER_ID, expect.any(Object));
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ count: 2, unreadCount: 1 })
      );
    });

    it('should pass unreadOnly=true when query.unread is "true"', async () => {
      const handler = fakeServer.getHandler('GET', '/notifications');
      const req = makeRequest({ query: { unread: 'true' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(mockListForUser).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        expect.objectContaining({ unreadOnly: true })
      );
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /notifications/:id/read
  // -------------------------------------------------------------------------
  describe('PATCH /notifications/:id/read', () => {
    it('should mark a notification as read and return updated notification', async () => {
      const updated = { id: 'notif-99', status: 'READ' };
      mockMarkAsRead.mockResolvedValue(updated);
      mockGetUnreadCount.mockResolvedValue(0);

      const handler = fakeServer.getHandler('PATCH', '/notifications/:id/read');
      const req = makeRequest({ params: { id: 'notif-99' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(mockMarkAsRead).toHaveBeenCalledWith('notif-99', TENANT_ID, USER_ID);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({ notification: updated, unreadCount: 0 })
      );
    });

    it('should return 404 when notification is not found', async () => {
      mockMarkAsRead.mockResolvedValue(null);

      const handler = fakeServer.getHandler('PATCH', '/notifications/:id/read');
      const req = makeRequest({ params: { id: 'missing-id' } });
      const reply = makeReply();

      await handler(req, reply);

      expect(reply.code).toHaveBeenCalledWith(404);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({ code: NotificationErrorCode.NOT_FOUND }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // POST /notifications/mark-all-read
  // -------------------------------------------------------------------------
  describe('POST /notifications/mark-all-read', () => {
    it('should mark all notifications as read and return count', async () => {
      mockMarkAllAsRead.mockResolvedValue(5);

      const handler = fakeServer.getHandler('POST', '/notifications/mark-all-read');
      const req = makeRequest({});
      const reply = makeReply();

      await handler(req, reply);

      expect(mockMarkAllAsRead).toHaveBeenCalledWith(TENANT_ID, USER_ID);
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ count: 5 }));
    });
  });
});
