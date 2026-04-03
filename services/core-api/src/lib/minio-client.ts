// minio-client.ts
// Thin MinIO client wrapper for tenant bucket lifecycle management.
// Bucket-per-tenant: private policy, isolated object storage.

import { Client as MinioClient } from 'minio';

import { config } from './config.js';
import { logger } from './logger.js';

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
