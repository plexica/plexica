// smoke-minio.test.ts
// Integration smoke test: MinIO bucket CRUD operations.
// Connects to real Docker MinIO — no mock client.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as Minio from 'minio';

import { config } from '../lib/config.js';

const TEST_BUCKET = 'plexica-smoke-test';
const TEST_OBJECT = 'smoke.txt';
const TEST_CONTENT = 'Plexica smoke test content';

describe('MinIO smoke test', () => {
  let client: Minio.Client;

  beforeAll(() => {
    const endpoint = new URL(config.MINIO_ENDPOINT);
    client = new Minio.Client({
      endPoint: endpoint.hostname,
      port: endpoint.port !== '' ? parseInt(endpoint.port, 10) : 9000,
      useSSL: endpoint.protocol === 'https:',
      accessKey: config.MINIO_ACCESS_KEY,
      secretKey: config.MINIO_SECRET_KEY,
    });
  });

  afterAll(async () => {
    // Cleanup: remove object and bucket
    try {
      await client.removeObject(TEST_BUCKET, TEST_OBJECT);
    } catch {
      // Ignore if already removed
    }
    try {
      await client.removeBucket(TEST_BUCKET);
    } catch {
      // Ignore if already removed
    }
  });

  it('creates a bucket', async () => {
    const exists = await client.bucketExists(TEST_BUCKET);
    if (!exists) {
      await client.makeBucket(TEST_BUCKET);
    }
    const nowExists = await client.bucketExists(TEST_BUCKET);
    expect(nowExists).toBe(true);
  });

  it('puts and retrieves an object', async () => {
    await client.putObject(TEST_BUCKET, TEST_OBJECT, TEST_CONTENT);

    const objects: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const stream = client.listObjects(TEST_BUCKET);
      stream.on('data', (obj) => { objects.push(obj.name ?? ''); });
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    expect(objects).toContain(TEST_OBJECT);
  });

  it('deletes the object', async () => {
    await client.removeObject(TEST_BUCKET, TEST_OBJECT);

    const objects: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const stream = client.listObjects(TEST_BUCKET);
      stream.on('data', (obj) => { objects.push(obj.name ?? ''); });
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    expect(objects).not.toContain(TEST_OBJECT);
  });
});
