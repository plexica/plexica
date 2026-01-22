// File: apps/core-api/src/services/minio-client.ts

import { Client } from 'minio';

export interface MinIOConfig {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
}

export interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
}

/**
 * MinIO Client Service
 * Handles S3-compatible object storage operations
 */
export class MinIOClientService {
  private client: Client;
  private readonly pluginBucket = 'plexica-plugins';
  private readonly tenantBucket = 'plexica-tenants';

  constructor(config: MinIOConfig) {
    this.client = new Client({
      endPoint: config.endPoint,
      port: config.port,
      useSSL: config.useSSL,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    });
  }

  /**
   * Initialize required buckets
   */
  async initialize(): Promise<void> {
    try {
      await this.ensureBucket(this.pluginBucket);

      await this.ensureBucket(this.tenantBucket);

      // Set CORS policy for plugin bucket
      await this.setPluginBucketPolicy();
    } catch (error) {
      console.error('MinIO initialization failed:', error);
      throw error;
    }
  }

  /**
   * Ensure a bucket exists, create if it doesn't
   */
  private async ensureBucket(bucketName: string): Promise<void> {
    try {
      const exists = await this.client.bucketExists(bucketName);

      if (!exists) {
        await this.client.makeBucket(bucketName, 'us-east-1');
      }
    } catch (error) {
      console.error(`MinIO error ensuring bucket ${bucketName}:`, error);
      throw error;
    }
  }

  /**
   * Set public read policy for plugin bucket
   */
  private async setPluginBucketPolicy(): Promise<void> {
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${this.pluginBucket}/*`],
        },
      ],
    };

    try {
      await this.client.setBucketPolicy(this.pluginBucket, JSON.stringify(policy));
    } catch (error) {
      console.error('MinIO failed to set bucket policy:', error);
      // Don't throw - policy might already be set
    }
  }

  /**
   * Upload a plugin bundle
   */
  async uploadPluginBundle(
    pluginId: string,
    version: string,
    fileName: string,
    buffer: Buffer,
    options?: UploadOptions
  ): Promise<string> {
    const objectName = `${pluginId}/${version}/${fileName}`;

    try {
      await this.client.putObject(this.pluginBucket, objectName, buffer, buffer.length, {
        'Content-Type': options?.contentType || 'application/octet-stream',
        ...options?.metadata,
      });

      return this.getPluginUrl(pluginId, version, fileName);
    } catch (error) {
      console.error('MinIO upload failed:', error);
      throw error;
    }
  }

  /**
   * Upload plugin files from a directory
   */
  async uploadPluginFiles(
    pluginId: string,
    version: string,
    files: Array<{ name: string; buffer: Buffer; contentType?: string }>
  ): Promise<string[]> {
    const urls: string[] = [];

    for (const file of files) {
      const url = await this.uploadPluginBundle(pluginId, version, file.name, file.buffer, {
        contentType: file.contentType,
      });
      urls.push(url);
    }

    return urls;
  }

  /**
   * Get plugin file URL
   */
  getPluginUrl(pluginId: string, version: string, fileName: string): string {
    // In production, this would use CDN URL
    // For dev, use MinIO direct URL
    const baseUrl = process.env.MINIO_PUBLIC_URL || 'http://localhost:9000';
    return `${baseUrl}/${this.pluginBucket}/${pluginId}/${version}/${fileName}`;
  }

  /**
   * Get plugin remote entry URL
   */
  getPluginRemoteEntryUrl(pluginId: string, version: string): string {
    return this.getPluginUrl(pluginId, version, 'remoteEntry.js');
  }

  /**
   * List plugin versions
   */
  async listPluginVersions(pluginId: string): Promise<string[]> {
    const versions: string[] = [];
    const prefix = `${pluginId}/`;

    try {
      const stream = this.client.listObjects(this.pluginBucket, prefix, true);

      for await (const obj of stream) {
        if (obj.name) {
          const parts = obj.name.split('/');
          if (parts.length >= 2) {
            const version = parts[1];
            if (!versions.includes(version)) {
              versions.push(version);
            }
          }
        }
      }

      return versions.sort().reverse(); // Latest first
    } catch (error) {
      console.error('[MinIO] Failed to list versions:', error);
      throw error;
    }
  }

  /**
   * Delete a plugin version
   */
  async deletePluginVersion(pluginId: string, version: string): Promise<void> {
    const prefix = `${pluginId}/${version}/`;

    try {
      const objectsList: string[] = [];
      const stream = this.client.listObjects(this.pluginBucket, prefix, true);

      for await (const obj of stream) {
        if (obj.name) {
          objectsList.push(obj.name);
        }
      }

      if (objectsList.length > 0) {
        await this.client.removeObjects(this.pluginBucket, objectsList);
      }
    } catch (error) {
      console.error('MinIO failed to delete version:', error);
      throw error;
    }
  }

  /**
   * Upload tenant file
   */
  async uploadTenantFile(
    tenantId: string,
    filePath: string,
    buffer: Buffer,
    options?: UploadOptions
  ): Promise<string> {
    const objectName = `${tenantId}/${filePath}`;

    try {
      await this.client.putObject(this.tenantBucket, objectName, buffer, buffer.length, {
        'Content-Type': options?.contentType || 'application/octet-stream',
        ...options?.metadata,
      });

      return objectName;
    } catch (error) {
      console.error('MinIO tenant file upload failed:', error);
      throw error;
    }
  }

  /**
   * Get presigned URL for tenant file download
   */
  async getTenantFileUrl(
    tenantId: string,
    filePath: string,
    expirySeconds = 3600
  ): Promise<string> {
    const objectName = `${tenantId}/${filePath}`;

    try {
      return await this.client.presignedGetObject(this.tenantBucket, objectName, expirySeconds);
    } catch (error) {
      console.error('[MinIO] Failed to generate presigned URL:', error);
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.listBuckets();
      return true;
    } catch (error) {
      console.error('[MinIO] Health check failed:', error);
      return false;
    }
  }
}

// Note: Singleton instance will be created after config is loaded
// Export a lazy getter to ensure config is loaded first
let _minioClient: MinIOClientService | null = null;

export function getMinioClient(): MinIOClientService {
  if (!_minioClient) {
    const { config } = require('../config');
    const [endPoint, port] = config.storageEndpoint.split(':');
    const minioConfig = {
      endPoint,
      port: parseInt(port || '9000'),
      useSSL: config.storageUseSsl,
      accessKey: config.storageAccessKey,
      secretKey: config.storageSecretKey,
    };
    _minioClient = new MinIOClientService(minioConfig);
  }
  return _minioClient;
}

// Backward compatible export
export const minioClient = {
  initialize: () => getMinioClient().initialize(),
  uploadPluginBundle: (
    pluginId: string,
    version: string,
    fileName: string,
    buffer: Buffer,
    options?: UploadOptions
  ) => getMinioClient().uploadPluginBundle(pluginId, version, fileName, buffer, options),
  uploadPluginFiles: (
    pluginId: string,
    version: string,
    files: Array<{ name: string; buffer: Buffer; contentType?: string }>
  ) => getMinioClient().uploadPluginFiles(pluginId, version, files),
  listPluginVersions: (pluginId: string) => getMinioClient().listPluginVersions(pluginId),
  deletePluginVersion: (pluginId: string, version: string) =>
    getMinioClient().deletePluginVersion(pluginId, version),
  getPluginRemoteEntryUrl: (pluginId: string, version: string) =>
    getMinioClient().getPluginRemoteEntryUrl(pluginId, version),
  healthCheck: () => getMinioClient().healthCheck(),
};
