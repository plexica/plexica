// minio-client.ts
// Thin MinIO client wrapper for tenant bucket lifecycle management.
// Bucket-per-tenant: private policy, isolated object storage.


import { Client as MinioClient } from 'minio';

import { config } from './config.js';
import { logger } from './logger.js';

import type { Readable } from 'node:stream';

function createMinioClient(): MinioClient {
  // Parse the full URL (e.g. "http://localhost:9000") so that the scheme,
  // host and port are extracted correctly. A naive split(':') would break
  // on the "http:" prefix, turning "http" into the hostname.
  const url = new URL(config.MINIO_ENDPOINT);
  const host = url.hostname;
  const port = url.port !== '' ? parseInt(url.port, 10) : url.protocol === 'https:' ? 443 : 80;
  const useSSL = url.protocol === 'https:';

  return new MinioClient({
    endPoint: host,
    port,
    useSSL,
    accessKey: config.MINIO_ACCESS_KEY,
    secretKey: config.MINIO_SECRET_KEY,
  });
}

// Singleton client instance
const minio = createMinioClient();

/**
 * Creates a new private bucket for a tenant.
 * Idempotent — succeeds if bucket already exists.
 */
export async function createBucket(bucketName: string): Promise<void> {
  const exists = await minio.bucketExists(bucketName);
  if (exists) {
    logger.debug({ bucketName }, 'MinIO bucket already exists');
    return;
  }

  await minio.makeBucket(bucketName);
  logger.info({ bucketName }, 'MinIO bucket created');
}

/**
 * Deletes a tenant bucket and all its objects.
 * Used during tenant provisioning rollback.
 */
export async function deleteBucket(bucketName: string): Promise<void> {
  const exists = await minio.bucketExists(bucketName);
  if (!exists) {
    logger.debug({ bucketName }, 'MinIO bucket does not exist — skip delete');
    return;
  }

  // Remove all objects before deleting the bucket
  const objectsList: string[] = [];
  await new Promise<void>((resolve, reject) => {
    const stream = minio.listObjects(bucketName, '', true);
    stream.on('data', (obj) => {
      if (obj.name !== undefined) objectsList.push(obj.name);
    });
    stream.on('end', resolve);
    stream.on('error', reject);
  });

  if (objectsList.length > 0) {
    await minio.removeObjects(bucketName, objectsList);
  }

  await minio.removeBucket(bucketName);
  logger.info({ bucketName }, 'MinIO bucket deleted');
}

/**
 * Uploads a user avatar to the tenant bucket.
 * Stored at key `avatars/{userId}`.
 * Returns the object key.
 */
export async function uploadAvatar(
  tenantSlug: string,
  userId: string,
  stream: Readable,
  mimeType: string,
  size: number
): Promise<string> {
  const bucketName = `tenant-${tenantSlug}`;
  const objectKey = `avatars/${userId}`;
  await minio.putObject(bucketName, objectKey, stream, size, { 'Content-Type': mimeType });
  logger.info({ bucketName, objectKey }, 'Avatar uploaded to MinIO');
  return objectKey;
}

/**
 * Uploads a tenant logo to the tenant bucket.
 * Stored at key `logo`.
 * Returns the object key.
 */
export async function uploadLogo(
  tenantSlug: string,
  stream: Readable,
  mimeType: string,
  size: number
): Promise<string> {
  const bucketName = `tenant-${tenantSlug}`;
  const objectKey = 'logo';
  await minio.putObject(bucketName, objectKey, stream, size, { 'Content-Type': mimeType });
  logger.info({ bucketName, objectKey }, 'Logo uploaded to MinIO');
  return objectKey;
}

/**
 * Returns a presigned GET URL valid for 1 hour (3600 seconds).
 */
export async function getPresignedReadUrl(bucketName: string, objectKey: string): Promise<string> {
  return minio.presignedGetObject(bucketName, objectKey, 3600);
}
