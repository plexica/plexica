// storage-env-guard.test.ts
// Unit tests for the storage env fail-fast guard (FR-004, US-002). The
// canonical stale-key list is mirrored VERBATIM from spec FR-004 (also the
// source map in storage-env-guard.ts) — no additions, no subtractions.

import { describe, expect, it } from 'vitest';

import { assertNoStaleStorageEnv } from '../../lib/storage-env-guard.js';

const STALE_TO_REPLACEMENT: Record<string, string> = {
  MINIO_ENDPOINT: 'STORAGE_ENDPOINT',
  MINIO_PUBLIC_ENDPOINT: 'STORAGE_PUBLIC_ENDPOINT',
  MINIO_ACCESS_KEY: 'STORAGE_ACCESS_KEY',
  MINIO_SECRET_KEY: 'STORAGE_SECRET_KEY',
  MINIO_PORT: 'STORAGE_PORT',
  MINIO_CONSOLE_PORT: 'STORAGE_CONSOLE_PORT',
  MINIO_HOST_URL: 'STORAGE_HOST_URL',
  SILO_ENDPOINT: 'STORAGE_ENDPOINT',
  SILO_PUBLIC_ENDPOINT: 'STORAGE_PUBLIC_ENDPOINT',
  SILO_ACCESS_KEY: 'STORAGE_ACCESS_KEY',
  SILO_SECRET_KEY: 'STORAGE_SECRET_KEY',
  SILO_PORT: 'STORAGE_PORT',
  SILO_CONSOLE_PORT: 'STORAGE_CONSOLE_PORT',
  SILO_HOST_URL: 'STORAGE_HOST_URL',
};

describe('storage env fail-fast guard', () => {
  it('rejects each stale MINIO_* key naming its STORAGE_* replacement', () => {
    const minioKeys = Object.keys(STALE_TO_REPLACEMENT).filter((key) => key.startsWith('MINIO_'));
    for (const staleKey of minioKeys) {
      expect(() => assertNoStaleStorageEnv({ [staleKey]: 'set' })).toThrow(
        new RegExp(`${staleKey} -> ${STALE_TO_REPLACEMENT[staleKey]}`)
      );
    }
  });

  it('rejects each stale SILO_* key naming its STORAGE_* replacement', () => {
    const siloKeys = Object.keys(STALE_TO_REPLACEMENT).filter((key) => key.startsWith('SILO_'));
    for (const staleKey of siloKeys) {
      expect(() => assertNoStaleStorageEnv({ [staleKey]: 'set' })).toThrow(
        new RegExp(`${staleKey} -> ${STALE_TO_REPLACEMENT[staleKey]}`)
      );
    }
  });

  it('aggregates every stale key with its replacement into a single error', () => {
    let error: Error | undefined;
    try {
      assertNoStaleStorageEnv({ MINIO_ENDPOINT: 'set', SILO_ACCESS_KEY: 'set', MINIO_PORT: '9000' });
    } catch (caught) {
      error = caught as Error;
    }
    expect(error?.message).toContain('MINIO_ENDPOINT -> STORAGE_ENDPOINT');
    expect(error?.message).toContain('SILO_ACCESS_KEY -> STORAGE_ACCESS_KEY');
    expect(error?.message).toContain('MINIO_PORT -> STORAGE_PORT');
  });

  it('does not reject MINIO_ROOT_USER / MINIO_ROOT_PASSWORD compose mapping targets', () => {
    expect(() =>
      assertNoStaleStorageEnv({ MINIO_ROOT_USER: 'storageadmin', MINIO_ROOT_PASSWORD: 'secret' })
    ).not.toThrow();
  });

  it('rejects a stale MINIO_ENDPOINT set to an empty string', () => {
    expect(() => assertNoStaleStorageEnv({ MINIO_ENDPOINT: '' })).toThrow(
      /MINIO_ENDPOINT -> STORAGE_ENDPOINT/
    );
  });

  it('accepts a clean environment with only STORAGE_* keys', () => {
    expect(() =>
      assertNoStaleStorageEnv({
        STORAGE_ENDPOINT: 'http://localhost:9000',
        STORAGE_PUBLIC_ENDPOINT: 'http://localhost:9000',
        STORAGE_ACCESS_KEY: 'access',
        STORAGE_SECRET_KEY: 'secret',
      })
    ).not.toThrow();
  });
});