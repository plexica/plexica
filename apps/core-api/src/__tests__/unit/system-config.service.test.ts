/**
 * Unit tests for SystemConfigService (T008-12)
 *
 * Tests business logic in isolation — db is injected as a mock.
 * No real database connection is required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SystemConfigService,
  SystemConfigNotFoundError,
} from '../../services/system-config.service.js';
import type { PrismaClient } from '@plexica/database';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = new Date('2026-01-01T00:00:00.000Z');

function makeRecord(
  overrides: Partial<{
    key: string;
    value: unknown;
    category: string;
    description: string | null;
    updatedBy: string | null;
    updatedAt: Date;
    createdAt: Date;
  }> = {}
) {
  return {
    key: 'my.key',
    value: 'my-value',
    category: 'general',
    description: null,
    updatedBy: null,
    updatedAt: NOW,
    createdAt: NOW,
    ...overrides,
  };
}

function makeMockDb() {
  return {
    systemConfig: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
  } as unknown as PrismaClient;
}

// ---------------------------------------------------------------------------
// get()
// ---------------------------------------------------------------------------

describe('SystemConfigService.get', () => {
  let db: ReturnType<typeof makeMockDb>;
  let service: SystemConfigService;

  beforeEach(() => {
    db = makeMockDb();
    service = new SystemConfigService(db);
    vi.clearAllMocks();
  });

  it('should return the config item when the key exists', async () => {
    const record = makeRecord({ key: 'feature.flag', value: true });
    (db.systemConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(record);

    const result = await service.get('feature.flag');

    expect(result.key).toBe('feature.flag');
    expect(result.value).toBe(true);
    expect(result.category).toBe('general');
    expect(result.updatedAt).toBe(NOW);
    expect(db.systemConfig.findUnique).toHaveBeenCalledWith({ where: { key: 'feature.flag' } });
  });

  it('should throw SystemConfigNotFoundError when the key does not exist', async () => {
    (db.systemConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(service.get('missing.key')).rejects.toThrow(SystemConfigNotFoundError);
    await expect(service.get('missing.key')).rejects.toThrow(
      "System configuration key 'missing.key' not found"
    );
  });

  it('should expose code SYSTEM_CONFIG_NOT_FOUND on the error', async () => {
    (db.systemConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    try {
      await service.get('missing.key');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SystemConfigNotFoundError);
      expect((err as SystemConfigNotFoundError).code).toBe('SYSTEM_CONFIG_NOT_FOUND');
      expect((err as SystemConfigNotFoundError).statusCode).toBe(404);
    }
  });
});

// ---------------------------------------------------------------------------
// set()
// ---------------------------------------------------------------------------

describe('SystemConfigService.set', () => {
  let db: ReturnType<typeof makeMockDb>;
  let service: SystemConfigService;

  beforeEach(() => {
    db = makeMockDb();
    service = new SystemConfigService(db);
    vi.clearAllMocks();
  });

  it('should call upsert with the correct arguments', async () => {
    (db.systemConfig.upsert as ReturnType<typeof vi.fn>).mockResolvedValue(makeRecord());

    await service.set('my.key', 'my-value', 'admin-user-id');

    expect(db.systemConfig.upsert).toHaveBeenCalledOnce();
    expect(db.systemConfig.upsert).toHaveBeenCalledWith({
      where: { key: 'my.key' },
      create: {
        key: 'my.key',
        value: 'my-value',
        category: 'general',
        updatedBy: 'admin-user-id',
      },
      update: {
        value: 'my-value',
        updatedBy: 'admin-user-id',
      },
    });
  });

  it('should upsert with an object value', async () => {
    (db.systemConfig.upsert as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeRecord({ value: { nested: true } })
    );

    await service.set('my.obj', { nested: true }, 'admin-id');

    const call = (db.systemConfig.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.create.value).toEqual({ nested: true });
    expect(call.update.value).toEqual({ nested: true });
  });

  it('should re-throw errors from the database', async () => {
    const dbError = new Error('DB connection lost');
    (db.systemConfig.upsert as ReturnType<typeof vi.fn>).mockRejectedValue(dbError);

    await expect(service.set('my.key', 'v', 'admin')).rejects.toThrow('DB connection lost');
  });
});

// ---------------------------------------------------------------------------
// list()
// ---------------------------------------------------------------------------

describe('SystemConfigService.list', () => {
  let db: ReturnType<typeof makeMockDb>;
  let service: SystemConfigService;

  beforeEach(() => {
    db = makeMockDb();
    service = new SystemConfigService(db);
    vi.clearAllMocks();
  });

  it('should return all items when no category filter is provided', async () => {
    const records = [
      makeRecord({ key: 'a.key', category: 'auth' }),
      makeRecord({ key: 'b.key', category: 'general' }),
    ];
    (db.systemConfig.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(records);

    const result = await service.list();

    expect(result).toHaveLength(2);
    expect(result[0].key).toBe('a.key');
    expect(result[1].key).toBe('b.key');
    expect(db.systemConfig.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });
  });

  it('should filter by category when provided', async () => {
    const records = [makeRecord({ key: 'auth.timeout', category: 'auth' })];
    (db.systemConfig.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(records);

    const result = await service.list('auth');

    expect(result).toHaveLength(1);
    expect(db.systemConfig.findMany).toHaveBeenCalledWith({
      where: { category: 'auth' },
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });
  });

  it('should return an empty array when no records exist', async () => {
    (db.systemConfig.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await service.list();

    expect(result).toEqual([]);
  });

  it('should map all record fields correctly', async () => {
    const record = makeRecord({
      key: 'x',
      value: 42,
      category: 'limits',
      description: 'Max items',
      updatedBy: 'admin',
    });
    (db.systemConfig.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([record]);

    const [item] = await service.list();

    expect(item.key).toBe('x');
    expect(item.value).toBe(42);
    expect(item.category).toBe('limits');
    expect(item.description).toBe('Max items');
    expect(item.updatedBy).toBe('admin');
    expect(item.updatedAt).toBe(NOW);
    expect(item.createdAt).toBe(NOW);
  });
});

// ---------------------------------------------------------------------------
// getBoolean()
// ---------------------------------------------------------------------------

describe('SystemConfigService.getBoolean', () => {
  let db: ReturnType<typeof makeMockDb>;
  let service: SystemConfigService;

  beforeEach(() => {
    db = makeMockDb();
    service = new SystemConfigService(db);
    vi.clearAllMocks();
  });

  it('should return true for boolean true value', async () => {
    (db.systemConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeRecord({ value: true })
    );
    expect(await service.getBoolean('k')).toBe(true);
  });

  it('should return false for boolean false value', async () => {
    (db.systemConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeRecord({ value: false })
    );
    expect(await service.getBoolean('k')).toBe(false);
  });

  it('should coerce string "true" to true', async () => {
    (db.systemConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeRecord({ value: 'true' })
    );
    expect(await service.getBoolean('k')).toBe(true);
  });

  it('should coerce string "false" to false', async () => {
    (db.systemConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeRecord({ value: 'false' })
    );
    expect(await service.getBoolean('k')).toBe(false);
  });

  it('should coerce number 1 to true', async () => {
    (db.systemConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeRecord({ value: 1 })
    );
    expect(await service.getBoolean('k')).toBe(true);
  });

  it('should coerce number 0 to false', async () => {
    (db.systemConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeRecord({ value: 0 })
    );
    expect(await service.getBoolean('k')).toBe(false);
  });

  it('should return defaultValue when key is missing', async () => {
    (db.systemConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    expect(await service.getBoolean('missing', false)).toBe(false);
    expect(await service.getBoolean('missing', true)).toBe(true);
  });

  it('should throw SystemConfigNotFoundError when key is missing and no default', async () => {
    (db.systemConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(service.getBoolean('missing')).rejects.toThrow(SystemConfigNotFoundError);
  });
});

// ---------------------------------------------------------------------------
// getNumber()
// ---------------------------------------------------------------------------

describe('SystemConfigService.getNumber', () => {
  let db: ReturnType<typeof makeMockDb>;
  let service: SystemConfigService;

  beforeEach(() => {
    db = makeMockDb();
    service = new SystemConfigService(db);
    vi.clearAllMocks();
  });

  it('should return a numeric value', async () => {
    (db.systemConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeRecord({ value: 42 })
    );
    expect(await service.getNumber('k')).toBe(42);
  });

  it('should coerce a string number to number', async () => {
    (db.systemConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeRecord({ value: '99' })
    );
    expect(await service.getNumber('k')).toBe(99);
  });

  it('should throw when value is not a valid number (NaN)', async () => {
    (db.systemConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeRecord({ value: 'not-a-number' })
    );
    await expect(service.getNumber('k')).rejects.toThrow('is not a valid number');
  });

  it('should return defaultValue when key is missing', async () => {
    (db.systemConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    expect(await service.getNumber('missing', 10)).toBe(10);
  });

  it('should throw SystemConfigNotFoundError when key is missing and no default', async () => {
    (db.systemConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(service.getNumber('missing')).rejects.toThrow(SystemConfigNotFoundError);
  });
});
