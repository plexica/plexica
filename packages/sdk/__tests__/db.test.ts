// Unit tests for PluginDb (typed pg.Pool wrapper).
// Verifies lazy pool creation, query/queryOne, error handling, and close().

import { describe, expect, it, vi } from 'vitest';

const { PluginDb } = await import('../src/db.js');

import { DbAccessError } from '../src/errors.js';

describe('PluginDb', () => {
  it('getPool throws DbAccessError when pg fails to connect', async () => {
    const db = new PluginDb();
    vi.doMock('pg', () => ({
      Pool: vi.fn().mockImplementation(function () {
        const pool = {
          connect: vi.fn().mockRejectedValue(new Error('connection refused')),
          on: vi.fn(),
          end: vi.fn().mockResolvedValue(undefined),
          query: vi.fn(),
        };
        return pool;
      }),
    }));
    try {
      await expect(
        db.getPool('postgresql://invalid@localhost:9999/test'),
      ).rejects.toThrow('failed to connect');
    } finally {
      vi.doUnmock('pg');
    }
  });

  it('getPool returns the same pool on repeated calls (lazy singleton)', async () => {
    const mockPool = {
      connect: vi.fn().mockResolvedValue({ release: vi.fn() }),
      on: vi.fn(),
      end: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    vi.doMock('pg', () => ({
      Pool: vi.fn().mockImplementation(function () { return mockPool; }),
    }));
    try {
      const db = new PluginDb();
      const pool1 = await db.getPool('postgresql://test@localhost/test');
      const pool2 = await db.getPool('postgresql://test@localhost/test');
      expect(pool1).toBe(pool2);
      await db.close();
    } finally {
      vi.doUnmock('pg');
    }
  });

  it('query delegates to pool.query and returns rows', async () => {
    const mockPool = {
      connect: vi.fn().mockResolvedValue({ release: vi.fn() }),
      on: vi.fn(),
      end: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ rows: [{ id: 1 }, { id: 2 }] }),
    };
    vi.doMock('pg', () => ({
      Pool: vi.fn().mockImplementation(function () { return mockPool; }),
    }));
    try {
      const db = new PluginDb();
      const rows = await db.query(
        'postgresql://test@localhost/test',
        'SELECT * FROM t WHERE id = $1',
        [42],
      );
      expect(rows).toEqual([{ id: 1 }, { id: 2 }]);
      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM t WHERE id = $1',
        [42],
      );
      await db.close();
    } finally {
      vi.doUnmock('pg');
    }
  });

  it('queryOne returns the first row or null', async () => {
    const mockPool = {
      connect: vi.fn().mockResolvedValue({ release: vi.fn() }),
      on: vi.fn(),
      end: vi.fn().mockResolvedValue(undefined),
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    vi.doMock('pg', () => ({
      Pool: vi.fn().mockImplementation(function () { return mockPool; }),
    }));
    try {
      const db = new PluginDb();
      const row = await db.queryOne('postgresql://test@localhost/test', 'SELECT 1');
      expect(row).toEqual({ id: 1 });
      const empty = await db.queryOne('postgresql://test@localhost/test', 'SELECT 2');
      expect(empty).toBeNull();
      await db.close();
    } finally {
      vi.doUnmock('pg');
    }
  });

  it('close is safe to call when pool was never created', async () => {
    const db = new PluginDb();
    await expect(db.close()).resolves.toBeUndefined();
  });

  it('close is idempotent', async () => {
    const mockPool = {
      connect: vi.fn().mockResolvedValue({ release: vi.fn() }),
      on: vi.fn(),
      end: vi.fn().mockResolvedValue(undefined),
      query: vi.fn(),
    };
    vi.doMock('pg', () => ({
      Pool: vi.fn().mockImplementation(function () { return mockPool; }),
    }));
    try {
      const db = new PluginDb();
      await db.getPool('postgresql://test@localhost/test');
      await db.close();
      await db.close();
      expect(mockPool.end).toHaveBeenCalledTimes(1);
    } finally {
      vi.doUnmock('pg');
    }
  });

  it('registers an error handler on the pool', async () => {
    let capturedHandler: ((err: Error) => void) | undefined;
    const mockPool = {
      connect: vi.fn().mockResolvedValue({ release: vi.fn() }),
      on: vi.fn((event: string, handler: (err: Error) => void) => {
        if (event === 'error') capturedHandler = handler;
      }),
      end: vi.fn().mockResolvedValue(undefined),
      query: vi.fn(),
    };
    vi.doMock('pg', () => ({
      Pool: vi.fn().mockImplementation(function () { return mockPool; }),
    }));
    const onError = vi.fn();
    try {
      const db = new PluginDb({ onError });
      await db.getPool('postgresql://test@localhost/test');
      expect(capturedHandler).toBeDefined();
      const testErr = new Error('idle client');
      capturedHandler?.(testErr);
      expect(onError).toHaveBeenCalledWith(testErr);
      await db.close();
    } finally {
      vi.doUnmock('pg');
    }
  });

  it('DbAccessError has correct code', () => {
    const err = new DbAccessError('test');
    expect(err.code).toBe('DB_ACCESS_ERROR');
    expect(err.message).toContain('test');
  });
});
